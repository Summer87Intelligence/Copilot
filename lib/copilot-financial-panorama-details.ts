/**
 * Detalle trazable por KPI — usa valores ya computados en panorama model.
 */

import type { AgingBucket } from "@/lib/copilot-financial-reconciliation";
import type { PanoramaCurrencySlice, PanoramaProjection } from "@/lib/copilot-financial-panorama-model";
import { formatPanoramaRate } from "@/lib/copilot-financial-panorama-model";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";

export type FinancialMetricDetailRow = {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
};

export type FinancialMetricDetail = {
  id: string;
  title: string;
  subtitle: string;
  formula?: string;
  rows: FinancialMetricDetailRow[];
  sourceLabel: string;
  cta?: { label: string; href: string };
};

export type PanoramaMetricId =
  | "net-income"
  | "collected"
  | "pending"
  | "overdue"
  | "cash"
  | "credit-notes";

function fmt(n: number, currency: "UYU" | "USD"): string {
  return formatMoneyCurrency(n, currency, { compact: n >= 100_000 });
}

function agingRows(
  buckets: AgingBucket[] | undefined,
  currency: "UYU" | "USD"
): FinancialMetricDetailRow[] {
  if (!buckets?.length) return [];
  const labels: Record<string, string> = {
    "0_30": "1–30 días",
    "31_60": "31–60 días",
    "61_90": "61–90 días",
    "90_plus": "+90 días",
  };
  return buckets
    .filter((b) => b.amount > 0)
    .map((b) => ({
      label: labels[b.range] ?? b.range,
      value: fmt(b.amount, currency),
      tone: b.range === "0_30" ? ("neutral" as const) : ("warning" as const),
    }));
}

export function buildNetIncomeDetail(slice: PanoramaCurrencySlice): FinancialMetricDetail {
  return {
    id: "net-income",
    title: `Ingresos netos (${slice.code})`,
    subtitle: "Facturación del período menos notas de crédito.",
    formula: "Bruto − Notas de crédito = Neto",
    rows: [
      { label: "Facturación bruta", value: fmt(slice.grossInvoiced, slice.code) },
      { label: "Notas de crédito", value: fmt(slice.creditNotes, slice.code), tone: "danger" },
      { label: "Ingresos netos", value: fmt(slice.netIncome, slice.code), tone: "positive" },
      { label: "Moneda", value: slice.code },
    ],
    sourceLabel: "Cartera / reconciliación Zeta (period_only)",
    cta: { label: "Ver Cartera", href: "/copilot/cartera" },
  };
}

export function buildCollectedDetail(slice: PanoramaCurrencySlice): FinancialMetricDetail {
  return {
    id: "collected",
    title: `Cobrado aplicado (${slice.code})`,
    subtitle: "Cartera resuelta en el período.",
    formula: "Cobrado / Neto = Tasa de cobranza",
    rows: [
      { label: "Cobrado aplicado", value: fmt(slice.collectedApplied, slice.code), tone: "positive" },
      { label: "Ingresos netos", value: fmt(slice.netIncome, slice.code) },
      { label: "Tasa de cobranza", value: formatPanoramaRate(slice.collectionRate) },
      { label: "Moneda", value: slice.code },
    ],
    sourceLabel: "Recibos y cartera resuelta (portfolioResolvedAmount)",
    cta: { label: "Ver Datos", href: "/copilot/datos?entity=receipts" },
  };
}

export function buildPendingDetail(slice: PanoramaCurrencySlice): FinancialMetricDetail {
  const onTime = Math.max(0, slice.pending - slice.overdue);
  return {
    id: "pending",
    title: `Pendiente por cobrar (${slice.code})`,
    subtitle: "Saldo abierto de clientes al corte.",
    rows: [
      { label: "Pendiente total", value: fmt(slice.pending, slice.code), tone: "warning" },
      { label: "Vencido", value: fmt(slice.overdue, slice.code), tone: slice.overdue > 0 ? "danger" : "neutral" },
      { label: "Al día (estimado)", value: fmt(onTime, slice.code) },
      { label: "Moneda", value: slice.code },
    ],
    sourceLabel: "Facturas abiertas / cartera (pendingAtCutoff)",
    cta: { label: "Ver Cartera", href: "/copilot/cartera" },
  };
}

