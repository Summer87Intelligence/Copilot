/**
 * Panel ejecutivo /copilot/finanzas — compone fuentes existentes sin recalcular motor.
 */

import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import {
  buildFinancialMonthlyTrends,
  buildFinancialTrendDashboard,
  FINANCIAL_TRENDS_MIN_YM,
  type MonthlyTrendInvoiceInput,
  type MonthlyTrendReceiptInput,
} from "@/lib/copilot-financial-monthly-trends";
import {
  buildFinancialPeriodContext,
  monthLabelFromYm,
  prevYm,
  type FinancialPeriodContext,
} from "@/lib/copilot-financial-period-context";
import {
  buildFinancialPanoramaModel,
  type FinancialPanoramaModel,
  type PanoramaCurrencySlice,
  type PanoramaRiskLevel,
} from "@/lib/copilot-financial-panorama-model";
import type { NormalizedCurrencyMetrics } from "@/lib/copilot-cartera-cards-source";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import type { AgingBucket } from "@/lib/copilot-financial-reconciliation";

export type ExecutiveCurrencyCode = "UYU" | "USD";

export type ComparisonMetric = {
  id: string;
  label: string;
  current: number | null;
  previous: number | null;
  format: "money" | "percent" | "days";
};

export type PeriodComparisonBlock = {
  title: string;
  subtitle?: string;
  footnote?: string;
  /** paired = actual vs anterior; current-only = lectura parcial sin comparar meses cerrados */
  layout: "paired" | "current-only";
  metrics: ComparisonMetric[];
};

export type ClosedMonthSnapshot = {
  label: string;
  netSales: number;
  collected: number;
  creditNotes: number;
};

export type TrendDirection = "growing" | "stable" | "declining" | "insufficient";

export type TopOverdueRow = {
  companyId: string;
  clientName: string;
  totalDebt: number;
  overdueDebt: number;
  risk: string;
  daysOverdue: number | null;
};

export type TopClientRow = {
  companyId: string;
  clientName: string;
  netSales: number;
  sharePct: number;
  collected: number;
  currentDebt: number;
  overdueDebt: number;
  risk: string;
};

export type ExecutiveCurrencyPanel = {
  currency: ExecutiveCurrencyCode;
  slice: PanoramaCurrencySlice | null;
  cashToday: number;
  currentMonthInProgress: PeriodComparisonBlock;
  lastClosedMonthComparison: PeriodComparisonBlock;
  weekVsPrevious: PeriodComparisonBlock;
  lastClosedSnapshot: ClosedMonthSnapshot | null;
  collectionDebt: {
    totalDebt: number;
    overdueDebt: number;
    overduePct: number | null;
    periodCollections: number;
    collectionsVsNetSalesPct: number | null;
  };
  topOverdue: TopOverdueRow[];
  topSalesClients: TopClientRow[];
  topDebtClients: TopClientRow[];
  trendDirection: TrendDirection;
};

export type FinancialExecutiveDashboard = {
  periodLabel: string;
  asOfYmd: string;
  periodContext: FinancialPeriodContext;
  panorama: FinancialPanoramaModel;
  currencies: ExecutiveCurrencyPanel[];
  executiveBullets: string[];
};

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 1 : null;
  return Math.round(((current - previous) / previous) * 1000) / 1000;
}

function sumMonth(
  invoices: readonly MonthlyTrendInvoiceInput[],
  receipts: readonly MonthlyTrendReceiptInput[],
  ym: string,
  currency: ExecutiveCurrencyCode
): { netSales: number; collected: number; creditNotes: number } {
  const trends = buildFinancialMonthlyTrends({
    invoices,
    receipts,
    asOfYmd: `${ym}-28`,
    monthsBack: 24,
  }).trends.filter((t) => t.currency === currency && t.month === ym);
  const row = trends[0];
  if (!row) return { netSales: 0, collected: 0, creditNotes: 0 };
  return { netSales: row.netIssued, collected: row.collected, creditNotes: row.creditNotes };
}

function hasActivity(totals: { netSales: number; collected: number; creditNotes: number }): boolean {
  return totals.netSales > 0 || totals.collected > 0 || totals.creditNotes > 0;
}

