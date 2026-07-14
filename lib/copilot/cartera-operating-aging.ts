/**
 * CARTERA OPERATING AGING — payload serializable derivado del snapshot canónico.
 *
 * FASE 1C: Cartera (cards, explorer, tabla, top deudores) consume ESTA vista
 * operativa por `due_date` (buckets Al día / 1–7 / 8–14 / 15–30 / +30), NO los
 * buckets contables `0_30/31_60/61_90/90_plus` del motor de reconciliación.
 *
 * Es una proyección liviana de `buildCanonicalDebtSnapshot` (sin `units`) apta
 * para serializar al cliente. Un único snapshot por request.
 *
 * Separación explícita:
 *   - contable (reconciliation `agingByCurrency`): auditoría / reconciliación interna.
 *   - operativo (este módulo): gestión de cobranza (Cartera / Cliente 360 / Hoy / Deudores).
 */

import { buildCanonicalDebtSnapshot } from "@/lib/financial/canonical/snapshot";
import { buildCanonicalFinancialContext } from "@/lib/financial/canonical/report-context";
import { roundMoney } from "@/lib/financial/canonical/currency";
import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";
import {
  classifyOperatingDelay,
  OPERATING_DELAY_BUCKET_ORDER,
  type OperatingDelayBucket,
} from "@/lib/copilot/operating-aging";
import type { CanonicalDebtUnit } from "@/lib/financial/canonical/types";
import type {
  CanonicalDebtCurrencyBlock,
  CanonicalDebtDiagnosticCode,
  CanonicalInstallmentInput,
  CanonicalInvoiceInput,
  FinancialCurrency,
} from "@/lib/financial/canonical/types";

export type CarteraOperatingAgingBucketsView = {
  current: number;
  overdue1To7: number;
  overdue8To14: number;
  overdue15To30: number;
  overdue31Plus: number;
};

/** Fila de bucket operativo lista para render (barras de Cartera). */
export type CarteraOperatingAgingBucketRow = {
  bucket: OperatingDelayBucket;
  amount: number;
  /** Facturas únicas que aportan al bucket. Una factura con varias cuotas cuenta una vez por bucket. */
  invoiceCount: number;
  /** Unidades vencibles atómicas (factura o cuota). Solo para auditoría/diagnóstico. */
  debtUnitCount: number;
  clientCount: number;
  /** Fracción [0..1] sobre el saldo clasificable (excluye sin vencimiento). */
  percentage: number;
};

export type CarteraOperatingAgingCurrency = {
  currency: FinancialCurrency;
  pendingBalance: number;
  currentBalance: number;
  overdueBalance: number;
  /** Saldo pendiente sin `due_date` válido: no clasificable por atraso. */
  unclassifiedDueDateBalance: number;
  aging: CarteraOperatingAgingBucketsView;
  /** Filas de bucket (5) con montos, conteos y %, para las barras. */
  buckets: CarteraOperatingAgingBucketRow[];
  pendingClients: number;
  overdueClients: number;
};

export type CarteraOperatingAgingCompanyCurrency = {
  currency: FinancialCurrency;
  pendingBalance: number;
  overdueBalance: number;
  currentBalance: number;
  unclassifiedDueDateBalance: number;
  /** Bucket dominante por monto (para badges del explorer). `null` si sin saldo. */
  dominantBucket: OperatingDelayBucket | null;
};

export type CarteraOperatingAgingCompany = {
  companyId: string;
  byCurrency: CarteraOperatingAgingCompanyCurrency[];
};

export type CarteraOperatingAging = {
  cutoffDate: string;
  byCurrency: CarteraOperatingAgingCurrency[];
  byCompany: CarteraOperatingAgingCompany[];
  /** Unión de clientes con atraso en cualquier moneda. */
  overdueClientsAnyCurrency: number;
  diagnosticCounts: Record<CanonicalDebtDiagnosticCode, number>;
};

/** Orden de severidad (peor primero) para desempate de dominante. */
const SEVERITY: OperatingDelayBucket[] = [
  "late_30_plus",
  "late_15_30",
  "late_8_14",
  "late_1_7",
  "on_time",
];

const CURRENT_WITH_DUE_DATE_TOLERANCE = 0.01;

function currentWithDueDateBalance(block: CanonicalDebtCurrencyBlock): number {
  const raw = roundMoney(block.metrics.currentBalance - block.metrics.balanceWithoutDueDate);
  if (raw >= 0) return raw;
  if (raw >= -CURRENT_WITH_DUE_DATE_TOLERANCE) return 0;
  throw new Error(
    `[cartera-operating-aging] current balance invariant failed for ${block.currency}: currentBalance (${block.metrics.currentBalance}) < balanceWithoutDueDate (${block.metrics.balanceWithoutDueDate})`
  );
}

/**
 * Buckets operativos. `current` = "al día CON vencimiento": excluye el saldo sin
 * `due_date` (que no se clasifica en ningún bucket, §10). El aging canónico mete
 * el saldo sin vencimiento en `current`, así que lo restamos acá con diagnóstico
 * si la invariante se rompe fuera de tolerancia.
 */
function bucketsView(block: CanonicalDebtCurrencyBlock): CarteraOperatingAgingBucketsView {
  return {
    current: currentWithDueDateBalance(block),
    overdue1To7: block.aging.overdue1To7,
    overdue8To14: block.aging.overdue8To14,
    overdue15To30: block.aging.overdue15To30,
    overdue31Plus: block.aging.overdue31Plus,
  };
}

