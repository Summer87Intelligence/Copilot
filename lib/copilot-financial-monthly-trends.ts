/**
 * Evolución mensual operativa — agrupa facturas/recibos por mes y moneda.
 * Pendiente/vencido mensual histórico no disponible: se marca en metadata.
 */

import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";

export type FinancialMonthlyTrend = {
  month: string;
  label: string;
  currency: "UYU" | "USD";
  grossIssued: number;
  creditNotes: number;
  netIssued: number;
  collected: number;
  /** Siempre 0 — pendiente es snapshot actual, no histórico mensual. */
  pending: number;
  overdue: number;
};

export type MonthlyTrendsResult = {
  trends: FinancialMonthlyTrend[];
  /** true cuando no hay filas con actividad */
  isEmpty: boolean;
  pendingIsCurrentSnapshotOnly: true;
};

export type MonthlyTrendInvoiceInput = Record<string, unknown> & {
  issue_date?: unknown;
  total_amount?: unknown;
  currency_code?: unknown;
  zeta_metadata?: unknown;
  is_active?: unknown;
  status?: unknown;
};

export type MonthlyTrendReceiptInput = Record<string, unknown> & {
  receipt_date?: unknown;
  amount?: unknown;
  currency_code?: unknown;
  is_active?: unknown;
};

const VOIDED = new Set([
  "paid", "void", "voided", "canceled", "cancelled", "anulada", "anulado", "annulled", "annul",
]);

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ymd(v: unknown): string {
  const s = String(v ?? "").trim();
  return s.length >= 7 ? s.slice(0, 7) : "";
}

function normalizeCurrency(v: unknown): "UYU" | "USD" | null {
  const u = String(v ?? "").trim().toUpperCase();
  if (u === "UYU" || u === "USD") return u;
  return null;
}

function isActiveInvoice(row: MonthlyTrendInvoiceInput): boolean {
  if (row.is_active === false) return false;
  const st = String(row.status ?? "").toLowerCase();
  if (VOIDED.has(st)) return false;
  return true;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString("es-UY", { month: "short", year: "numeric" });
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function listRecentMonths(endYm: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    out.push(addMonths(endYm, -i));
  }
  return out;
}

type Acc = {
  grossIssued: number;
  creditNotes: number;
  collected: number;
};

function emptyAcc(): Acc {
  return { grossIssued: 0, creditNotes: 0, collected: 0 };
}

export function buildFinancialMonthlyTrends(input: {
  invoices: readonly MonthlyTrendInvoiceInput[];
  receipts: readonly MonthlyTrendReceiptInput[];
  asOfYmd: string;
  monthsBack?: number;
}): MonthlyTrendsResult {
  const monthsBack = input.monthsBack ?? 6;
  const endYm = input.asOfYmd.slice(0, 7);
  const monthKeys = listRecentMonths(endYm, monthsBack);
  const acc = new Map<string, Acc>();

  for (const ym of monthKeys) {
    for (const cur of ["UYU", "USD"] as const) {
      acc.set(`${ym}|${cur}`, emptyAcc());
    }
  }

  for (const inv of input.invoices) {
    if (!isActiveInvoice(inv)) continue;
    const ym = ymd(inv.issue_date);
    if (!ym || !monthKeys.includes(ym)) continue;
    const cur = normalizeCurrency(inv.currency_code);
    if (!cur) continue;
    const key = `${ym}|${cur}`;
    const bucket = acc.get(key) ?? emptyAcc();
    const amount = Math.abs(num(inv.total_amount));
    if (isCreditNoteFromMetadata(inv.zeta_metadata)) {
      bucket.creditNotes += amount;
    } else {
      bucket.grossIssued += amount;
    }
    acc.set(key, bucket);
  }

  for (const rec of input.receipts) {
    if (rec.is_active === false) continue;
    const ym = ymd(rec.receipt_date);
    if (!ym || !monthKeys.includes(ym)) continue;
    const cur = normalizeCurrency(rec.currency_code);
    if (!cur) continue;
    const key = `${ym}|${cur}`;
    const bucket = acc.get(key) ?? emptyAcc();
    bucket.collected += Math.abs(num(rec.amount));
    acc.set(key, bucket);
  }

  const trends: FinancialMonthlyTrend[] = [];
  for (const ym of monthKeys) {
    for (const cur of ["UYU", "USD"] as const) {
      const bucket = acc.get(`${ym}|${cur}`) ?? emptyAcc();
      const hasData =
        bucket.grossIssued > 0 ||
        bucket.creditNotes > 0 ||
        bucket.collected > 0;
      if (!hasData) continue;
      trends.push({
        month: ym,
        label: monthLabel(ym),
        currency: cur,
        grossIssued: round2(bucket.grossIssued),
        creditNotes: round2(bucket.creditNotes),
        netIssued: round2(Math.max(0, bucket.grossIssued - bucket.creditNotes)),
        collected: round2(bucket.collected),
        pending: 0,
        overdue: 0,
      });
    }
  }

  return {
    trends,
    isEmpty: trends.length === 0,
    pendingIsCurrentSnapshotOnly: true,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function filterTrendsByCurrency(
  trends: readonly FinancialMonthlyTrend[],
  currency: "UYU" | "USD"
): FinancialMonthlyTrend[] {
  return trends.filter((t) => t.currency === currency);
}

export function defaultTrendCurrency(trends: readonly FinancialMonthlyTrend[]): "UYU" | "USD" {
  const uyu = trends.filter((t) => t.currency === "UYU").length;
  const usd = trends.filter((t) => t.currency === "USD").length;
  if (uyu >= usd) return "UYU";
  return "USD";
}

export function maxTrendValue(trends: readonly FinancialMonthlyTrend[]): number {
  let max = 0;
  for (const t of trends) {
    max = Math.max(max, t.netIssued, t.collected, t.creditNotes, t.grossIssued);
  }
  return max || 1;
}
