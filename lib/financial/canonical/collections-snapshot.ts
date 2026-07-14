import { buildCanonicalRegisteredCollectionsMetrics } from "./collections";
import { normalizeCurrency, roundMoney } from "./currency";
import { isActiveRow, isVoided, ymd } from "./internal";
import { buildCanonicalSalesMetrics } from "./sales";
import type {
  CanonicalFinancialContext,
  CanonicalInvoiceInput,
  CanonicalReceiptInput,
  FinancialCurrency,
  IsoDate,
} from "./types";

export type CanonicalCollectionsDiagnosticCode =
  | "missing_invoice_currency"
  | "missing_receipt_currency"
  | "invalid_receipt_date"
  | "invalid_receipt_amount"
  | "negative_applied_collections"
  | "applied_collection_rate_over_100"
  | "receipt_without_company"
  | "unsupported_receipt_status";

export type CanonicalCollectionsDiagnostic = {
  code: CanonicalCollectionsDiagnosticCode;
  count: number;
  currency?: FinancialCurrency;
};

export interface CanonicalAppliedCollectionsMetrics {
  currency: FinancialCurrency;
  issuedNetInPeriod: number;
  pendingBalanceAtCutoffForPeriodSales: number;
  appliedCollectionsAtCutoff: number;
  appliedCollectionRate: number | null;
}

export interface CanonicalRegisteredCollectionsMetricsExplicit {
  currency: FinancialCurrency;
  registeredCollectionsInPeriod: number;
  receiptCountInPeriod: number;
}

export interface CanonicalCollectionsSnapshotCurrency {
  currency: FinancialCurrency;
  applied: CanonicalAppliedCollectionsMetrics;
  registered: CanonicalRegisteredCollectionsMetricsExplicit;
}

export interface CanonicalCollectionsSnapshot {
  period: {
    from: IsoDate;
    to: IsoDate;
    cutoff: IsoDate;
  };
  byCurrency: CanonicalCollectionsSnapshotCurrency[];
  diagnostics: CanonicalCollectionsDiagnostic[];
}

export interface BuildCanonicalCollectionsSnapshotInput {
  context: CanonicalFinancialContext;
  invoices: readonly CanonicalInvoiceInput[];
  receipts: readonly CanonicalReceiptInput[];
}

function bump(
  counts: Map<string, CanonicalCollectionsDiagnostic>,
  code: CanonicalCollectionsDiagnosticCode,
  currency?: FinancialCurrency
): void {
  const key = currency ? `${code}:${currency}` : code;
  const current = counts.get(key);
  if (current) {
    current.count += 1;
    return;
  }
  counts.set(key, currency ? { code, currency, count: 1 } : { code, count: 1 });
}

function diagnosticsForInput(
  input: BuildCanonicalCollectionsSnapshotInput
): CanonicalCollectionsDiagnostic[] {
  const { context, invoices, receipts } = input;
  const counts = new Map<string, CanonicalCollectionsDiagnostic>();

  for (const inv of invoices) {
    if (!isActiveRow(inv.is_active) || isVoided(inv.status)) continue;
    const total = typeof inv.total_amount === "number" && Number.isFinite(inv.total_amount)
      ? Math.max(0, inv.total_amount)
      : 0;
    if (!(total > 0)) continue;
    if (normalizeCurrency(inv.currency_code) === null) bump(counts, "missing_invoice_currency");
  }

  for (const rec of receipts) {
    if (!isActiveRow(rec.is_active)) continue;
    if (isVoided(rec.status)) {
      bump(counts, "unsupported_receipt_status");
      continue;
    }

    const amount = rec.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      bump(counts, "invalid_receipt_amount");
      continue;
    }

    const currency = normalizeCurrency(rec.currency_code);
    if (currency === null) {
      bump(counts, "missing_receipt_currency");
      continue;
    }

    const receiptDate = ymd(rec.receipt_date);
    if (receiptDate === null) {
      bump(counts, "invalid_receipt_date", currency);
      continue;
    }
    if (receiptDate < context.minFinancialDate) continue;

    if (rec.company_id == null || String(rec.company_id).trim() === "") {
      bump(counts, "receipt_without_company", currency);
    }
  }

  return [...counts.values()];
}

function addComputedDiagnostics(
  diagnostics: CanonicalCollectionsDiagnostic[],
  currency: FinancialCurrency,
  issuedNet: number,
  pendingAtCutoff: number
): void {
  const rawApplied = roundMoney(issuedNet - pendingAtCutoff);
  if (rawApplied < -0.01) {
    diagnostics.push({
      code: "negative_applied_collections",
      currency,
      count: 1,
    });
  }

  if (issuedNet > 0 && rawApplied / issuedNet > 1.0001) {
    diagnostics.push({
      code: "applied_collection_rate_over_100",
      currency,
      count: 1,
    });
  }
}

export function buildCanonicalCollectionsSnapshot(
  input: BuildCanonicalCollectionsSnapshotInput
): CanonicalCollectionsSnapshot {
  const { context, invoices, receipts } = input;
  const diagnostics = diagnosticsForInput(input);

  const byCurrency = context.currencies.map((currency) => {
    const sales = buildCanonicalSalesMetrics(invoices, context, currency);
    const registered = buildCanonicalRegisteredCollectionsMetrics(
      receipts,
      context,
      currency
    );

    addComputedDiagnostics(
      diagnostics,
      currency,
      sales.issuedNet,
      sales.pendingAtCutoff
    );

    return {
      currency,
      applied: {
        currency,
        issuedNetInPeriod: sales.issuedNet,
        pendingBalanceAtCutoffForPeriodSales: sales.pendingAtCutoff,
        appliedCollectionsAtCutoff: sales.appliedCollected,
        appliedCollectionRate: sales.collectionRate,
      },
      registered: {
        currency,
        registeredCollectionsInPeriod: registered.registeredCollections,
        receiptCountInPeriod: registered.receiptCount,
      },
    };
  });

  return {
    period: {
      from: context.periodStart,
      to: context.periodEnd,
      cutoff: context.cutoffDate,
    },
    byCurrency,
    diagnostics,
  };
}