export function buildOverdueDetail(
  slice: PanoramaCurrencySlice,
  agingBuckets?: AgingBucket[]
): FinancialMetricDetail {
  const rows: FinancialMetricDetailRow[] = [
    { label: "Total vencido", value: fmt(slice.overdue, slice.code), tone: "danger" },
    { label: "% sobre pendiente", value: formatPanoramaRate(slice.overdueRate) },
    ...agingRows(agingBuckets, slice.code),
  ];
  return {
    id: "overdue",
    title: `Vencido (${slice.code})`,
    subtitle: "Parte del pendiente con atraso según aging de Cartera.",
    rows,
    sourceLabel: "Aging Cartera (31–60 + 61–90 + +90 días)",
    cta: { label: "Ver clientes vencidos", href: "/copilot/cartera" },
  };
}

export function buildCashDetail(
  currency: "UYU" | "USD",
  position: CashPositionByCurrency | undefined,
  projection?: PanoramaProjection
): FinancialMetricDetail {
  const cash = position?.availableCash ?? 0;
  const rows: FinancialMetricDetailRow[] = [
    {
      label: "Saldo cargado al corte",
      value: fmt(position?.openingBalance ?? 0, currency),
    },
    {
      label: "Cobros Zeta post-corte",
      value: fmt(position?.collectedFromClients ?? 0, currency),
      tone: "positive",
    },
    { label: "Ingresos manuales", value: fmt(position?.manualIncome ?? 0, currency), tone: "positive" },
    { label: "Egresos manuales", value: fmt(position?.manualExpense ?? 0, currency), tone: "danger" },
    { label: "Caja disponible", value: fmt(cash, currency), tone: cash >= 0 ? "positive" : "danger" },
    { label: "Moneda", value: currency },
  ];
  if (projection?.hasOutflows) {
    rows.push({
      label: "Pagos próximos (proyección)",
      value: formatMoneyCurrency(projection.upcomingOutflows, null, { compact: true }),
      tone: "warning",
    });
  }
  return {
    id: "cash",
    title: `Caja disponible (${currency})`,
    subtitle: "Dinero operativo actual. No es facturación.",
    formula: "Saldo corte + cobros + ingresos − egresos = Caja disponible",
    rows,
    sourceLabel: "Tesorería (cash-position)",
    cta: { label: "Ver Tesorería", href: "/copilot/tesoreria" },
  };
}

export function buildCreditNotesDetail(slice: PanoramaCurrencySlice): FinancialMetricDetail {
  const share =
    slice.grossInvoiced > 0 ? `${Math.round((slice.creditNotes / slice.grossInvoiced) * 100)}%` : "—";
  return {
    id: "credit-notes",
    title: `Notas de crédito (${slice.code})`,
    subtitle: "Reducen ingresos netos. No son caja disponible.",
    rows: [
      { label: "Total NC período", value: fmt(slice.creditNotes, slice.code), tone: "danger" },
      { label: "% sobre bruto", value: share },
      { label: "Facturación bruta", value: fmt(slice.grossInvoiced, slice.code) },
      { label: "Moneda", value: slice.code },
    ],
    sourceLabel: "Comprobantes NC detectados en reconciliación",
    cta: { label: "Ver Cartera", href: "/copilot/cartera" },
  };
}

export function buildPanoramaMetricDetail(input: {
  metricId: PanoramaMetricId;
  slice?: PanoramaCurrencySlice;
  currency?: "UYU" | "USD";
  cashPosition?: CashPositionByCurrency;
  projection?: PanoramaProjection;
  agingBuckets?: AgingBucket[];
}): FinancialMetricDetail | null {
  switch (input.metricId) {
    case "net-income":
      return input.slice ? buildNetIncomeDetail(input.slice) : null;
    case "collected":
      return input.slice ? buildCollectedDetail(input.slice) : null;
    case "pending":
      return input.slice ? buildPendingDetail(input.slice) : null;
    case "overdue":
      return input.slice ? buildOverdueDetail(input.slice, input.agingBuckets) : null;
    case "cash":
      return input.currency
        ? buildCashDetail(input.currency, input.cashPosition, input.projection)
        : null;
    case "credit-notes":
      return input.slice ? buildCreditNotesDetail(input.slice) : null;
    default:
      return null;
  }
}
