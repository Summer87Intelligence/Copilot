/**
 * Dashboard Resumen — pure data transformation functions.
 *
 * NO I/O, NO Supabase, NO API calls.
 * All input comes from existing API responses; output feeds the dashboard UI.
 *
 * Metric sources (per canonical contract lib/copilot-financial-metrics-contract.ts):
 *  - facturado_periodo   → CurrencyReconciliation.issuedInPeriod − creditNoteAmount
 *  - cobrado_periodo     → portfolioResolvedAmount (cobrado_aplicado — alineado con Cartera)
 *  - pendiente_periodo   → pendingAtCutoff del período (= facturado − cobrado aplicado)
 *  - deuda_activa        → outstanding CurrencyReconciliation.pendingAtCutoff
 *  - deuda_vencida       → portfolio overdue (due_date < today) o aging 31+ fallback
 *  - caja_disponible     → CashPositionByCurrency.availableCash
 *  - caja_despues_pagos  → availableCash − TreasuryOutflowSummary.next30Days
 */

import type {
  AgingBucket,
  AgingRange,
  CurrencyReconciliation,
  FinancialConsistencyReport,
  ReconciliationCurrencyCode,
} from "./copilot-financial-reconciliation";
import { buildCurrencyIndex } from "./copilot-cartera-cards-source";
import type { ClientPortfolioRow } from "./copilot-clients-portfolio";
import { sumPortfolioOverdueDebt } from "./copilot-cartera-aging-totals";
import type { CashPositionByCurrency } from "./treasury/treasury-cash-position";
import type { TreasuryOutflowSummary } from "./treasury/treasury-scheduled-payments";
import { isCreditNoteFromMetadata } from "./copilot-zeta-credit-note";
import { consolidateToUsd, roundUsd } from "./finance/currency-conversion";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type DashboardCurrencyData = {
  currency: "UYU" | "USD";
  facturado: number;
  cobrado: number;
  pendientePeriodo: number;
  efectividad: number | null; // [0..1]
  deudaActiva: number;
  deudaVencida: number;
  aging: { label: string; amount: number; range: AgingRange }[];
  cajaDisponible: number;
  cajaDespPagos: number;
};

export type DashboardActiveDebtRow = {
  rowId: string;
  companyId: string;
  name: string;
  currency: "UYU" | "USD";
  activeDebt: number;
  overdueDebt: number;
  overdueDays: number | null;
  status: string;
  risk: string;
};

export type DashboardTopDebtor = {
  companyId: string;
  name: string;
  debtUYU: number;
  debtUSD: number;
  overdueUYU: number;
  overdueUSD: number;
  overdueDaysUYU: number | null;
  overdueDaysUSD: number | null;
  risk: string;
};

export type DashboardTopBilling = {
  companyId: string;
  name: string;
  billingUYU: number;
  billingUSD: number;
};

export type DashboardClientStates = {
  sinDeuda: number;
  conDeudaAlDia: number;
  conDeudaVencida: number;
  riesgoAlto: number;
  total: number;
};

export type DashboardMonthlyPoint = {
  monthLabel: string;
  yearMonth: string; // "YYYY-MM"
  issuedUYU: number;
  issuedUSD: number;
  collectedUYU: number;
  collectedUSD: number;
};

export type DashboardState = "ok" | "attention" | "critical";

/** Modo de moneda del banner ejecutivo (alineado al selector del Dashboard). */
export type DashboardExecutiveCurrencyMode = "all" | "UYU" | "USD" | "USD_consolidated";

export type BuildExecutiveSummaryMainRiskChipInput = {
  state: DashboardState;
  currencyMode: DashboardExecutiveCurrencyMode;
  deudaVencidaUyu: number;
  deudaVencidaUsd: number;
  exchangeRate?: number | null;
  clientStates: Pick<DashboardClientStates, "riesgoAlto" | "conDeudaVencida">;
};

