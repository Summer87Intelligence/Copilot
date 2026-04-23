import type { DataRow } from "@/lib/copilot-data";

export type FinancialFlagLevel = "fresh" | "warning" | "stale";

export type DerivedFinancialFlags = {
  open_invoices_count: number;
  is_operationally_consistent: boolean;
  is_financially_closed: boolean;
  requires_external_validation: boolean;
  /** Coincide con `externalFinancialValidation` del input (validación externa persistida / declarada). */
  external_validated: boolean;
  /** Validación externa sí, pero aún hay facturas abiertas en esta vista: señal secundaria en UI. */
  external_validated_with_open_invoices: boolean;
  financial_state_label:
    | "not_closed"
    | "operationally_clear_pending_external_validation"
    | "closed_validated";
  data_freshness_level: FinancialFlagLevel;
  data_freshness_days: number | null;
};

function rowNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function daysFromYmd(ymd: string, nowYmd: string): number | null {
  const a = ymd.slice(0, 10);
  const b = nowYmd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const ta = new Date(`${a}T12:00:00.000Z`).getTime();
  const tb = new Date(`${b}T12:00:00.000Z`).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.max(0, Math.round((tb - ta) / 86400000));
}

function localTodayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isOpenInvoiceRow(row: DataRow): boolean {
  const st = String(row.status ?? "").toLowerCase();
  if (st === "paid" || st === "cancelled") return false;
  return rowNum(row.balance_amount) > 0;
}

export function deriveFinancialFlags(params: {
  invoices?: DataRow[];
  asOfDate?: string | null;
  externalFinancialValidation?: boolean;
  nowYmd?: string;
}): DerivedFinancialFlags {
  const invoices = params.invoices ?? [];
  const open = invoices.filter(isOpenInvoiceRow).length;
  const externalValidated = params.externalFinancialValidation === true;
  const today = params.nowYmd?.slice(0, 10) || localTodayYmd();
  const ageDays = params.asOfDate ? daysFromYmd(params.asOfDate, today) : null;
  const freshness: FinancialFlagLevel =
    ageDays == null ? "warning" : ageDays <= 1 ? "fresh" : ageDays <= 3 ? "warning" : "stale";
  const hasRecentSync = freshness === "fresh";
  const is_operationally_consistent = hasRecentSync;

  let financial_state_label: DerivedFinancialFlags["financial_state_label"];
  if (open > 0) {
    financial_state_label = "not_closed";
  } else if (externalValidated) {
    financial_state_label = "closed_validated";
  } else {
    financial_state_label = "operationally_clear_pending_external_validation";
  }

  const is_financially_closed = open === 0 && externalValidated;

  return {
    open_invoices_count: open,
    is_operationally_consistent,
    is_financially_closed,
    requires_external_validation: !externalValidated,
    external_validated: externalValidated,
    external_validated_with_open_invoices: open > 0 && externalValidated,
    financial_state_label,
    data_freshness_level: freshness,
    data_freshness_days: ageDays,
  };
}
