export type SnapshotCurrencyCode = "UYU" | "USD";

export type SnapshotCurrencyTotals = {
  invoiced?: number;
  pending?: number;
  overdue?: number;
  // TODO Fase 3: collected requires currency_code on proto_receipts
  collected?: number;
  // TODO Fase 3: expenses requires currency_code on proto_payments
  expenses?: number;
  // TODO Fase 3: cashflow = collected - expenses
  cashflow?: number;
};

export type SnapshotCurrencyBreakdown = Partial<Record<SnapshotCurrencyCode, SnapshotCurrencyTotals>>;

export type CurrencyBreakdownInvoiceInput = {
  currency_code?: unknown;
  total_amount?: unknown;
  balance_amount?: unknown;
  due_date?: unknown;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ymd(v: unknown): string | null {
  if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  return null;
}

function normalizeCurrency(v: unknown): SnapshotCurrencyCode | null {
  if (typeof v !== "string") return null;
  const upper = v.trim().toUpperCase();
  if (upper === "UYU" || upper === "USD") return upper;
  return null;
}

export function emptyCurrencyTotals(): SnapshotCurrencyTotals {
  return { invoiced: 0, pending: 0, overdue: 0 };
}

export function mergeCurrencyTotals(
  a: SnapshotCurrencyTotals,
  b: SnapshotCurrencyTotals
): SnapshotCurrencyTotals {
  return {
    invoiced: (a.invoiced ?? 0) + (b.invoiced ?? 0),
    pending: (a.pending ?? 0) + (b.pending ?? 0),
    overdue: (a.overdue ?? 0) + (b.overdue ?? 0),
    ...(a.collected !== undefined || b.collected !== undefined
      ? { collected: (a.collected ?? 0) + (b.collected ?? 0) }
      : {}),
    ...(a.expenses !== undefined || b.expenses !== undefined
      ? { expenses: (a.expenses ?? 0) + (b.expenses ?? 0) }
      : {}),
    ...(a.cashflow !== undefined || b.cashflow !== undefined
      ? { cashflow: (a.cashflow ?? 0) + (b.cashflow ?? 0) }
      : {}),
  };
}

export function buildSnapshotCurrencyBreakdown(
  invoices: readonly CurrencyBreakdownInvoiceInput[],
  todayYmd: string
): SnapshotCurrencyBreakdown {
  const acc: Record<string, SnapshotCurrencyTotals> = {};

  for (const inv of invoices) {
    const currency = normalizeCurrency(inv.currency_code);
    if (!currency) continue;

    const totalAmount = num(inv.total_amount);
    const balance = num(inv.balance_amount);
    const dueDate = ymd(inv.due_date);
    const isOverdue = balance > 0 && dueDate !== null && dueDate < todayYmd;

    if (!acc[currency]) acc[currency] = emptyCurrencyTotals();
    acc[currency].invoiced = (acc[currency].invoiced ?? 0) + totalAmount;
    acc[currency].pending = (acc[currency].pending ?? 0) + balance;
    if (isOverdue) {
      acc[currency].overdue = (acc[currency].overdue ?? 0) + balance;
    }
  }

  return acc as SnapshotCurrencyBreakdown;
}

export function detectSnapshotCurrency(
  breakdown: SnapshotCurrencyBreakdown
): "UYU" | "USD" | "mixed" | "unspecified" {
  const keys = Object.keys(breakdown) as SnapshotCurrencyCode[];
  if (keys.length === 0) return "unspecified";
  if (keys.length === 1) return keys[0];
  return "mixed";
}

export function snapshotHasMixedCurrency(
  breakdown: SnapshotCurrencyBreakdown | undefined
): boolean {
  if (!breakdown) return false;
  return Object.keys(breakdown).length > 1;
}