function formatExecutiveOverdueChipAmount(
  amount: number,
  currency: "UYU" | "USD"
): string {
  const prefix = currency === "USD" ? "U$S " : "$ ";
  return `${prefix}${amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })} ${currency}`;
}

function buildExecutiveOverdueRiskLabel(input: {
  currencyMode: DashboardExecutiveCurrencyMode;
  deudaVencidaUyu: number;
  deudaVencidaUsd: number;
  exchangeRate?: number | null;
}): string | null {
  const { currencyMode, deudaVencidaUyu, deudaVencidaUsd, exchangeRate } = input;

  if (currencyMode === "all") {
    const hasUyu = deudaVencidaUyu > 0;
    const hasUsd = deudaVencidaUsd > 0;
    if (!hasUyu && !hasUsd) return null;
    if (hasUyu && hasUsd) {
      return `Vencido: ${formatExecutiveOverdueChipAmount(deudaVencidaUyu, "UYU")} · ${formatExecutiveOverdueChipAmount(deudaVencidaUsd, "USD")}`;
    }
    if (hasUyu) {
      return `Vencido: ${formatExecutiveOverdueChipAmount(deudaVencidaUyu, "UYU")}`;
    }
    return `Vencido: ${formatExecutiveOverdueChipAmount(deudaVencidaUsd, "USD")}`;
  }

  if (currencyMode === "UYU") {
    if (deudaVencidaUyu <= 0) return null;
    return `Vencido: ${formatExecutiveOverdueChipAmount(deudaVencidaUyu, "UYU")}`;
  }

  if (currencyMode === "USD") {
    if (deudaVencidaUsd <= 0) return null;
    return `Vencido: ${formatExecutiveOverdueChipAmount(deudaVencidaUsd, "USD")}`;
  }

  const tc = exchangeRate;
  if (!tc || tc <= 0) return null;
  const consolidated = roundUsd(
    consolidateToUsd(deudaVencidaUyu, deudaVencidaUsd, tc)
  );
  if (consolidated <= 0) return null;
  return `Vencido: ${formatExecutiveOverdueChipAmount(consolidated, "USD")} (cons.)`;
}

/**
 * Copy del chip de riesgo principal del banner ejecutivo.
 * Presentación únicamente — no altera métricas canónicas ni estado del dashboard.
 */
export function buildExecutiveSummaryMainRiskChip(
  input: BuildExecutiveSummaryMainRiskChipInput
): string | null {
  const { state, clientStates } = input;

  if (state === "critical") {
    if (clientStates.riesgoAlto > 0) {
      const n = clientStates.riesgoAlto;
      return `${n} cliente${n > 1 ? "s" : ""} de riesgo alto`;
    }
    return "Caja insuficiente para cubrir pagos próximos";
  }

  if (state === "attention") {
    const overdueLabel = buildExecutiveOverdueRiskLabel(input);
    if (overdueLabel) return overdueLabel;
    if (clientStates.conDeudaVencida > 0) {
      const n = clientStates.conDeudaVencida;
      return `${n} cliente${n > 1 ? "s" : ""} con deuda vencida`;
    }
  }

  return null;
}

/** Indica si hay deuda vencida según el modo visible, sin sumar UYU+USD en modo separado. */
export function hasExecutiveOverdueDebtForMode(input: {
  currencyMode: DashboardExecutiveCurrencyMode;
  deudaVencidaUyu: number;
  deudaVencidaUsd: number;
  exchangeRate?: number | null;
}): boolean {
  const { currencyMode, deudaVencidaUyu, deudaVencidaUsd, exchangeRate } = input;
  if (currencyMode === "all") {
    return deudaVencidaUyu > 0 || deudaVencidaUsd > 0;
  }
  if (currencyMode === "UYU") return deudaVencidaUyu > 0;
  if (currencyMode === "USD") return deudaVencidaUsd > 0;
  const tc = exchangeRate;
  if (!tc || tc <= 0) return false;
  return roundUsd(consolidateToUsd(deudaVencidaUyu, deudaVencidaUsd, tc)) > 0;
}