function buildCurrentMonthInProgress(
  ctx: FinancialPeriodContext,
  currency: ExecutiveCurrencyCode,
  invoices: readonly MonthlyTrendInvoiceInput[],
  receipts: readonly MonthlyTrendReceiptInput[]
): PeriodComparisonBlock {
  const cur = sumMonth(invoices, receipts, ctx.currentMonthYm, currency);
  const empty = !hasActivity(cur);

  return {
    title: `${ctx.currentMonthLabel} en curso`,
    subtitle: empty
      ? "Sin movimientos registrados en este período."
      : `Acumulado del ${ctx.currentPeriod.label}.`,
    footnote: "No es comparable todavía con un mes completo.",
    layout: "current-only",
    metrics: [
      { id: "net", label: "Ventas acumuladas", current: cur.netSales, previous: null, format: "money" },
      { id: "col", label: "Cobros acumulados", current: cur.collected, previous: null, format: "money" },
      {
        id: "days",
        label: "Días transcurridos del mes",
        current: ctx.daysElapsedInMonth,
        previous: ctx.daysInMonth,
        format: "days",
      },
    ],
  };
}

function buildLastClosedMonthComparison(
  ctx: FinancialPeriodContext,
  currency: ExecutiveCurrencyCode,
  invoices: readonly MonthlyTrendInvoiceInput[],
  receipts: readonly MonthlyTrendReceiptInput[]
): PeriodComparisonBlock {
  const closedYm = ctx.lastClosedMonthYm;
  const prevClosedYm = ctx.previousClosedMonthYm;
  const closed =
    closedYm >= FINANCIAL_TRENDS_MIN_YM
      ? sumMonth(invoices, receipts, closedYm, currency)
      : { netSales: 0, collected: 0, creditNotes: 0 };
  const prevClosed =
    prevClosedYm >= FINANCIAL_TRENDS_MIN_YM
      ? sumMonth(invoices, receipts, prevClosedYm, currency)
      : { netSales: 0, collected: 0, creditNotes: 0 };

  const salesGap = closed.netSales - closed.collected;
  const prevGap = prevClosed.netSales - prevClosed.collected;
  const netDelta = pctChange(closed.netSales, prevClosed.netSales);
  const colDelta = pctChange(closed.collected, prevClosed.collected);

  const empty = !hasActivity(closed) && !hasActivity(prevClosed);

  return {
    title: `${ctx.lastClosedMonthLabel} vs ${ctx.previousClosedMonthLabel}`,
    subtitle: empty
      ? "Sin movimientos registrados en estos meses cerrados."
      : "Comparación de meses completos (ventas y cobros por fecha de comprobante/recibo).",
    layout: "paired",
    metrics: [
      {
        id: "net",
        label: "Ventas",
        current: closed.netSales,
        previous: prevClosed.netSales,
        format: "money",
      },
      {
        id: "col",
        label: "Cobros",
        current: closed.collected,
        previous: prevClosed.collected,
        format: "money",
      },
      {
        id: "gap",
        label: "Diferencia ventas/cobros",
        current: salesGap,
        previous: prevGap,
        format: "money",
      },
      {
        id: "net_pct",
        label: "Δ ventas",
        current: netDelta,
        previous: null,
        format: "percent",
      },
      {
        id: "col_pct",
        label: "Δ cobros",
        current: colDelta,
        previous: null,
        format: "percent",
      },
    ],
  };
}

