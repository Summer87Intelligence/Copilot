/**
 * Evolución mensual operativa — agrupa facturas/recibos por mes y moneda.
 * Pendiente/vencido mensual histórico no disponible: se marca en metadata.
 */

import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import { dedupeZetaShadowInvoicesForReporting } from "@/lib/copilot-zeta-invoice-report-dedup";
import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import { isReceiptVoidLike } from "@/lib/copilot-receipts-utils";

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
  status?: unknown;
};

const VOIDED = new Set([
  "void", "voided", "canceled", "cancelled", "anulada", "anulado", "annulled", "annul",
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

  const dedupedInvoices = dedupeZetaShadowInvoicesForReporting(
    input.invoices as unknown as DataRow[]
  ) as unknown as readonly MonthlyTrendInvoiceInput[];

  for (const inv of dedupedInvoices) {
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
    if (isReceiptVoidLike(rec.status)) continue;
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
        netIssued: round2(bucket.grossIssued - bucket.creditNotes),
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

export type DailyTrend = {
  day: string;
  label: string;
  currency: "UYU" | "USD";
  netIssued: number;
  collected: number;
  creditNotes: number;
};

export function buildFinancialDailyTrends(input: {
  invoices: readonly MonthlyTrendInvoiceInput[];
  receipts: readonly MonthlyTrendReceiptInput[];
  asOfYmd: string;
  daysBack?: number;
}): { trends: DailyTrend[]; isEmpty: boolean } {
  const daysBack = input.daysBack ?? 7;
  const endDate = new Date(`${input.asOfYmd.slice(0, 10)}T12:00:00`);
  const days: string[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const acc = new Map<string, Acc>();
  for (const day of days) {
    for (const cur of ["UYU", "USD"] as const) {
      acc.set(`${day}|${cur}`, emptyAcc());
    }
  }

  for (const inv of input.invoices) {
    if (!isActiveInvoice(inv)) continue;
    const day = String(inv.issue_date ?? "").slice(0, 10);
    if (!days.includes(day)) continue;
    const cur = normalizeCurrency(inv.currency_code);
    if (!cur) continue;
    const key = `${day}|${cur}`;
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
    if (isReceiptVoidLike(rec.status)) continue;
    const day = String(rec.receipt_date ?? "").slice(0, 10);
    if (!days.includes(day)) continue;
    const cur = normalizeCurrency(rec.currency_code);
    if (!cur) continue;
    const key = `${day}|${cur}`;
    const bucket = acc.get(key) ?? emptyAcc();
    bucket.collected += Math.abs(num(rec.amount));
    acc.set(key, bucket);
  }

  const trends: DailyTrend[] = [];
  for (const day of days) {
    for (const cur of ["UYU", "USD"] as const) {
      const bucket = acc.get(`${day}|${cur}`) ?? emptyAcc();
      const hasData = bucket.grossIssued > 0 || bucket.creditNotes > 0 || bucket.collected > 0;
      if (!hasData) continue;
      const d = new Date(`${day}T12:00:00`);
      const label = d.toLocaleDateString("es-UY", { weekday: "short", day: "numeric" });
      trends.push({
        day,
        label,
        currency: cur,
        netIssued: round2(bucket.grossIssued - bucket.creditNotes),
        collected: round2(bucket.collected),
        creditNotes: round2(bucket.creditNotes),
      });
    }
  }

  return { trends, isEmpty: trends.length === 0 };
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

/** Corte mínimo de fecha para el dashboard de tendencias. No se muestran períodos anteriores. */
export const FINANCIAL_TRENDS_MIN_DATE = "2026-01-01";
export const FINANCIAL_TRENDS_MIN_YM = "2026-01";

// ─── Financial trend dashboard ────────────────────────────────────────────────

export type TrendPoint = {
  key: string;
  label: string;
  netSales: number;
  collections: number;
  creditNotes: number;
  collectionRate: number | null;
};

export type DashboardTotals = {
  netSales: number;
  collections: number;
  creditNotes: number;
  collectionRate: number | null;
};

export type FinancialTrendDashboard = {
  currency: "UYU" | "USD";
  period: "7d" | "1m" | "3m" | "6m" | "12m";
  points: TrendPoint[];
  totals: DashboardTotals;
  previousTotals: DashboardTotals | null;
  deltas: {
    netSalesPct: number | null;
    collectionsPct: number | null;
    creditNotesPct: number | null;
    collectionRatePoints: number | null;
  };
  best: {
    netSalesPeriod: { label: string; value: number } | null;
    collectionsPeriod: { label: string; value: number } | null;
    highestCreditNotesPeriod: { label: string; value: number } | null;
  };
  gap: {
    salesMinusCollections: number;
    label: string;
  };
  insights: string[];
};

function buildDailyKeyList(endYmd: string, count: number): string[] {
  const end = new Date(`${endYmd.slice(0, 10)}T12:00:00`);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function shortDayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString("es-UY", { day: "numeric", month: "short" });
}

function accumulateForKeys(
  invoices: readonly MonthlyTrendInvoiceInput[],
  receipts: readonly MonthlyTrendReceiptInput[],
  keySet: Set<string>,
  currency: "UYU" | "USD",
  invKeyFn: (inv: MonthlyTrendInvoiceInput) => string,
  recKeyFn: (rec: MonthlyTrendReceiptInput) => string,
): Map<string, Acc> {
  const acc = new Map<string, Acc>();
  for (const k of keySet) acc.set(k, emptyAcc());

  for (const inv of invoices) {
    if (!isActiveInvoice(inv)) continue;
    if (normalizeCurrency(inv.currency_code) !== currency) continue;
    const k = invKeyFn(inv);
    if (!keySet.has(k)) continue;
    const bucket = acc.get(k)!;
    const amount = Math.abs(num(inv.total_amount));
    if (isCreditNoteFromMetadata(inv.zeta_metadata)) {
      bucket.creditNotes += amount;
    } else {
      bucket.grossIssued += amount;
    }
  }

  for (const rec of receipts) {
    if (rec.is_active === false) continue;
    if (isReceiptVoidLike(rec.status)) continue;
    if (normalizeCurrency(rec.currency_code) !== currency) continue;
    const k = recKeyFn(rec);
    if (!keySet.has(k)) continue;
    const bucket = acc.get(k)!;
    bucket.collected += Math.abs(num(rec.amount));
  }

  return acc;
}

function sumAccMap(accMap: Map<string, Acc>): Acc {
  const total = emptyAcc();
  for (const b of accMap.values()) {
    total.grossIssued += b.grossIssued;
    total.creditNotes += b.creditNotes;
    total.collected += b.collected;
  }
  return total;
}

function accToTotals(a: Acc): DashboardTotals {
  const netSales = round2(a.grossIssued - a.creditNotes);
  return {
    netSales,
    collections: round2(a.collected),
    creditNotes: round2(a.creditNotes),
    collectionRate: netSales > 0 ? round2(a.collected / netSales) : null,
  };
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round2((current - previous) / previous);
}

function buildDashboardInsights(
  totals: DashboardTotals,
  previousTotals: DashboardTotals | null,
  best: FinancialTrendDashboard["best"],
  deltas: FinancialTrendDashboard["deltas"],
): string[] {
  const out: string[] = [];

  if (best.netSalesPeriod) {
    out.push(`El mejor período en ventas fue ${best.netSalesPeriod.label}.`);
  }

  if (totals.collectionRate !== null) {
    if (totals.collectionRate > 1) {
      out.push(
        "Los cobros superan las ventas del período — puede incluir recuperación de deuda anterior.",
      );
    } else if (totals.collectionRate >= 0.8) {
      out.push(
        `Cobros registrados / ventas ${Math.round(totals.collectionRate * 100)}% — saludable para el período.`,
      );
    } else {
      out.push(
        `Cobros registrados / ventas ${Math.round(totals.collectionRate * 100)}% — hay margen para mejorar la recuperación.`,
      );
    }
  }

  if (previousTotals !== null && deltas.netSalesPct !== null) {
    const sign = deltas.netSalesPct >= 0 ? "+" : "";
    out.push(
      `Ventas ${sign}${Math.round(deltas.netSalesPct * 100)}% vs el período anterior.`,
    );
  }

  if (totals.creditNotes > 0 && totals.netSales > 0) {
    const ncRatio = totals.creditNotes / (totals.creditNotes + totals.netSales);
    if (ncRatio > 0.1) {
      out.push("Hay ajustes de facturación relevantes en el período — conviene revisar devoluciones.");
    }
  }

  return out.slice(0, 4);
}

export function buildFinancialTrendDashboard(input: {
  invoices: readonly MonthlyTrendInvoiceInput[];
  receipts: readonly MonthlyTrendReceiptInput[];
  asOfYmd: string;
  period: "7d" | "1m" | "3m" | "6m" | "12m";
  currency: "UYU" | "USD";
}): FinancialTrendDashboard {
  const { invoices: rawInvoices, receipts, asOfYmd, period, currency } = input;
  const invoices = dedupeZetaShadowInvoicesForReporting(
    rawInvoices as unknown as DataRow[]
  ) as unknown as readonly MonthlyTrendInvoiceInput[];

  const useDaily = period === "7d" || period === "1m";
  const count =
    period === "7d" ? 7 : period === "1m" ? 30 : period === "3m" ? 3 : period === "6m" ? 6 : 12;

  const getKeys = (): { currentKeys: string[]; prevKeys: string[] } => {
    if (useDaily) {
      const curr = buildDailyKeyList(asOfYmd, count);
      const prevEndDate = new Date(`${curr[0]}T12:00:00`);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      const prev = buildDailyKeyList(prevEndDate.toISOString().slice(0, 10), count);
      return { currentKeys: curr, prevKeys: prev };
    }
    const endYm = asOfYmd.slice(0, 7);
    const curr = listRecentMonths(endYm, count);
    const prev = listRecentMonths(addMonths(endYm, -count), count);
    return { currentKeys: curr, prevKeys: prev };
  };

  const { currentKeys: rawCurrentKeys, prevKeys } = getKeys();

  // Apply min-date cutoff — exclude periods before FINANCIAL_TRENDS_MIN_DATE.
  const minKey = useDaily ? FINANCIAL_TRENDS_MIN_DATE : FINANCIAL_TRENDS_MIN_YM;
  const currentKeys = rawCurrentKeys.filter((k) => k >= minKey);
  // If any prevKey falls before the cutoff, the comparison period is unavailable.
  const prevKeysValid = prevKeys.length > 0 && prevKeys.every((k) => k >= minKey);

  const invKeyFn: (inv: MonthlyTrendInvoiceInput) => string = useDaily
    ? (inv) => String(inv.issue_date ?? "").slice(0, 10)
    : (inv) => String(inv.issue_date ?? "").slice(0, 7);

  const recKeyFn: (rec: MonthlyTrendReceiptInput) => string = useDaily
    ? (rec) => String(rec.receipt_date ?? "").slice(0, 10)
    : (rec) => String(rec.receipt_date ?? "").slice(0, 7);

  const currentAcc = accumulateForKeys(
    invoices, receipts, new Set(currentKeys), currency, invKeyFn, recKeyFn,
  );
  const prevAcc = prevKeysValid
    ? accumulateForKeys(invoices, receipts, new Set(prevKeys), currency, invKeyFn, recKeyFn)
    : new Map<string, Acc>();

  const currentSum = sumAccMap(currentAcc);
  const prevSum = prevKeysValid ? sumAccMap(prevAcc) : emptyAcc();
  const hasPrevData =
    prevKeysValid &&
    (prevSum.grossIssued > 0 || prevSum.creditNotes > 0 || prevSum.collected > 0);

  const totals = accToTotals(currentSum);
  const previousTotals = hasPrevData ? accToTotals(prevSum) : null;

  // Points — all current keys, including zeros
  const points: TrendPoint[] = currentKeys.map((k) => {
    const b = currentAcc.get(k) ?? emptyAcc();
    const netSales = round2(b.grossIssued - b.creditNotes);
    const collections = round2(b.collected);
    const creditNotes = round2(b.creditNotes);
    return {
      key: k,
      label: useDaily ? shortDayLabel(k) : monthLabel(k),
      netSales,
      collections,
      creditNotes,
      collectionRate: netSales > 0 ? round2(collections / netSales) : null,
    };
  });

  const deltas: FinancialTrendDashboard["deltas"] = {
    netSalesPct: previousTotals ? pctDelta(totals.netSales, previousTotals.netSales) : null,
    collectionsPct: previousTotals ? pctDelta(totals.collections, previousTotals.collections) : null,
    creditNotesPct:
      previousTotals && totals.creditNotes > 0
        ? pctDelta(totals.creditNotes, previousTotals.creditNotes)
        : null,
    collectionRatePoints:
      totals.collectionRate !== null && previousTotals?.collectionRate != null
        ? round2(totals.collectionRate - previousTotals.collectionRate)
        : null,
  };

  const withSales = points.filter((p) => p.netSales > 0);
  const withColl = points.filter((p) => p.collections > 0);
  const withNC = points.filter((p) => p.creditNotes > 0);

  const best: FinancialTrendDashboard["best"] = {
    netSalesPeriod: withSales.length
      ? (() => {
          const b = withSales.reduce((a, c) => (c.netSales > a.netSales ? c : a));
          return { label: b.label, value: b.netSales };
        })()
      : null,
    collectionsPeriod: withColl.length
      ? (() => {
          const b = withColl.reduce((a, c) => (c.collections > a.collections ? c : a));
          return { label: b.label, value: b.collections };
        })()
      : null,
    highestCreditNotesPeriod: withNC.length
      ? (() => {
          const b = withNC.reduce((a, c) => (c.creditNotes > a.creditNotes ? c : a));
          return { label: b.label, value: b.creditNotes };
        })()
      : null,
  };

  const salesMinusCollections = round2(totals.netSales - totals.collections);
  const gap: FinancialTrendDashboard["gap"] = {
    salesMinusCollections,
    label:
      salesMinusCollections > 0
        ? "Faltan cobrar"
        : salesMinusCollections < 0
          ? "Recuperaste deuda anterior"
          : "Ventas cobradas al día",
  };

  const insights = buildDashboardInsights(totals, previousTotals, best, deltas);

  return { currency, period, points, totals, previousTotals, deltas, best, gap, insights };
}