export type DashboardRecentMovement = {
  date: string;
  type: "factura" | "recibo" | "nota_credito";
  clientName: string;
  companyId: string;
  reference: string;
  currency: string;
  amount: number;
  balance: number;
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const AGING_LABELS: Record<AgingRange, string> = {
  "0_30": "0-30",
  "31_60": "31-60",
  "61_90": "61-90",
  "90_plus": "90+",
};

const OVERDUE_RANGES: AgingRange[] = ["31_60", "61_90", "90_plus"];

function overdueFromAging31Plus(buckets: AgingBucket[]): number {
  return r2(
    buckets
      .filter((b) => OVERDUE_RANGES.includes(b.range as AgingRange))
      .reduce((s, b) => s + b.amount, 0)
  );
}

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Exported transforms
// ---------------------------------------------------------------------------

/**
 * Main KPI extraction for the dashboard.
 * Combines period reconciliation, all-outstanding reconciliation, treasury.
 */
export function extractDashboardCurrencyData({
  periodReport,
  outstandingReport,
  cashPositions,
  outflowSummaries,
  portfolioRows,
}: {
  periodReport: FinancialConsistencyReport | null;
  outstandingReport: FinancialConsistencyReport | null;
  cashPositions: CashPositionByCurrency[];
  outflowSummaries: TreasuryOutflowSummary[];
  portfolioRows?: readonly ClientPortfolioRow[];
}): DashboardCurrencyData[] {
  const portfolioOverdue =
    portfolioRows && portfolioRows.length > 0
      ? sumPortfolioOverdueDebt(portfolioRows)
      : null;
  const periodIndex = buildCurrencyIndex(periodReport?.currencies);
  const codes: ReconciliationCurrencyCode[] = ["UYU", "USD"];
  return codes
    .map((cur): DashboardCurrencyData => {
      const periodMetrics = periodIndex.get(cur);
      const outstanding: CurrencyReconciliation | undefined =
        outstandingReport?.currencies?.find((c) => c.currencyCode === cur);

      const agingBuckets: AgingBucket[] =
        (outstandingReport?.agingByCurrency?.[cur as keyof typeof outstandingReport.agingByCurrency] as
          | AgingBucket[]
          | undefined) ?? [];

      const cash = cashPositions.find((c) => c.currency === cur);
      const outflow = outflowSummaries.find((o) => o.currency === cur);

      // Misma normalización que Cartera (buildCurrencyIndex).
      const facturado = r2(periodMetrics?.issuedInPeriodNet ?? 0);
      const cobrado = r2(periodMetrics?.portfolioResolvedAmount ?? 0);
      const pendientePeriodo = r2(
        periodMetrics?.pendingAtCutoff ?? Math.max(0, facturado - cobrado)
      );

      const efectividad =
        facturado > 0 ? Math.min(1, r2(cobrado / facturado)) : null;

      // deuda_activa = all-outstanding pendingAtCutoff
      const deudaActiva = r2(outstanding?.pendingAtCutoff ?? 0);

      // deuda_vencida = due_date < hoy (portfolio); fallback aging 31+
      const deudaVencida =
        portfolioOverdue != null
          ? r2(portfolioOverdue[cur])
          : overdueFromAging31Plus(agingBuckets);

      const cajaDisponible = r2(cash?.availableCash ?? 0);
      const cajaDespPagos = outflow
        ? r2(cajaDisponible - outflow.next30Days)
        : cajaDisponible;

      return {
        currency: cur,
        facturado,
        cobrado,
        pendientePeriodo,
        efectividad,
        deudaActiva,
        deudaVencida,
        aging: agingBuckets.map((b) => ({
          label: AGING_LABELS[b.range as AgingRange] ?? b.range,
          amount: b.amount,
          range: b.range as AgingRange,
        })),
        cajaDisponible,
        cajaDespPagos,
      };
    })
    .filter(
      (d) => d.facturado > 0 || d.deudaActiva > 0 || d.cajaDisponible !== 0
    );
}

function activeDebtSortRank(row: DashboardActiveDebtRow): number {
  if (row.overdueDebt <= 0) return 5;
  const days = row.overdueDays ?? 0;
  if (days > 90) return 1;
  if (days > 60) return 2;
  if (days > 30) return 3;
  return 4;
}

function activeDebtStatus(overdueDebt: number, risk: string): string {
  if (risk === "Alto") return "Riesgo alto";
  if (overdueDebt > 0) return "Vencido";
  return "Al día";
}

export function extractActiveDebtClientRows(
  rows: ClientPortfolioRow[]
): DashboardActiveDebtRow[] {
  const result: DashboardActiveDebtRow[] = [];
  for (const r of rows) {
    if (r.debt_uyu > 0) {
      const overdueDebt = r.overdue_uyu ?? 0;
      result.push({
        rowId: `${r.company_id}|UYU`,
        companyId: r.company_id,
        name: r.name,
        currency: "UYU",
        activeDebt: r.debt_uyu,
        overdueDebt,
        overdueDays: r.overdue_days_uyu ?? null,
        status: activeDebtStatus(overdueDebt, r.risk),
        risk: r.risk,
      });
    }
    if (r.debt_usd > 0) {
      const overdueDebt = r.overdue_usd ?? 0;
      result.push({
        rowId: `${r.company_id}|USD`,
        companyId: r.company_id,
        name: r.name,
        currency: "USD",
        activeDebt: r.debt_usd,
        overdueDebt,
        overdueDays: r.overdue_days_usd ?? null,
        status: activeDebtStatus(overdueDebt, r.risk),
        risk: r.risk,
      });
    }
  }
  return result.sort((a, b) => {
    const rankDiff = activeDebtSortRank(a) - activeDebtSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    if (b.overdueDebt !== a.overdueDebt) return b.overdueDebt - a.overdueDebt;
    if (b.activeDebt !== a.activeDebt) return b.activeDebt - a.activeDebt;
    if (a.currency !== b.currency) return a.currency === "UYU" ? -1 : 1;
    return a.name.localeCompare(b.name, "es");
  });
}

export function extractTopDebtorsForCurrency(
  rows: ClientPortfolioRow[],
  currency: "UYU" | "USD",
  limit = 10
): { companyId: string; name: string; value: number }[] {
  return rows
    .filter((r) => (currency === "UYU" ? r.debt_uyu : r.debt_usd) > 0)
    .sort((a, b) =>
      currency === "UYU" ? b.debt_uyu - a.debt_uyu : b.debt_usd - a.debt_usd
    )
    .slice(0, limit)
    .map((r) => ({
      companyId: r.company_id,
      name: r.name,
      value: currency === "UYU" ? r.debt_uyu : r.debt_usd,
    }));
}

export function extractTopBillingForCurrency(
  rows: ClientPortfolioRow[],
  currency: "UYU" | "USD",
  limit = 10
): { companyId: string; name: string; value: number }[] {
  return rows
    .filter((r) => ((currency === "UYU" ? r.billing_uyu : r.billing_usd) ?? 0) > 0)
    .sort((a, b) =>
      currency === "UYU"
        ? (b.billing_uyu ?? 0) - (a.billing_uyu ?? 0)
        : (b.billing_usd ?? 0) - (a.billing_usd ?? 0)
    )
    .slice(0, limit)
    .map((r) => ({
      companyId: r.company_id,
      name: r.name,
      value: currency === "UYU" ? (r.billing_uyu ?? 0) : (r.billing_usd ?? 0),
    }));
}

export function extractTopDebtors(
  rows: ClientPortfolioRow[],
  limit = 10
): DashboardTopDebtor[] {
  return rows
    .filter((r) => r.debt_uyu > 0 || r.debt_usd > 0)
    .sort((a, b) => b.debt_uyu + b.debt_usd - (a.debt_uyu + a.debt_usd))
    .slice(0, limit)
    .map((r) => ({
      companyId: r.company_id,
      name: r.name,
      debtUYU: r.debt_uyu,
      debtUSD: r.debt_usd,
      overdueUYU: r.overdue_uyu ?? 0,
      overdueUSD: r.overdue_usd ?? 0,
      overdueDaysUYU: r.overdue_days_uyu ?? null,
      overdueDaysUSD: r.overdue_days_usd ?? null,
      risk: r.risk,
    }));
}

export function extractTopBilling(
  rows: ClientPortfolioRow[],
  limit = 10
): DashboardTopBilling[] {
  return rows
    .filter((r) => (r.billing_uyu ?? 0) > 0 || (r.billing_usd ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.billing_uyu ?? 0) + (b.billing_usd ?? 0) -
        ((a.billing_uyu ?? 0) + (a.billing_usd ?? 0))
    )
    .slice(0, limit)
    .map((r) => ({
      companyId: r.company_id,
      name: r.name,
      billingUYU: r.billing_uyu ?? 0,
      billingUSD: r.billing_usd ?? 0,
    }));
}

export function extractClientStates(
  rows: ClientPortfolioRow[]
): DashboardClientStates {
  let sinDeuda = 0,
    conDeudaAlDia = 0,
    conDeudaVencida = 0,
    riesgoAlto = 0;
  for (const r of rows) {
    if (r.debt_uyu === 0 && r.debt_usd === 0) {
      sinDeuda++;
    } else if (r.risk === "Alto") {
      riesgoAlto++;
    } else if ((r.overdue_uyu ?? 0) > 0 || (r.overdue_usd ?? 0) > 0) {
      conDeudaVencida++;
    } else {
      conDeudaAlDia++;
    }
  }
  return {
    sinDeuda,
    conDeudaAlDia,
    conDeudaVencida,
    riesgoAlto,
    total: rows.length,
  };
}

export function extractMonthlyPoint(
  report: FinancialConsistencyReport | null,
  yearMonth: string
): DashboardMonthlyPoint {
  const [, monthStr] = yearMonth.split("-");
  const monthIdx = parseInt(monthStr ?? "1", 10) - 1;
  const monthLabel = MONTH_LABELS[monthIdx] ?? yearMonth;
  const index = buildCurrencyIndex(report?.currencies);
  const uyu = index.get("UYU");
  const usd = index.get("USD");
  return {
    monthLabel,
    yearMonth,
    issuedUYU: uyu?.issuedInPeriodNet ?? 0,
    issuedUSD: usd?.issuedInPeriodNet ?? 0,
    collectedUYU: uyu?.portfolioResolvedAmount ?? 0,
    collectedUSD: usd?.portfolioResolvedAmount ?? 0,
  };
}

export function determineDashboardState(
  currencyData: DashboardCurrencyData[],
  clientStates: DashboardClientStates
): DashboardState {
  const totalDeudaVencida = currencyData.reduce(
    (s, d) => s + d.deudaVencida,
    0
  );
  const cajaNegativos = currencyData.filter(
    (d) => d.cajaDisponible > 0 && d.cajaDespPagos < 0
  ).length;

  if (clientStates.riesgoAlto >= 3 || cajaNegativos > 0) return "critical";
  if (
    clientStates.riesgoAlto > 0 ||
    clientStates.conDeudaVencida > 0 ||
    totalDeudaVencida > 0
  )
    return "attention";
  return "ok";
}

/**
 * Build a list of recent movements from portfolio details.
 * Merges invoices + receipts, sorts by date descending, returns latest N.
 */
export function extractRecentMovements(
  details: Record<
    string,
    {
      company_name: string;
      invoices: {
        id: string;
        invoice_number: string;
        issue_date: string;
        total_amount: number;
        balance_amount: number;
        currency_code?: string | null;
        zeta_metadata?: unknown;
      }[];
      receipts: {
        id: string;
        amount: number;
        receipt_date: string;
        currency_code?: string | null;
      }[];
    }
  >,
  periodFrom: string,
  periodTo: string,
  limit?: number
): DashboardRecentMovement[] {
  const movements: DashboardRecentMovement[] = [];

  for (const [companyId, detail] of Object.entries(details)) {
    for (const inv of detail.invoices) {
      if (inv.issue_date < periodFrom || inv.issue_date > periodTo) continue;

      const isCreditNote =
        inv.zeta_metadata != null && isCreditNoteFromMetadata(inv.zeta_metadata);
      if (isCreditNote) {
        const amount = Math.abs(inv.total_amount);
        if (amount > 0) {
          movements.push({
            date: inv.issue_date,
            type: "nota_credito",
            clientName: detail.company_name,
            companyId,
            reference: inv.invoice_number,
            currency: inv.currency_code ?? "?",
            amount,
            balance: 0,
          });
        }
        continue;
      }

      if (inv.total_amount > 0) {
        movements.push({
          date: inv.issue_date,
          type: "factura",
          clientName: detail.company_name,
          companyId,
          reference: inv.invoice_number,
          currency: inv.currency_code ?? "?",
          amount: inv.total_amount,
          balance: inv.balance_amount,
        });
      }
    }
    for (const rec of detail.receipts) {
      if (
        rec.receipt_date >= periodFrom &&
        rec.receipt_date <= periodTo &&
        rec.amount > 0
      ) {
        movements.push({
          date: rec.receipt_date,
          type: "recibo",
          clientName: detail.company_name,
          companyId,
          reference: `REC-${rec.id.slice(0, 8)}`,
          currency: rec.currency_code ?? "?",
          amount: rec.amount,
          balance: 0,
        });
      }
    }
  }

  const sorted = movements.sort((a, b) => b.date.localeCompare(a.date));
  return limit != null ? sorted.slice(0, limit) : sorted;
}

/**
 * Generate month ranges for a given period [from..to].
 * Returns one bucket per calendar month, capped at maxMonths.
 * Used for period-aligned monthly trend charts.
 */
export function getMonthRangesForPeriod(
  from: string,
  to: string,
  maxMonths = 12
): { from: string; to: string; yearMonth: string }[] {
  const result: { from: string; to: string; yearMonth: string }[] = [];
  const [fromYearStr, fromMonthStr] = from.split("-");
  const [toYearStr, toMonthStr] = to.split("-");
  let y = parseInt(fromYearStr!, 10);
  let m = parseInt(fromMonthStr!, 10);
  const toY = parseInt(toYearStr!, 10);
  const toM = parseInt(toMonthStr!, 10);

  while (result.length < maxMonths) {
    const mm = String(m).padStart(2, "0");
    const lastDay = new Date(y, m, 0).getDate();
    result.push({
      from: `${y}-${mm}-01`,
      to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
      yearMonth: `${y}-${mm}`,
    });
    if (y === toY && m === toM) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

/**
 * Generate last N complete months before today.
 * Returns array of { from, to, yearMonth } in ascending order.
 */
export function getLastNMonthRanges(
  today: string,
  n: number
): { from: string; to: string; yearMonth: string }[] {
  const result: { from: string; to: string; yearMonth: string }[] = [];
  const [year, month] = today.split("-").map(Number);
  for (let i = n; i >= 1; i--) {
    let m = month - i;
    let y = year;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const mm = String(m).padStart(2, "0");
    const lastDay = new Date(y, m, 0).getDate();
    result.push({
      from: `${y}-${mm}-01`,
      to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
      yearMonth: `${y}-${mm}`,
    });
  }
  return result;
}
