import { mapTaxObligationStatus, mapTaxTypeLabel } from "@/lib/copilot-format";
import {
  DOCUMENT_RELATED_TABLE,
  getDocumentsByRelatedTable,
  getDocumentsByRelatedTableForClient,
  type ProtoDocument,
} from "@/lib/copilot-documents-data";
import {
  getDocumentEvidenceUiLine,
  getObligationDocumentStatus,
  refineFiscalAlertPriorityWithDocuments,
} from "@/lib/copilot-document-intelligence";
import {
  getFinancialSnapshot,
  getFinancialSnapshotForApi,
} from "@/lib/copilot-financial-engine";
import {
  getProtoTaxObligations,
  getProtoTaxPayments,
  type ProtoTaxObligation,
  type ProtoTaxPayment,
} from "@/lib/copilot-tax-data";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FiscalAlertPriority = "critical" | "high" | "medium";

export type FiscalAlertCategory =
  | "fiscalidad"
  | "liquidez"
  | "cobertura"
  | "conciliacion";

/** Alertas fiscales y financieras predictivas (misma tarjeta en UI). */
export type FiscalAlertItem = {
  id: string;
  title: string;
  priority: FiscalAlertPriority;
  type: FiscalAlertCategory;
  summary: string;
  detail: string;
  /** Si hay obligación asociada, se puede abrir el cajón de respaldo fiscal. */
  obligationId: string | null;
};

const FISCAL_ALERT_PREFIX = "fiscal:";

/** Horizonte (días) para alertas medias: obligaciones lejanas no generan ruido. */
const MEDIUM_HORIZON_DAYS = 120;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addCalendarDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sumPaidForObligation(
  obligationId: string,
  payments: ProtoTaxPayment[]
): number {
  return payments.reduce((acc, p) => {
    if (p.obligation_id !== obligationId) return acc;
    if (p.status.toLowerCase() !== "paid") return acc;
    return acc + p.amount;
  }, 0);
}

function remainingOutflow(o: ProtoTaxObligation, paidTotal: number): number {
  return Math.max(0, o.estimated_amount - paidTotal);
}

function cashPressureNote(remaining: number, availableCash: number): string {
  if (remaining <= 0) {
    return "Sin saldo pendiente estimado respecto del monto de la obligación.";
  }
  if (remaining > availableCash) {
    return `Cruce con caja (${formatMoney(availableCash)}): el saldo pendiente supera la caja disponible — riesgo alto de tensionar tesorería si coincide con otros egresos.`;
  }
  if (remaining > availableCash * 0.5) {
    return `Cruce con caja (${formatMoney(availableCash)}): el saldo pendiente compromete más de la mitad de esa referencia.`;
  }
  return `Cruce con caja (${formatMoney(availableCash)}): el saldo pendiente es absorbible con la referencia actual, salvo otros pagos simultáneos.`;
}