function buildWeekComparison(
  asOfYmd: string,
  currency: ExecutiveCurrencyCode,
  invoices: readonly MonthlyTrendInvoiceInput[],
  receipts: readonly MonthlyTrendReceiptInput[]
): PeriodComparisonBlock {
  const dash7 = buildFinancialTrendDashboard({
    invoices,
    receipts,
    asOfYmd,
    period: "7d",
    currency,
  });
  const prevEnd = new Date(`${asOfYmd.slice(0, 10)}T12:00:00`);
  prevEnd.setDate(prevEnd.getDate() - 7);
  const dashPrev = buildFinancialTrendDashboard({
    invoices,
    receipts,
    asOfYmd: prevEnd.toISOString().slice(0, 10),
    period: "7d",
    currency,
  });

  const salesGap = dash7.totals.netSales - dash7.totals.collections;
  const empty =
    dash7.totals.netSales === 0 &&
    dash7.totals.collections === 0 &&
    dashPrev.totals.netSales === 0 &&
    dashPrev.totals.collections === 0;

  return {
    title: "Esta semana vs semana anterior",
    subtitle: empty ? "Sin movimientos registrados en este período." : undefined,
    layout: "paired",
    metrics: [
      {
        id: "wn",
        label: "Ventas",
        current: dash7.totals.netSales,
        previous: dashPrev.totals.netSales,
        format: "money",
      },
      {
        id: "wc",
        label: "Cobros",
        current: dash7.totals.collections,
        previous: dashPrev.totals.collections,
        format: "money",
      },
      {
        id: "wg",
        label: "Diferencia ventas/cobros",
        current: salesGap,
        previous: dashPrev.totals.netSales - dashPrev.totals.collections,
        format: "money",
      },
    ],
  };
}

function resolveTrendDirection(
  invoices: readonly MonthlyTrendInvoiceInput[],
  receipts: readonly MonthlyTrendReceiptInput[],
  asOfYmd: string,
  currency: ExecutiveCurrencyCode
): TrendDirection {
  const dash = buildFinancialTrendDashboard({
    invoices,
    receipts,
    asOfYmd,
    period: "3m",
    currency,
  });
  const pts = dash.points.filter((p) => p.netSales > 0);
  if (pts.length < 2) return "insufficient";
  const first = pts[0].netSales;
  const last = pts[pts.length - 1].netSales;
  const delta = pctChange(last, first);
  if (delta == null) return "insufficient";
  if (delta > 0.08) return "growing";
  if (delta < -0.08) return "declining";
  return "stable";
}

function buildTopOverdue(
  rows: readonly ClientPortfolioRow[],
  currency: ExecutiveCurrencyCode,
  limit = 5
): TopOverdueRow[] {
  return [...rows]
    .map((r) => ({
      companyId: r.company_id,
      clientName: r.name,
      totalDebt: currency === "UYU" ? r.debt_uyu : r.debt_usd,
      overdueDebt: currency === "UYU" ? (r.overdue_uyu ?? 0) : (r.overdue_usd ?? 0),
      risk: r.risk,
      daysOverdue: null as number | null,
    }))
    .filter((r) => r.overdueDebt > 0)
    .sort((a, b) => b.overdueDebt - a.overdueDebt)
    .slice(0, limit);
}

function buildTopSalesClients(
  rows: readonly ClientPortfolioRow[],
  currency: ExecutiveCurrencyCode,
  limit = 5
): TopClientRow[] {
  const totalBilling = rows.reduce(
    (s, r) => s + (currency === "UYU" ? (r.billing_uyu ?? 0) : (r.billing_usd ?? 0)),
    0
  );
  return [...rows]
    .map((r) => {
      const netSales = currency === "UYU" ? (r.billing_uyu ?? 0) : (r.billing_usd ?? 0);
      return {
        companyId: r.company_id,
        clientName: r.name,
        netSales,
        sharePct: totalBilling > 0 ? Math.round((netSales / totalBilling) * 100) : 0,
        collected: 0,
        currentDebt: currency === "UYU" ? r.debt_uyu : r.debt_usd,
        overdueDebt: currency === "UYU" ? (r.overdue_uyu ?? 0) : (r.overdue_usd ?? 0),
        risk: r.risk,
      };
    })
    .filter((r) => r.netSales > 0)
    .sort((a, b) => b.netSales - a.netSales)
    .slice(0, limit);
}

function buildTopDebtClients(
  rows: readonly ClientPortfolioRow[],
  currency: ExecutiveCurrencyCode,
  limit = 5
): TopClientRow[] {
  const totalDebt = rows.reduce(
    (s, r) => s + (currency === "UYU" ? r.debt_uyu : r.debt_usd),
    0
  );
  return [...rows]
    .map((r) => {
      const currentDebt = currency === "UYU" ? r.debt_uyu : r.debt_usd;
      return {
        companyId: r.company_id,
        clientName: r.name,
        netSales: currency === "UYU" ? (r.billing_uyu ?? 0) : (r.billing_usd ?? 0),
        sharePct: totalDebt > 0 ? Math.round((currentDebt / totalDebt) * 100) : 0,
        collected: 0,
        currentDebt,
        overdueDebt: currency === "UYU" ? (r.overdue_uyu ?? 0) : (r.overdue_usd ?? 0),
        risk: r.risk,
      };
    })
    .filter((r) => r.currentDebt > 0)
    .sort((a, b) => b.currentDebt - a.currentDebt)
    .slice(0, limit);
}