function invoiceKeyForBucketCount(unit: CanonicalDebtUnit): string {
  if (unit.invoiceId && unit.invoiceId !== "unknown") return unit.invoiceId;
  return [
    unit.sourceType,
    unit.installmentId ?? "no-installment",
    unit.companyId ?? "no-company",
    unit.dueDate ?? "no-due-date",
    unit.openBalance,
  ].join("|");
}

/** Filas de bucket (5) con monto, facturas únicas, unidades y clientes distintos. */
function computeBucketRows(
  units: readonly CanonicalDebtUnit[],
  cutoffDate: string
): CarteraOperatingAgingBucketRow[] {
  const acc: Record<OperatingDelayBucket, {
    amount: number;
    debtUnitCount: number;
    invoices: Set<string>;
    companies: Set<string>;
  }> = {
    on_time: { amount: 0, debtUnitCount: 0, invoices: new Set(), companies: new Set() },
    late_1_7: { amount: 0, debtUnitCount: 0, invoices: new Set(), companies: new Set() },
    late_8_14: { amount: 0, debtUnitCount: 0, invoices: new Set(), companies: new Set() },
    late_15_30: { amount: 0, debtUnitCount: 0, invoices: new Set(), companies: new Set() },
    late_30_plus: { amount: 0, debtUnitCount: 0, invoices: new Set(), companies: new Set() },
  };
  for (const u of units) {
    if (!(u.openBalance > 0)) continue;
    if (u.dueDate === null) continue; // sin vencimiento: no clasificable (§10)
    const { bucket } = classifyOperatingDelay(u.dueDate, cutoffDate);
    acc[bucket].amount = roundMoney(acc[bucket].amount + u.openBalance);
    acc[bucket].debtUnitCount += 1;
    acc[bucket].invoices.add(invoiceKeyForBucketCount(u));
    if (u.companyId) acc[bucket].companies.add(u.companyId);
  }
  const total = OPERATING_DELAY_BUCKET_ORDER.reduce((s, b) => s + acc[b].amount, 0);
  return OPERATING_DELAY_BUCKET_ORDER.map((bucket) => ({
    bucket,
    amount: acc[bucket].amount,
    invoiceCount: acc[bucket].invoices.size,
    debtUnitCount: acc[bucket].debtUnitCount,
    clientCount: acc[bucket].companies.size,
    percentage: total > 0 ? acc[bucket].amount / total : 0,
  }));
}

/** Bucket dominante por monto; desempata por severidad. `null` si pendiente 0. */
function dominantBucket(view: CarteraOperatingAgingBucketsView): OperatingDelayBucket | null {
  const byBucket: Record<OperatingDelayBucket, number> = {
    on_time: view.current,
    late_1_7: view.overdue1To7,
    late_8_14: view.overdue8To14,
    late_15_30: view.overdue15To30,
    late_30_plus: view.overdue31Plus,
  };
  let best: OperatingDelayBucket | null = null;
  let bestAmt = 0;
  for (const b of SEVERITY) {
    const amt = byBucket[b];
    if (amt > bestAmt) {
      bestAmt = amt;
      best = b;
    }
  }
  return bestAmt > 0 ? best : null;
}

export interface BuildCarteraOperatingAgingInput {
  invoices: readonly CanonicalInvoiceInput[];
  installments?: readonly CanonicalInstallmentInput[];
  cutoffDate: string;
  minFinancialDate?: string;
  /** Ver `buildCanonicalDebtUnits`. Cartera controla su universo aguas arriba. */
  includeAllIssueDates?: boolean;
}

export function buildCarteraOperatingAging(
  input: BuildCarteraOperatingAgingInput
): CarteraOperatingAging {
  const context = buildCanonicalFinancialContext({
    workspaceId: "cartera",
    periodEnd: input.cutoffDate,
    cutoffDate: input.cutoffDate,
    minFinancialDate: input.minFinancialDate ?? MIN_FINANCIAL_DATE,
  });

  const snapshot = buildCanonicalDebtSnapshot({
    invoices: input.invoices,
    installments: input.installments,
    context,
    includeAllIssueDates: input.includeAllIssueDates,
  });

  const byCurrency: CarteraOperatingAgingCurrency[] = snapshot.byCurrency.map((block) => ({
    currency: block.currency,
    pendingBalance: block.metrics.pendingBalance,
    // "Al día" excluye el saldo sin vencimiento (§10): pending = current + overdue + unclassified.
    currentBalance: currentWithDueDateBalance(block),
    overdueBalance: block.metrics.overdueBalance,
    unclassifiedDueDateBalance: block.metrics.balanceWithoutDueDate,
    aging: bucketsView(block),
    buckets: computeBucketRows(block.units, snapshot.cutoffDate),
    pendingClients: block.metrics.totalOpenClients,
    overdueClients: block.metrics.overdueClients,
  }));

  const byCompany: CarteraOperatingAgingCompany[] = snapshot.byCompany.map((co) => ({
    companyId: co.companyId,
    byCurrency: co.byCurrency
      .filter((b) => b.metrics.pendingBalance > 0)
      .map((b) => {
        const view = bucketsView(b);
        return {
          currency: b.currency,
          pendingBalance: b.metrics.pendingBalance,
          overdueBalance: b.metrics.overdueBalance,
          currentBalance: currentWithDueDateBalance(b),
          unclassifiedDueDateBalance: b.metrics.balanceWithoutDueDate,
          dominantBucket: dominantBucket(view),
        };
      }),
  }));

  return {
    cutoffDate: snapshot.cutoffDate,
    byCurrency,
    byCompany,
    overdueClientsAnyCurrency: snapshot.overdueClientsAnyCurrency.length,
    diagnosticCounts: snapshot.diagnosticCounts,
  };
}
