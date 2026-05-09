/**
 * Executive Financial Dashboard metrics (read-only, multi-moneda, multi-cliente).
 *
 * Esta capa es deliberadamente pura y reusable: no depende de tablas visibles,
 * filtros UI, componentes renderizados ni `is_active=true`. Consume el ledger
 * financiero completo (`getCopilotDataset("all")` / getters ledger) y reutiliza
 * las mismas reglas de deuda actual basadas en `proto_invoices.balance_amount`.
 *
 * Fuente de verdad:
 *  - Facturado: `proto_invoices.total_amount`.
 *  - Pendiente: `proto_invoices.balance_amount` con la misma regla conservadora
 *    de deuda actual (`balance_amount ?? total_amount`).
 *  - Cobrado: `totalInvoiced - totalPending`.
 *
 * No usa recibos ni infiere imputaciones factura↔recibo.
 */

import type { DataRow } from "@/lib/copilot-data";
import {
  buildClientCurrentDebtSummary,
  calculateFinancialInvoiceAmounts,
  classifyFinancialInvoiceStatus,
  isVoidedFinancialInvoice,
  readFinancialInvoiceCurrency,
  roundFinancial2,
  type CurrentDebtCurrencyCode,
} from "@/lib/copilot-client-current-debt-summary";
import { parseRowYmd } from "@/lib/copilot-datos-period-filter";
import { isWithinCopilotOperationalPeriod } from "@/lib/copilot-operational-period";

export type AgingBucketLabel = "0-30" | "31-60" | "61-90" | "90+";

export type FinancialDashboardMetrics = {
  currencies: CurrencyMetrics[];
};

export type CurrencyMetrics = {
  currencyCode: CurrentDebtCurrencyCode;

  totalInvoiced: number;
  totalCollected: number;
  totalPending: number;

  invoiceCount: number;
  paidInvoiceCount: number;
  partialInvoiceCount: number;
  pendingInvoiceCount: number;

  debtorClientsCount: number;

  collectionEffectiveness: number;

  topDebtors: TopDebtor[];

  aging: AgingBucket[];
};

export type TopDebtor = {
  companyId: string;
  companyName: string;
  pendingAmount: number;
  invoiceCount: number;
  dominantAgingLabel: AgingBucketLabel;
  oldestAgeDays: number;
  totalInvoiced: number;
  totalCollected: number;
  collectionEffectiveness: number;
};

export type AgingBucket = {
  label: AgingBucketLabel;
  amount: number;
  invoiceCount: number;
};

export type BuildFinancialDashboardMetricsInput = {
  /** Facturas del ledger financiero completo: activas + archivadas válidas. */
  invoices: readonly DataRow[];
  /** Compañías del tenant para resolver nombres en Top deudores. */
  companies?: readonly DataRow[];
  /** Fecha de corte para aging. Default: hoy. Inyectable para tests determinísticos. */
  today?: string | Date;
  /** Default 5. */
  topDebtorLimit?: number;
};

const CURRENCY_ORDER: readonly CurrentDebtCurrencyCode[] = ["USD", "UYU"];
const AGING_LABELS: readonly AgingBucketLabel[] = ["0-30", "31-60", "61-90", "90+"];
const DAY_MS = 24 * 60 * 60 * 1000;

type DebtorAccumulator = {
  companyName: string;
  pendingAmount: number;
  invoiceCount: number;
  oldestAgeDays: number;
  totalInvoiced: number;
  totalCollected: number;
  aging: AgingBucket[];
};

function emptyAging(): AgingBucket[] {
  return AGING_LABELS.map((label) => ({ label, amount: 0, invoiceCount: 0 }));
}

function emptyCurrencyMetrics(currencyCode: CurrentDebtCurrencyCode): CurrencyMetrics {
  return {
    currencyCode,
    totalInvoiced: 0,
    totalCollected: 0,
    totalPending: 0,
    invoiceCount: 0,
    paidInvoiceCount: 0,
    partialInvoiceCount: 0,
    pendingInvoiceCount: 0,
    debtorClientsCount: 0,
    collectionEffectiveness: 0,
    topDebtors: [],
    aging: emptyAging(),
  };
}

