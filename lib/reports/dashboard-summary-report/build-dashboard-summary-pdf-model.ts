/**
 * Pure model builder for the Dashboard Summary PDF.
 * Takes fetched data + params, returns a fully resolved model ready for rendering.
 * No I/O — pure transformation.
 */

import type { AgingRange } from "@/lib/copilot-financial-reconciliation";
import {
  determineDashboardState,
  type DashboardActiveDebtRow,
  type DashboardClientStates,
  type DashboardCurrencyData,
  type DashboardMonthlyPoint,
  type DashboardRecentMovement,
  type DashboardState,
} from "@/lib/copilot-dashboard-summary";
import { consolidateToUsd, roundUsd } from "@/lib/finance/currency-conversion";
import type { DashboardSummaryFetchedData } from "./fetch-dashboard-summary-data";

export type DashboardSummaryPdfCurrency = "all" | "UYU" | "USD" | "USD_consolidated";

export type DashboardSummaryPdfModel = {
  period: { from: string; to: string };
  currency: DashboardSummaryPdfCurrency;
  exchangeRateUyuPerUsd?: number;
  generatedAt: string;
  issuerName: string;
  dashboardState: DashboardState;
  currencyData: DashboardCurrencyData[];
  clientStates: DashboardClientStates;
  monthlyData: DashboardMonthlyPoint[];
  activeDebtRows: DashboardActiveDebtRow[];
  recentMovements: DashboardRecentMovement[];
  top10DebtorsUYU: { name: string; value: number }[];
  top10DebtorsUSD: { name: string; value: number }[];
  top10BillingUYU: { name: string; value: number }[];
  top10BillingUSD: { name: string; value: number }[];
  uyuTop10Pct: number | null;
  usdTop10Pct: number | null;
};

// ── Consolidated mode helpers ───────────────────────────────────────────────

function buildConsolidatedCurrencyData(
  data: DashboardSummaryFetchedData,
  tc: number
): DashboardCurrencyData {
  const uyu = data.currencyData.find((d) => d.currency === "UYU");
  const usd = data.currencyData.find((d) => d.currency === "USD");
  const c = (uyuVal: number, usdVal: number) => roundUsd(consolidateToUsd(uyuVal, usdVal, tc));

  const aging = (["0_30", "31_60", "61_90", "90_plus"] as AgingRange[]).map((range) => {
    const LABELS: Record<AgingRange, string> = { "0_30": "0-30", "31_60": "31-60", "61_90": "61-90", "90_plus": "90+" };
    const uyuAmt = uyu?.aging.find((b) => b.range === range)?.amount ?? 0;
    const usdAmt = usd?.aging.find((b) => b.range === range)?.amount ?? 0;
    return { label: LABELS[range], amount: c(uyuAmt, usdAmt), range };
  });

  const facturado = c(uyu?.facturado ?? 0, usd?.facturado ?? 0);
  const cobrado = c(uyu?.cobrado ?? 0, usd?.cobrado ?? 0);

  return {
    currency: "USD",
    facturado,
    cobrado,
    // Use canonical pendientePeriodo from each currency (pendingAtCutoff from reconciliation),
    // rather than recomputing facturado - cobrado which could drift if the engine changes.
    pendientePeriodo: c(uyu?.pendientePeriodo ?? 0, usd?.pendientePeriodo ?? 0),
    efectividad: usd?.efectividad ?? uyu?.efectividad ?? null,
    deudaActiva: c(uyu?.deudaActiva ?? 0, usd?.deudaActiva ?? 0),
    deudaVencida: c(uyu?.deudaVencida ?? 0, usd?.deudaVencida ?? 0),
    aging,
    cajaDisponible: c(uyu?.cajaDisponible ?? 0, usd?.cajaDisponible ?? 0),
    cajaDespPagos: c(uyu?.cajaDespPagos ?? 0, usd?.cajaDespPagos ?? 0),
  };
}

function consolidateActiveDebtRows(
  rows: DashboardActiveDebtRow[],
  tc: number
): DashboardActiveDebtRow[] {
  const byCompany = new Map<string, DashboardActiveDebtRow>();
  for (const r of rows) {
    const toUsd = (v: number) => r.currency === "USD" ? v : roundUsd(v / tc);
    const existing = byCompany.get(r.companyId);
    if (existing) {
      existing.activeDebt = roundUsd(existing.activeDebt + toUsd(r.activeDebt));
      existing.overdueDebt = roundUsd(existing.overdueDebt + toUsd(r.overdueDebt));
      const days = Math.max(existing.overdueDays ?? 0, r.overdueDays ?? 0);
      existing.overdueDays = days > 0 ? days : null;
    } else {
      byCompany.set(r.companyId, {
        ...r,
        currency: "USD",
        activeDebt: toUsd(r.activeDebt),
        overdueDebt: toUsd(r.overdueDebt),
      });
    }
  }
  return Array.from(byCompany.values()).sort((a, b) => b.activeDebt - a.activeDebt);
}

