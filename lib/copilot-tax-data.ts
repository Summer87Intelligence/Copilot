import {
  computeProjectedCoverageForAgenda,
  loadCashflowEngineDataset,
  type ProjectedCoverageResult,
} from "@/lib/copilot-cashflow-engine";
import {
  getDocumentEvidenceUiLine,
  getObligationDocumentStatus,
} from "@/lib/copilot-document-intelligence";
import {
  DOCUMENT_RELATED_TABLE,
  getDocumentsByRelatedTable,
  type ProtoDocument,
} from "@/lib/copilot-documents-data";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCopilotDataset } from "@/lib/copilot-dataset-client";
import {
  selectProtoTaxObligationsActiveOrdered,
  selectProtoTaxPaymentsActiveOrdered,
} from "@/lib/data/proto-analytics-read-repository";

export type ProtoTaxObligation = {
  id: string;
  tax_type: string;
  period_label: string;
  due_date: string;
  estimated_amount: number;
  confirmed_amount: number | null;
  status: string;
  priority: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Si existe en BD, acota matching de pagos operativos a la misma empresa. */
  company_id?: string | null;
};

export type ProtoTaxPayment = {
  id: string;
  obligation_id: string;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  reference: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Campos mínimos para agenda ejecutiva en Inicio (sin notas ni timestamps). */
export type TaxAgendaItem = {
  id: string;
  tax_type: string;
  period_label: string;
  due_date: string;
  estimated_amount: number;
  confirmed_amount: number | null;
  status: string;
  priority: string;
  coverage_status: "covered" | "risk" | "critical";
  coverage_explanation: string;
};

function parseObligation(row: Record<string, unknown>): ProtoTaxObligation {
  return {
    id: String(row.id),
    tax_type: String(row.tax_type ?? ""),
    period_label: String(row.period_label ?? ""),
    due_date: String(row.due_date ?? ""),
    estimated_amount: Number(row.estimated_amount ?? 0),
    confirmed_amount:
      row.confirmed_amount == null ? null : Number(row.confirmed_amount),
    status: String(row.status ?? ""),
    priority: String(row.priority ?? ""),
    notes: row.notes == null ? null : String(row.notes),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    company_id:
      row.company_id == null || row.company_id === ""
        ? null
        : String(row.company_id),
  };
}

function parseAgendaItem(
  row: Record<string, unknown>,
  coverage: ProjectedCoverageResult
): TaxAgendaItem {
  return {
    id: String(row.id),
    tax_type: String(row.tax_type ?? ""),
    period_label: String(row.period_label ?? ""),
    due_date: String(row.due_date ?? ""),
    estimated_amount: Number(row.estimated_amount ?? 0),
    confirmed_amount:
      row.confirmed_amount == null ? null : Number(row.confirmed_amount),
    status: String(row.status ?? ""),
    priority: String(row.priority ?? ""),
    coverage_status: coverage.coverage_status,
    coverage_explanation: coverage.explanation,
  };
}

function parsePayment(row: Record<string, unknown>): ProtoTaxPayment {
  return {
    id: String(row.id),
    obligation_id: String(row.obligation_id ?? ""),
    payment_date: String(row.payment_date ?? ""),
    amount: Number(row.amount ?? 0),
    payment_method: row.payment_method == null ? null : String(row.payment_method),
    reference: row.reference == null ? null : String(row.reference),
    status: String(row.status ?? ""),
    notes: row.notes == null ? null : String(row.notes),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function getProtoTaxObligations(): Promise<ProtoTaxObligation[]>;
export async function getProtoTaxObligations(
  client: SupabaseClient,
  workspaceCompanyId?: string
): Promise<ProtoTaxObligation[]>;
export async function getProtoTaxObligations(
  client?: SupabaseClient,
  workspaceCompanyId?: string
): Promise<ProtoTaxObligation[]> {
  if (!client) {
    const { obligations } = await getCopilotDataset("active");
    return (obligations as Record<string, unknown>[]).map(parseObligation);
  }
  const { data, error } = await selectProtoTaxObligationsActiveOrdered(
    client,
    workspaceCompanyId
  );

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => parseObligation(row as Record<string, unknown>));
}

/** Obligaciones que aún pueden vincularse desde un pago operativo (excluye pagadas salvo edición puntual en UI). */
export function isTaxObligationOpenForLink(o: ProtoTaxObligation): boolean {
  return String(o.status ?? "").toLowerCase() !== "paid";
}

export async function getProtoTaxPayments(): Promise<ProtoTaxPayment[]>;
export async function getProtoTaxPayments(
  client: SupabaseClient,
  workspaceCompanyId?: string
): Promise<ProtoTaxPayment[]>;
export async function getProtoTaxPayments(
  client?: SupabaseClient,
  workspaceCompanyId?: string
): Promise<ProtoTaxPayment[]> {
  if (!client) {
    const { taxPayments } = await getCopilotDataset("active");
    return (taxPayments as Record<string, unknown>[]).map(parsePayment);
  }
  const { data, error } = await selectProtoTaxPaymentsActiveOrdered(
    client,
    workspaceCompanyId
  );

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => parsePayment(row as Record<string, unknown>));
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Obligaciones con vencimiento dentro de los próximos `days` días (no cerradas como pagadas). */
export async function getUpcomingTaxObligations(
  days = 45
): Promise<ProtoTaxObligation[]> {
  const all = await getProtoTaxObligations();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const startStr = toYmd(start);
  const endStr = toYmd(end);

  return all.filter((o) => {
    if (o.status === "paid") return false;
    const due = o.due_date.slice(0, 10);
    return due >= startStr && due <= endStr;
  });
}

/** Obligaciones vencidas o marcadas como overdue (excluye pagadas). */
export async function getOverdueTaxObligations(): Promise<ProtoTaxObligation[]>;
export async function getOverdueTaxObligations(
  client: SupabaseClient,
  workspaceCompanyId?: string
): Promise<ProtoTaxObligation[]>;
export async function getOverdueTaxObligations(
  client?: SupabaseClient,
  workspaceCompanyId?: string
): Promise<ProtoTaxObligation[]> {
  const all = client
    ? await getProtoTaxObligations(client, workspaceCompanyId)
    : await getProtoTaxObligations();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toYmd(today);

  return all.filter((o) => {
    if (o.status === "paid") return false;
    if (o.status === "overdue") return true;
    const due = o.due_date.slice(0, 10);
    return due < todayStr;
  });
}

export async function getTaxPaymentsByObligation(
  obligationId: string
): Promise<ProtoTaxPayment[]> {
  const oid = obligationId.trim();
  if (!oid) return [];
  const { taxPayments } = await getCopilotDataset("active");
  return (taxPayments as Record<string, unknown>[])
    .filter((row) => String(row.obligation_id ?? "") === oid)
    .map(parsePayment);
}

export async function getProtoTaxObligationById(
  id: string
): Promise<ProtoTaxObligation | null> {
  const wid = id.trim();
  if (!wid) return null;
  const { obligations } = await getCopilotDataset("all");
  const row = (obligations as Record<string, unknown>[]).find(
    (r) => String(r.id ?? "") === wid
  );
  if (!row) return null;
  return parseObligation(row);
}

/**
 * Agenda ejecutiva: obligaciones con vencimiento desde hoy hasta el día 15 del mes siguiente (inclusive).
 * Además incluye obligaciones abiertas ya vencidas (vencimiento anterior a hoy) para no perder foco fiscal.
 * Orden final: `due_date` ascendente.
 */
export async function getUpcomingTaxAgenda(): Promise<TaxAgendaItem[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYmd = toYmd(today);

  const y = today.getFullYear();
  const m = today.getMonth();
  const endWindow = new Date(y, m + 1, 15);
  const endYmd = toYmd(endWindow);

  const [dataset, { obligations }, fiscalDocs] = await Promise.all([
    loadCashflowEngineDataset(),
    getCopilotDataset("active"),
    getDocumentsByRelatedTable(DOCUMENT_RELATED_TABLE.taxObligation).catch(
      (): ProtoDocument[] => []
    ),
  ]);

  const obl = obligations as Record<string, unknown>[];
  const overdueRows = obl.filter((row) => {
    const due = String(row.due_date ?? "").slice(0, 10);
    if (!due || due >= todayYmd) return false;
    const st = String(row.status ?? "").toLowerCase();
    return st !== "paid";
  });
  const forwardRows = obl.filter((row) => {
    const due = String(row.due_date ?? "").slice(0, 10);
    return due >= todayYmd && due <= endYmd;
  });
  const mergedRows: Record<string, unknown>[] = [...overdueRows, ...forwardRows];

  const obligationInputs = mergedRows.map((row) => ({
    id: String(row.id),
    due_date: String(row.due_date ?? ""),
    estimated_amount: Number(row.estimated_amount ?? 0),
  }));

  const coverageById = computeProjectedCoverageForAgenda(
    obligationInputs,
    dataset
  );

  const byId = new Map<string, TaxAgendaItem>();
  for (const row of mergedRows) {
    const id = String(row.id);
    const cov =
      coverageById.get(id) ?? {
        available_cash: 0,
        expected_inflows: 0,
        expected_outflows: 0,
        projected_balance: -Number(row.estimated_amount ?? 0),
        coverage_status: "critical" as const,
        explanation: "No alcanza la caja proyectada",
      };
    byId.set(id, parseAgendaItem(row, cov));
  }

  const docsByObligationId = new Map<string, ProtoDocument[]>();
  for (const d of fiscalDocs) {
    const oid = d.related_id;
    const list = docsByObligationId.get(oid) ?? [];
    list.push(d);
    docsByObligationId.set(oid, list);
  }

  const enriched = [...byId.values()].map((item) => {
    const docs = docsByObligationId.get(item.id) ?? [];
    if (docs.length === 0) return item;
    const ctx = {
      id: item.id,
      due_date: item.due_date,
      status: item.status,
    };
    const docStatus = getObligationDocumentStatus(ctx, docs);
    const line = getDocumentEvidenceUiLine(ctx, docStatus).trim();
    const base = item.coverage_explanation.trim();
    return {
      ...item,
      coverage_explanation: base.length ? `${base} ${line}` : line,
    };
  });

  return enriched.sort((a, b) => a.due_date.localeCompare(b.due_date));
}