function toUtcDay(value: string | Date | undefined): number {
  if (value instanceof Date) {
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
  }
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function ymdUtcDay(p: { y: number; m: number; d: number }): number {
  return Date.UTC(p.y, p.m - 1, p.d);
}

function agingIndex(days: number): number {
  if (days <= 30) return 0;
  if (days <= 60) return 1;
  if (days <= 90) return 2;
  return 3;
}

function companyNameFromRow(row: DataRow): string {
  return String(
    row.name ??
      row.RazonSocial ??
      row.Nombre ??
      row.client_razon_display ??
      row.company_name ??
      row.id ??
      "Cliente sin nombre"
  );
}

function invoiceCompanyName(row: DataRow, companiesById: Map<string, string>): string {
  const companyId = String(row.company_id ?? "").trim();
  if (companyId && companiesById.has(companyId)) return companiesById.get(companyId) ?? companyId;
  return String(row.client_razon_display ?? row.company_name ?? (companyId || "Cliente sin nombre"));
}

function buildCompanyMap(companies: readonly DataRow[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const company of companies ?? []) {
    const id = String(company.id ?? "").trim();
    if (!id) continue;
    map.set(id, companyNameFromRow(company));
  }
  return map;
}

function buildTopDebtors(debtors: Map<string, DebtorAccumulator>, limit: number): TopDebtor[] {
  return Array.from(debtors.entries())
    .filter(([, v]) => v.pendingAmount > 0)
    .map(([companyId, v]) => ({
      companyId,
      companyName: v.companyName,
      pendingAmount: roundFinancial2(v.pendingAmount),
      invoiceCount: v.invoiceCount,
      dominantAgingLabel: dominantAging(v.aging),
      oldestAgeDays: v.oldestAgeDays,
      totalInvoiced: roundFinancial2(v.totalInvoiced),
      totalCollected: roundFinancial2(v.totalCollected),
      collectionEffectiveness:
        v.totalInvoiced > 0 ? roundFinancial2((v.totalCollected / v.totalInvoiced) * 100) : 0,
    }))
    .sort((a, b) => {
      if (b.pendingAmount !== a.pendingAmount) return b.pendingAmount - a.pendingAmount;
      return a.companyName.localeCompare(b.companyName, "es");
    })
    .slice(0, limit);
}

function dominantAging(aging: readonly AgingBucket[]): AgingBucketLabel {
  let best = aging[0] ?? { label: "0-30" as AgingBucketLabel, amount: 0, invoiceCount: 0 };
  for (const bucket of aging) {
    if (bucket.amount > best.amount) best = bucket;
  }
  return best.label;
}

function finalizeMetrics(
  metrics: CurrencyMetrics,
  debtors: Map<string, DebtorAccumulator>,
  topDebtorLimit: number
): CurrencyMetrics {
  const collectionEffectiveness =
    metrics.totalInvoiced > 0
      ? roundFinancial2((metrics.totalCollected / metrics.totalInvoiced) * 100)
      : 0;

  return {
    ...metrics,
    totalInvoiced: roundFinancial2(metrics.totalInvoiced),
    totalCollected: roundFinancial2(metrics.totalCollected),
    totalPending: roundFinancial2(metrics.totalPending),
    debtorClientsCount: Array.from(debtors.values()).filter((d) => d.pendingAmount > 0).length,
    collectionEffectiveness,
    topDebtors: buildTopDebtors(debtors, topDebtorLimit),
    aging: metrics.aging.map((b) => ({
      ...b,
      amount: roundFinancial2(b.amount),
    })),
  };
}

export function buildFinancialDashboardMetrics(
  input: BuildFinancialDashboardMetricsInput
): FinancialDashboardMetrics {
  const topDebtorLimit = input.topDebtorLimit ?? 5;
  const todayUtc = toUtcDay(input.today);
  const companiesById = buildCompanyMap(input.companies);

  // Defensa en profundidad: filtrar pre-2026 aunque el caller ya lo haga a nivel de BD
  const operationalInvoices = input.invoices.filter((inv) =>
    isWithinCopilotOperationalPeriod(String(inv.issue_date ?? ""))
  );

  // Reutilizamos la métrica autoritativa de deuda actual para totales y counts
  // globales por moneda. Así evitamos reimplementar clasificación, exclusión de
  // anuladas/canceladas, moneda y cálculo de `balance_amount`.
  const debtSummary = buildClientCurrentDebtSummary({ invoices: operationalInvoices });
  const baseByCurrency = new Map<CurrentDebtCurrencyCode, CurrencyMetrics>();
  for (const code of CURRENCY_ORDER) baseByCurrency.set(code, emptyCurrencyMetrics(code));
  for (const c of debtSummary.currencies) {
    baseByCurrency.set(c.currencyCode, {
      ...emptyCurrencyMetrics(c.currencyCode),
      totalInvoiced: c.totalInvoiced,
      totalCollected: c.totalPaidByZeta,
      totalPending: c.totalPending,
      invoiceCount: c.invoiceCount,
      paidInvoiceCount: c.paidCount,
      partialInvoiceCount: c.partialCount,
      pendingInvoiceCount: c.pendingCount,
    });
  }

  const debtorsByCurrency: Record<
    CurrentDebtCurrencyCode,
    Map<string, DebtorAccumulator>
  > = {
    USD: new Map(),
    UYU: new Map(),
  };

  for (const inv of operationalInvoices) {
    if (isVoidedFinancialInvoice(inv)) continue;
    const currency = readFinancialInvoiceCurrency(inv);
    if (!currency) continue;

    const { totalAmount, pendingAmount, paidAmount } = calculateFinancialInvoiceAmounts(inv);
    if (!(totalAmount > 0)) continue;
    const companyId = String(inv.company_id ?? "").trim();
    const issued = parseRowYmd(inv, "issue_date");
    const ageDays = issued
      ? Math.max(0, Math.floor((todayUtc - ymdUtcDay(issued)) / DAY_MS))
      : 0;

    if (companyId) {
      const debtors = debtorsByCurrency[currency];
      const current = debtors.get(companyId) ?? {
        companyName: invoiceCompanyName(inv, companiesById),
        pendingAmount: 0,
        invoiceCount: 0,
        oldestAgeDays: 0,
        totalInvoiced: 0,
        totalCollected: 0,
        aging: emptyAging(),
      };
      current.totalInvoiced = roundFinancial2(current.totalInvoiced + totalAmount);
      current.totalCollected = roundFinancial2(current.totalCollected + paidAmount);
      if (pendingAmount > 0) {
        current.pendingAmount = roundFinancial2(current.pendingAmount + pendingAmount);
        current.invoiceCount += 1;
        current.oldestAgeDays = Math.max(current.oldestAgeDays, ageDays);
        if (issued) {
          const debtorBucket = current.aging[agingIndex(ageDays)];
          debtorBucket.amount = roundFinancial2(debtorBucket.amount + pendingAmount);
          debtorBucket.invoiceCount += 1;
        }
      }
      debtors.set(companyId, current);
    }

    if (!(pendingAmount > 0)) continue;
    if (!issued) continue;
    const bucket = baseByCurrency.get(currency)?.aging[agingIndex(ageDays)];
    if (!bucket) continue;
    bucket.amount = roundFinancial2(bucket.amount + pendingAmount);
    bucket.invoiceCount += 1;

    // La clasificación en `debtSummary` ya alimenta los counts principales.
    // Esta llamada mantiene explícita la dependencia para futuras métricas por
    // aging sin duplicar reglas.
    classifyFinancialInvoiceStatus(totalAmount, pendingAmount);
  }

  return {
    currencies: CURRENCY_ORDER.map((code) =>
      finalizeMetrics(
        baseByCurrency.get(code) ?? emptyCurrencyMetrics(code),
        debtorsByCurrency[code],
        topDebtorLimit
      )
    ).filter((c) => c.invoiceCount > 0),
  };
}