function formatMoney(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

/**
 * Clasificación de prioridad de alerta fiscal (sin considerar caja).
 * - CRITICAL: vencida en sistema o vencimiento en hoy / mañana.
 * - HIGH: vence en ≤ 7 días o estado pendiente de liquidación.
 * - MEDIUM: resto de obligaciones abiertas “próximas” dentro del horizonte.
 */
export function classifyFiscalAlertPriority(
  o: ProtoTaxObligation,
  today: Date = startOfToday()
): FiscalAlertPriority | null {
  const st = o.status.toLowerCase();
  if (st === "paid") return null;

  const due = o.due_date.slice(0, 10);
  const throughTomorrow = ymd(addCalendarDays(today, 1));
  const throughWeek = ymd(addCalendarDays(today, 7));
  const horizonEnd = ymd(addCalendarDays(today, MEDIUM_HORIZON_DAYS));

  if (st === "overdue" || due <= throughTomorrow) {
    return "critical";
  }
  if (due <= throughWeek || st === "pending") {
    return "high";
  }
  if (due <= horizonEnd || st === "scheduled") {
    return "medium";
  }
  return null;
}

function buildFiscalAlert(
  o: ProtoTaxObligation,
  priority: FiscalAlertPriority,
  remaining: number,
  paidTotal: number,
  availableCash: number,
  documentEvidenceLine?: string
): FiscalAlertItem {
  const tipo = mapTaxTypeLabel(o.tax_type);
  const estado = mapTaxObligationStatus(o.status);
  const vence = o.due_date.slice(0, 10);
  const cashNote = cashPressureNote(remaining, availableCash);

  let title = `${tipo} · ${o.period_label}`;
  if (priority === "critical") {
    title += " — atención inmediata";
  } else if (priority === "high") {
    title += " — seguimiento prioritario";
  }

  const summary = `${estado}. Vence ${vence}. Saldo pendiente estimado ${formatMoney(remaining)} (estimado ${formatMoney(o.estimated_amount)}; acreditado ${formatMoney(paidTotal)}).`;

  const evidence = documentEvidenceLine?.trim();
  const detail = [
    o.notes?.trim() || `Obligación ${tipo} del período ${o.period_label}.`,
    cashNote,
    evidence,
    "Revisá calendario en Finanzas y coordiná con contaduría antes del vencimiento.",
  ]
    .filter((s): s is string => Boolean(s && s.length))
    .join(" ");

  return {
    id: `${FISCAL_ALERT_PREFIX}${o.id}`,
    title,
    priority,
    type: "fiscalidad",
    summary,
    detail,
    obligationId: o.id,
  };
}

const PRIORITY_RANK: Record<FiscalAlertPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

/**
 * Genera alertas fiscales automáticas a partir de obligaciones y pagos reales,
 * con cruce contra caja del motor financiero (`getFinancialSnapshot` / `getFinancialSnapshotForApi`).
 * Sin `client`: lecturas vía APIs `/api/copilot/*` (browser).
 * Con `client` + `workspaceCompanyId`: servidor con filtro explícito en `proto_documents`
 * (obligatorio con service role / PIN; ver `copilot-api-auth`).
 */
export async function getFiscalAlerts(): Promise<FiscalAlertItem[]>;
export async function getFiscalAlerts(
  client: SupabaseClient,
  workspaceCompanyId: string
): Promise<FiscalAlertItem[]>;
export async function getFiscalAlerts(
  client?: SupabaseClient,
  workspaceCompanyId?: string
): Promise<FiscalAlertItem[]> {
  const wid = workspaceCompanyId?.trim() ?? "";
  const [obligations, payments, snapshot, fiscalDocs] = await Promise.all(
    !client
      ? [
          getProtoTaxObligations(),
          getProtoTaxPayments(),
          getFinancialSnapshot(),
          getDocumentsByRelatedTable(DOCUMENT_RELATED_TABLE.taxObligation).catch(
            (): ProtoDocument[] => []
          ),
        ]
      : [
          getProtoTaxObligations(client),
          getProtoTaxPayments(client),
          getFinancialSnapshotForApi(client, wid),
          wid
            ? getDocumentsByRelatedTableForClient(
                client,
                DOCUMENT_RELATED_TABLE.taxObligation,
                wid
              ).catch((): ProtoDocument[] => [])
            : Promise.resolve([] as ProtoDocument[]),
        ]
  );
  const availableCash = snapshot.realized.cash_net;

  const docsByObligationId = new Map<string, ProtoDocument[]>();
  for (const d of fiscalDocs) {
    const oid = d.related_id;
    const list = docsByObligationId.get(oid) ?? [];
    list.push(d);
    docsByObligationId.set(oid, list);
  }

  const today = startOfToday();
  const out: FiscalAlertItem[] = [];

  for (const o of obligations) {
    const basePriority = classifyFiscalAlertPriority(o, today);
    if (basePriority == null) continue;

    const linkedDocs = docsByObligationId.get(o.id) ?? [];
    const priority =
      linkedDocs.length > 0
        ? refineFiscalAlertPriorityWithDocuments(basePriority, o, linkedDocs)
        : basePriority;
    if (priority == null) continue;

    const paidTotal = sumPaidForObligation(o.id, payments);
    const remaining = remainingOutflow(o, paidTotal);

    const docStatus = getObligationDocumentStatus(o, linkedDocs);
    const evidenceLine =
      linkedDocs.length > 0
        ? getDocumentEvidenceUiLine(o, docStatus)
        : undefined;

    out.push(
      buildFiscalAlert(
        o,
        priority,
        remaining,
        paidTotal,
        availableCash,
        evidenceLine
      )
    );
  }

  out.sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    return a.title.localeCompare(b.title, "es");
  });

  return out;
}

export function parseFiscalAlertId(alertId: string): string | null {
  if (!alertId.startsWith(FISCAL_ALERT_PREFIX)) return null;
  return alertId.slice(FISCAL_ALERT_PREFIX.length) || null;
}

export function isFiscalAlertId(alertId: string): boolean {
  return alertId.startsWith(FISCAL_ALERT_PREFIX);
}
