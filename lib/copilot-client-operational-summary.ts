/**
 * FASE 4 — Lectura de Copilot: heurísticas puras sin LLM.
 * Toma un snapshot del cliente y devuelve hints operacionales, acciones sugeridas y timeline.
 * Sin llamadas a Zeta, sin Supabase, sin side effects.
 */

import { todayYmdMontevideo } from "@/lib/date/summer87-today";

export type OperationalHintSeverity = "ok" | "info" | "warning" | "critical";

export type OperationalHint = {
  id: string;
  severity: OperationalHintSeverity;
  text: string;
  action?: string;
};

export type TimelineEventKind =
  | "invoice_issued"
  | "invoice_overdue"
  | "receipt"
  | "sync"
  | "contact_missing"
  | "contact_available";

export type TimelineEvent = {
  id: string;
  kind: TimelineEventKind;
  date: string;
  title: string;
  description?: string;
  amount?: number;
  currency?: string;
  severity: OperationalHintSeverity;
};

export type ClientOperationalSummaryInput = {
  saldo_pendiente: number;
  overdue_debt: number;
  overdue_uyu?: number;
  overdue_usd?: number;
  debt_uyu?: number;
  debt_usd?: number;
  receipts_count: number;
  receipts_last_date?: string | null;
  contacts_count: number;
  risk: "Bajo" | "Medio" | "Alto";
  has_mixed_currency?: boolean;
  invoices_count: number;
  last_sync_at?: string | null;
  today?: string; // injectable for testing
  invoices?: Array<{
    id: string;
    issue_date: string;
    due_date?: string | null;
    serie_numero: string;
    importe: number;
    balance: number;
    currency_code?: string | null;
  }>;
  receipts?: Array<{
    id: string;
    receipt_date: string;
    importe: number;
    medio?: string | null;
    currency_code?: string | null;
  }>;
  sync_rows?: Array<{
    resource_flow: string;
    label: string;
    last_success_at: string | null;
  }>;
};

export type ClientOperationalSummary = {
  riskHints: OperationalHint[];
  suggestedActions: string[];
  executiveSummary: string;
  timelineEvents: TimelineEvent[];
  missingDataHints: OperationalHint[];
};

/**
 * @deprecated CLIENT-DEBT-SEMANTICS-001 Etapa D: alias a `todayYmdMontevideo`.
 */