function findBestClosedMonth(
  invoices: readonly MonthlyTrendInvoiceInput[],
  receipts: readonly MonthlyTrendReceiptInput[],
  asOfYmd: string,
  currency: ExecutiveCurrencyCode,
  excludeYm: string
): { ym: string; netSales: number } | null {
  const trends = buildFinancialMonthlyTrends({
    invoices,
    receipts,
    asOfYmd,
    monthsBack: 12,
  }).trends.filter(
    (t) =>
      t.currency === currency &&
      t.month >= FINANCIAL_TRENDS_MIN_YM &&
      t.month !== excludeYm &&
      t.netIssued > 0
  );
  if (trends.length === 0) return null;
  const best = trends.reduce((a, b) => (b.netIssued > a.netIssued ? b : a));
  return { ym: best.month, netSales: best.netIssued };
}

export function buildExecutiveBullets(input: {
  currencies: ExecutiveCurrencyPanel[];
  panorama: FinancialPanoramaModel;
  periodContext: FinancialPeriodContext;
  invoices: readonly MonthlyTrendInvoiceInput[];
  receipts: readonly MonthlyTrendReceiptInput[];
}): string[] {
  const lines: string[] = [];

  if (input.periodContext.isCurrentMonthPartial) {
    lines.push(
      `${input.periodContext.currentMonthLabel} está en curso; todavía no representa un mes completo.`
    );
  }

  for (const panel of input.currencies) {
    const prefix = input.currencies.length > 1 ? `${panel.currency}: ` : "";

    const best = findBestClosedMonth(
      input.invoices,
      input.receipts,
      input.periodContext.asOfYmd,
      panel.currency,
      input.periodContext.isCurrentMonthPartial
        ? input.periodContext.currentMonthYm
        : ""
    );
    if (best) {
      lines.push(
        `${prefix}${monthLabelFromYm(best.ym)} fue el mejor mes cerrado en ventas ${panel.currency}.`
      );
    }

    const closed = panel.lastClosedSnapshot;
    if (closed && closed.collected > closed.netSales && closed.netSales > 0) {
      lines.push(
        `${prefix}Los cobros ${panel.currency} de ${closed.label} superaron las ventas; puede incluir recuperación de deuda anterior.`
      );
    }

    if (
      input.panorama.concentration &&
      input.panorama.concentration.currency === panel.currency &&
      input.panorama.concentration.sharePct >= 40
    ) {
      lines.push(
        `${prefix}${input.panorama.concentration.clientName} concentra ${input.panorama.concentration.sharePct}% de la deuda ${panel.currency}.`
      );
    }
  }

  if (!input.panorama.projection.hasOutflows) {
    lines.push(
      "No hay pagos próximos cargados; la proyección de caja puede estar incompleta."
    );
  }

  const hasOverdue = input.currencies.some((c) => c.collectionDebt.overdueDebt > 0);
  if (hasOverdue) {
    lines.push("Prioridad sugerida: revisar clientes con deuda vencida.");
  } else if (lines.length < 5) {
    lines.push(
      `Prioridad sugerida: ${input.panorama.priorityCta.label.replace(/^Ver /, "").toLowerCase()}.`
    );
  }

  if (lines.length === 0) {
    lines.push(
      "Revisá la evolución comercial y la caja en Tesorería para decisiones del día a día."
    );
  }

  return lines.slice(0, 5);
}