function consolidateTopItems(
  uyuItems: { name: string; value: number }[],
  usdItems: { name: string; value: number }[],
  tc: number
): { name: string; value: number }[] {
  const byName = new Map<string, number>();
  for (const d of uyuItems) byName.set(d.name, (byName.get(d.name) ?? 0) + roundUsd(d.value / tc));
  for (const d of usdItems) byName.set(d.name, (byName.get(d.name) ?? 0) + d.value);
  return Array.from(byName.entries())
    .map(([name, value]) => ({ name, value: roundUsd(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

// ── Main builder ────────────────────────────────────────────────────────────

export function buildDashboardSummaryPdfModel(
  data: DashboardSummaryFetchedData,
  params: {
    from: string;
    to: string;
    currency: DashboardSummaryPdfCurrency;
    issuerName: string;
    generatedAt: Date;
    exchangeRateUyuPerUsd?: number;
  }
): DashboardSummaryPdfModel {
  const { from, to, currency, issuerName, generatedAt, exchangeRateUyuPerUsd } = params;

  // ── USD_consolidated path ────────────────────────────────────────────────
  if (currency === "USD_consolidated" && exchangeRateUyuPerUsd) {
    const tc = exchangeRateUyuPerUsd;
    const consolidatedCurrencyData = buildConsolidatedCurrencyData(data, tc);
    const consolidatedDebtRows = consolidateActiveDebtRows(data.activeDebtRows, tc);
    const consolidatedTopDebtors = consolidateTopItems(data.top10DebtorsUYU, data.top10DebtorsUSD, tc);
    const consolidatedTopBilling = consolidateTopItems(data.top10BillingUYU, data.top10BillingUSD, tc);
    const totalConsolidatedDebt = consolidatedCurrencyData.deudaActiva;
    const top10Sum = consolidatedTopDebtors.reduce((s, d) => s + d.value, 0);
    const top10Pct = totalConsolidatedDebt > 0 ? Math.round((top10Sum / totalConsolidatedDebt) * 100) : null;

    return {
      period: { from, to },
      currency: "USD_consolidated",
      exchangeRateUyuPerUsd: tc,
      generatedAt: generatedAt.toISOString(),
      issuerName,
      dashboardState: determineDashboardState([consolidatedCurrencyData], data.clientStates),
      currencyData: [consolidatedCurrencyData],
      clientStates: data.clientStates,
      monthlyData: data.monthlyData,
      activeDebtRows: consolidatedDebtRows,
      recentMovements: data.recentMovements,
      top10DebtorsUYU: [],
      top10DebtorsUSD: consolidatedTopDebtors,
      top10BillingUYU: [],
      top10BillingUSD: consolidatedTopBilling,
      uyuTop10Pct: null,
      usdTop10Pct: top10Pct,
    };
  }

  // ── Standard path ────────────────────────────────────────────────────────

  const currencyData =
    currency === "all"
      ? data.currencyData
      : data.currencyData.filter((d) => d.currency === currency);

  const activeDebtRows =
    currency === "all"
      ? data.activeDebtRows
      : data.activeDebtRows.filter((r) => r.currency === currency);

  const recentMovements =
    currency === "all"
      ? data.recentMovements
      : data.recentMovements.filter((m) => m.currency === currency);

  const uyu = data.currencyData.find((d) => d.currency === "UYU");
  const usd = data.currencyData.find((d) => d.currency === "USD");

  const uyuTop10Sum = data.top10DebtorsUYU.reduce((s, d) => s + d.value, 0);
  const usdTop10Sum = data.top10DebtorsUSD.reduce((s, d) => s + d.value, 0);
  const uyuTop10Pct =
    (uyu?.deudaActiva ?? 0) > 0 ? Math.round((uyuTop10Sum / uyu!.deudaActiva) * 100) : null;
  const usdTop10Pct =
    (usd?.deudaActiva ?? 0) > 0 ? Math.round((usdTop10Sum / usd!.deudaActiva) * 100) : null;

  const dashboardState = determineDashboardState(currencyData, data.clientStates);

  return {
    period: { from, to },
    currency,
    generatedAt: generatedAt.toISOString(),
    issuerName,
    dashboardState,
    currencyData,
    clientStates: data.clientStates,
    monthlyData: data.monthlyData,
    activeDebtRows,
    recentMovements,
    top10DebtorsUYU: currency === "USD" ? [] : data.top10DebtorsUYU,
    top10DebtorsUSD: currency === "UYU" ? [] : data.top10DebtorsUSD,
    top10BillingUYU: currency === "USD" ? [] : data.top10BillingUYU,
    top10BillingUSD: currency === "UYU" ? [] : data.top10BillingUSD,
    uyuTop10Pct: currency === "USD" ? null : uyuTop10Pct,
    usdTop10Pct: currency === "UYU" ? null : usdTop10Pct,
  };
}