function localTodayYmd(): string {
  return todayYmdMontevideo();
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T12:00:00Z`).getTime();
  const b = new Date(`${toYmd}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function buildTimeline(
  input: ClientOperationalSummaryInput,
  today: string
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Invoice issued events (cap at 15 most recent)
  const sortedInvoices = [...(input.invoices ?? [])].sort((a, b) =>
    b.issue_date.localeCompare(a.issue_date)
  );
  for (const inv of sortedInvoices.slice(0, 15)) {
    if (!inv.issue_date || inv.issue_date === "—") continue;
    events.push({
      id: `invoice_issued_${inv.id}`,
      kind: "invoice_issued",
      date: inv.issue_date,
      title: `Comprobante emitido: ${inv.serie_numero}`,
      amount: inv.importe,
      currency: inv.currency_code ?? undefined,
      severity: "info",
    });
    // Mark as overdue if balance > 0 and due date passed
    if (inv.due_date && inv.due_date !== "—" && inv.balance > 0 && inv.due_date < today) {
      events.push({
        id: `invoice_overdue_${inv.id}`,
        kind: "invoice_overdue",
        date: inv.due_date,
        title: `Comprobante vencido: ${inv.serie_numero}`,
        description: "Saldo pendiente al vencimiento",
        amount: inv.balance,
        currency: inv.currency_code ?? undefined,
        severity: "critical",
      });
    }
  }

  // Receipt events (cap at 10)
  const sortedReceipts = [...(input.receipts ?? [])].sort((a, b) =>
    b.receipt_date.localeCompare(a.receipt_date)
  );
  for (const rec of sortedReceipts.slice(0, 10)) {
    if (!rec.receipt_date || rec.receipt_date === "—") continue;
    events.push({
      id: `receipt_${rec.id}`,
      kind: "receipt",
      date: rec.receipt_date,
      title: "Recibo de cobro registrado",
      description: rec.medio ?? undefined,
      amount: rec.importe,
      currency: rec.currency_code ?? undefined,
      severity: "ok",
    });
  }

  // Sync events — 1 per unique resource (most recent)
  const seenFlows = new Set<string>();
  const sortedSync = [...(input.sync_rows ?? [])].sort((a, b) => {
    const ta = a.last_success_at ?? "";
    const tb = b.last_success_at ?? "";
    return tb.localeCompare(ta);
  });
  for (const sync of sortedSync) {
    if (!sync.last_success_at || seenFlows.has(sync.resource_flow)) continue;
    seenFlows.add(sync.resource_flow);
    const d = sync.last_success_at.slice(0, 10);
    const ageH = daysBetween(d, today) * 24;
    events.push({
      id: `sync_${sync.resource_flow}`,
      kind: "sync",
      date: d,
      title: `Sync Zeta: ${sync.label}`,
      severity: ageH > 48 ? "warning" : "ok",
    });
  }

  // Sort descending by date
  events.sort((a, b) => b.date.localeCompare(a.date));
  return events.slice(0, 20);
}

export function buildClientOperationalSummary(
  input: ClientOperationalSummaryInput
): ClientOperationalSummary {
  const today = input.today ?? localTodayYmd();

  const riskHints: OperationalHint[] = [];
  const missingDataHints: OperationalHint[] = [];
  const suggestedActionsSet = new Set<string>();

  // 1. Debt + overdue status
  if (input.saldo_pendiente <= 0) {
    riskHints.push({
      id: "no_debt",
      severity: "ok",
      text: "Cliente sin saldo pendiente.",
    });
  } else if (input.overdue_debt > 0) {
    riskHints.push({
      id: "overdue_debt",
      severity: "critical",
      text: "Cliente con saldo vencido. Priorizar seguimiento de cobranza.",
      action: "Revisar comprobantes vencidos",
    });
    suggestedActionsSet.add("Priorizar contacto de cobranza");
  } else {
    riskHints.push({
      id: "open_debt",
      severity: "info",
      text: "Cliente con facturas abiertas, sin saldo vencido.",
    });
  }

  // 2. Recent receipts check (60d window)
  const daysSinceReceipt =
    input.receipts_last_date
      ? daysBetween(input.receipts_last_date, today)
      : 9999;
  if (input.saldo_pendiente > 0 && (input.receipts_count === 0 || daysSinceReceipt > 60)) {
    riskHints.push({
      id: "no_recent_receipts",
      severity: "warning",
      text: "No se registran cobros recientes (60d); revisar seguimiento.",
      action: "Verificar seguimiento de cobros",
    });
    suggestedActionsSet.add("Verificar seguimiento de cobros");
  }

  // 3. Multi-currency
  if (input.has_mixed_currency) {
    riskHints.push({
      id: "multi_currency",
      severity: "info",
      text: "Cliente opera en múltiples monedas (UYU y USD).",
    });
  }

  // 4. High risk
  if (input.risk === "Alto") {
    riskHints.push({
      id: "high_risk",
      severity: "critical",
      text: "Riesgo de cartera alto por monto vencido o concentración.",
      action: "Revisar alertas de cartera",
    });
    suggestedActionsSet.add("Revisar alertas de cartera");
  } else if (input.risk === "Medio") {
    riskHints.push({
      id: "medium_risk",
      severity: "warning",
      text: "Riesgo de cartera medio. Monitorear vencimientos próximos.",
    });
  }

  // 5. No contacts
  if (input.contacts_count === 0) {
    missingDataHints.push({
      id: "no_contacts",
      severity: "warning",
      text: "No hay contactos registrados para coordinar cobranzas.",
      action: "Registrar contacto comercial",
    });
    suggestedActionsSet.add("Registrar contacto comercial");
  }

  // 6. Stale sync
  if (input.last_sync_at) {
    const ageD = daysBetween(input.last_sync_at.slice(0, 10), today);
    if (ageD > 2) {
      missingDataHints.push({
        id: "stale_sync",
        severity: "warning",
        text: `Última sincronización Zeta hace más de ${ageD} días. Datos pueden estar desactualizados.`,
      });
    }
  } else {
    missingDataHints.push({
      id: "no_sync",
      severity: "info",
      text: "No hay registro de sincronización Zeta para este workspace.",
    });
  }

  // Cap riskHints at 5
  const cappedHints = riskHints.slice(0, 5);

  // Executive summary
  let executiveSummary: string;
  if (input.saldo_pendiente <= 0) {
    executiveSummary = "Cliente sin deuda activa. Perfil de bajo riesgo operacional.";
  } else if (input.risk === "Alto") {
    executiveSummary =
      "Cliente con riesgo alto de cartera. Requiere atención prioritaria de cobranza.";
  } else if (input.overdue_debt > 0) {
    executiveSummary =
      "Cliente con saldo vencido. Gestión de cobranza activa recomendada.";
  } else {
    executiveSummary =
      "Cliente con deuda activa dentro de plazo. Seguimiento estándar.";
  }

  const timelineEvents = buildTimeline(input, today);

  return {
    riskHints: cappedHints,
    suggestedActions: Array.from(suggestedActionsSet).slice(0, 4),
    executiveSummary,
    timelineEvents,
    missingDataHints,
  };
}