export function buildFinancialExecutiveDashboard(input: {
  periodLabel: string;
  asOfYmd: string;
  metricsByCode: Partial<Record<ExecutiveCurrencyCode, NormalizedCurrencyMetrics>>;
  agingByCurrency?: Partial<Record<ExecutiveCurrencyCode, AgingBucket[]>>;
  snapshot: FinancialSnapshotApiV1 | null;
  cashPositions: readonly CashPositionByCurrency[];
  portfolioRows: readonly ClientPortfolioRow[];
  fiscal: import("@/lib/copilot-financial-panorama-model").PanoramaFiscalSummary;
  invoices: readonly MonthlyTrendInvoiceInput[];
  receipts: readonly MonthlyTrendReceiptInput[];
}): FinancialExecutiveDashboard {
  const periodContext = buildFinancialPeriodContext(input.asOfYmd);

  const panorama = buildFinancialPanoramaModel({
    periodLabel: input.periodLabel,
    metricsByCode: input.metricsByCode,
    agingByCurrency: input.agingByCurrency,
    snapshot: input.snapshot,
    cashPositions: input.cashPositions,
    portfolioRows: input.portfolioRows,
    fiscal: input.fiscal,
  });

  const currencies: ExecutiveCurrencyPanel[] = [];

  for (const code of ["UYU", "USD"] as const) {
    const slice = panorama.currencies.find((c) => c.code === code) ?? null;
    const cashToday =
      code === "UYU" ? panorama.projection.cashTodayUyu : panorama.projection.cashTodayUsd;
    const hasCash = cashToday !== 0;
    const hasSlice = slice != null;
    if (!hasSlice && !hasCash) continue;

    const currentYm = input.asOfYmd.slice(0, 7);
    const periodCollections = sumMonth(input.invoices, input.receipts, currentYm, code).collected;
    const totalDebt = slice?.pending ?? 0;
    const overdueDebt = slice?.overdue ?? 0;
    const netSales = slice?.netIncome ?? 0;

    const closedYm = periodContext.lastClosedMonthYm;
    const closedTotals =
      closedYm >= FINANCIAL_TRENDS_MIN_YM
        ? sumMonth(input.invoices, input.receipts, closedYm, code)
        : null;

    currencies.push({
      currency: code,
      slice,
      cashToday,
      currentMonthInProgress: buildCurrentMonthInProgress(
        periodContext,
        code,
        input.invoices,
        input.receipts
      ),
      lastClosedMonthComparison: buildLastClosedMonthComparison(
        periodContext,
        code,
        input.invoices,
        input.receipts
      ),
      weekVsPrevious: buildWeekComparison(
        input.asOfYmd,
        code,
        input.invoices,
        input.receipts
      ),
      lastClosedSnapshot:
        closedTotals && hasActivity(closedTotals)
          ? {
              label: periodContext.lastClosedMonthLabel,
              netSales: closedTotals.netSales,
              collected: closedTotals.collected,
              creditNotes: closedTotals.creditNotes,
            }
          : null,
      collectionDebt: {
        totalDebt,
        overdueDebt,
        overduePct: totalDebt > 0 ? overdueDebt / totalDebt : null,
        periodCollections,
        collectionsVsNetSalesPct: netSales > 0 ? periodCollections / netSales : null,
      },
      topOverdue: buildTopOverdue(input.portfolioRows, code),
      topSalesClients: buildTopSalesClients(input.portfolioRows, code),
      topDebtClients: buildTopDebtClients(input.portfolioRows, code),
      trendDirection: resolveTrendDirection(
        input.invoices,
        input.receipts,
        input.asOfYmd,
        code
      ),
    });
  }

  const executiveBullets = buildExecutiveBullets({
    currencies,
    panorama,
    periodContext,
    invoices: input.invoices,
    receipts: input.receipts,
  });

  return {
    periodLabel: input.periodLabel,
    asOfYmd: input.asOfYmd,
    periodContext,
    panorama,
    currencies,
    executiveBullets,
  };
}

export function riskBadgeTone(level: PanoramaRiskLevel): "stable" | "attention" | "critical" {
  if (level === "critical") return "critical";
  if (level === "attention") return "attention";
  return "stable";
}

export function trendDirectionLabel(dir: TrendDirection): string {
  switch (dir) {
    case "growing":
      return "Creciendo";
    case "declining":
      return "Bajando";
    case "stable":
      return "Estable";
    default:
      return "Sin datos suficientes";
  }
}
