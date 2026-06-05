/**
 * Detalle trazable por KPI — usa valores ya computados en panorama model.
 */

import type { NormalizedCurrencyMetrics } from "@/lib/copilot-cartera-cards-source";
import type { AgingBucket } from "@/lib/copilot-financial-reconciliation";
import type { PanoramaCurrencySlice, PanoramaProjection } from "@/lib/copilot-financial-panorama-model";
import { formatPanoramaRate } from "@/lib/copilot-financial-panorama-model";
import type { HoyPeriodRange } from "@/lib/copilot-hoy-period";
import { formatHoyPeriodLabel } from "@/lib/copilot-hoy-period";
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
  periodLabel?: string;
  currency?: "UYU" | "USD";
  formula?: string;
  explanation?: string;
  rows: FinancialMetricDetailRow[];
  sourceLabel: string;
  updatedAtLabel?: string;
  footnote?: string;
  cta?: { label: string; href: string };
};

export type PanoramaMetricId =
  | "net-income"
  | "collected"
  | "pending"
  | "overdue"
  | "cash"
  | "credit-notes";

export type PanoramaDetailContext = {
  period?: HoyPeriodRange;
  metrics?: NormalizedCurrencyMetrics;
};

function fmt(n: number, currency: "UYU" | "USD"): string {
  return formatMoneyCurrency(n, currency, { compact: n >= 100_000 });
}

function periodLabel(ctx?: PanoramaDetailContext): string | undefined {
  if (!ctx?.period) return undefined;
  return formatHoyPeriodLabel(ctx.period);
}

function countRow(label: string, n: number | undefined): FinancialMetricDetailRow | null {
  if (n == null || n <= 0) return null;
  return { label, value: String(n) };
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

export function buildNetIncomeDetail(
  slice: PanoramaCurrencySlice,
  ctx?: PanoramaDetailContext
): FinancialMetricDetail {
  const rows: FinancialMetricDetailRow[] = [
    { label: "Ventas", value: fmt(slice.netIncome, slice.code), tone: "positive" },
  ];
  const inv = countRow("Comprobantes en período", ctx?.metrics?.invoiceCount);
  if (inv) rows.push(inv);

  return {
    id: "net-income",
    title: `Detalle — Ventas ${slice.code}`,
    subtitle: "Facturación del período.",
    periodLabel: periodLabel(ctx),
    currency: slice.code,
    formula: "Facturas del período en la moneda seleccionada",
    explanation: "Representa lo facturado en el período.",
    rows,
    sourceLabel: "Fuente: Zeta sincronizado / Cartera",
    cta: { label: "Ver Cartera", href: "/copilot/cartera" },
  };
}

export function buildCollectedDetail(
  slice: PanoramaCurrencySlice,
  ctx?: PanoramaDetailContext
): FinancialMetricDetail {
  const rows: FinancialMetricDetailRow[] = [
    { label: "Cobrado", value: fmt(slice.collectedApplied, slice.code), tone: "positive" },
    { label: "Ventas", value: fmt(slice.netIncome, slice.code) },
    { label: "Tasa de cobranza", value: formatPanoramaRate(slice.collectionRate) },
  ];
  const rec = countRow("Recibos en período", ctx?.metrics?.collectedReceiptCount);
  if (rec) rows.push(rec);

  return {
    id: "collected",
    title: `Detalle — Cobrado aplicado ${slice.code}`,
    subtitle: "Cobros registrados sobre ventas del período.",
    periodLabel: periodLabel(ctx),
    currency: slice.code,
    formula: "Cobrado / Ventas = Tasa de cobranza",
    explanation: "Mide cuánto de lo facturado ya fue cobrado o aplicado.",
    rows,
    sourceLabel: "Fuente: Recibos / Cartera resuelta",
    cta: { label: "Ver Recibos", href: "/copilot/datos?entity=receipts" },
  };
}

export function buildPendingDetail(
  slice: PanoramaCurrencySlice,
  ctx?: PanoramaDetailContext
): FinancialMetricDetail {
  const onTime = Math.max(0, slice.pending - slice.overdue);
  const rows: FinancialMetricDetailRow[] = [
    { label: "Pendiente total", value: fmt(slice.pending, slice.code), tone: "warning" },
    { label: "Vencido", value: fmt(slice.overdue, slice.code), tone: slice.overdue > 0 ? "danger" : "neutral" },
    { label: "Al día", value: fmt(onTime, slice.code) },
  ];
  const open = countRow("Facturas abiertas", ctx?.metrics?.pendingInvoiceCount);
  if (open) rows.push(open);

  return {
    id: "pending",
    title: `Detalle — Pendiente ${slice.code}`,
    subtitle: "Saldo abierto de clientes al corte.",
    periodLabel: periodLabel(ctx),
    currency: slice.code,
    formula: "Saldo de facturas abiertas al corte",
    explanation: "No es caja. Es dinero por cobrar.",
    rows,
    sourceLabel: "Fuente: Facturas abiertas / Cartera",
    cta: { label: "Ver Cartera", href: "/copilot/cartera" },
  };
}

export function buildOverdueDetail(
  slice: PanoramaCurrencySlice,
  agingBuckets?: AgingBucket[],
  ctx?: PanoramaDetailContext
): FinancialMetricDetail {
  const rows: FinancialMetricDetailRow[] = [
    { label: "Total vencido", value: fmt(slice.overdue, slice.code), tone: "danger" },
    { label: "Pendiente total", value: fmt(slice.pending, slice.code) },
    { label: "% vencido", value: formatPanoramaRate(slice.overdueRate) },
    ...agingRows(agingBuckets, slice.code),
  ];
  return {
    id: "overdue",
    title: `Detalle — Vencido ${slice.code}`,
    subtitle: "Parte del pendiente con atraso según Cartera.",
    periodLabel: periodLabel(ctx),
    currency: slice.code,
    explanation:
      "Parte del pendiente que ya superó la fecha de cobro o vencimiento.",
    rows,
    sourceLabel: "Fuente: Antigüedad de deuda / Cartera",
    cta: { label: "Ver clientes vencidos", href: "/copilot/cartera" },
  };
}

export function buildCashDetail(
  currency: "UYU" | "USD",
  position: CashPositionByCurrency | undefined,
  projection?: PanoramaProjection,
  ctx?: PanoramaDetailContext
): FinancialMetricDetail {
  const cash = position?.availableCash ?? 0;
  const rows: FinancialMetricDetailRow[] = [];

  if (position?.openingConfigured) {
    rows.push({
      label: "Saldo cargado en Tesorería",
      value: fmt(position.openingBalance ?? 0, currency),
    });
  }
  if ((position?.collectedFromClients ?? 0) !== 0 || position?.openingConfigured) {
    rows.push({
      label: "Cobros Zeta posteriores al corte",
      value: fmt(position?.collectedFromClients ?? 0, currency),
      tone: "positive",
    });
  }
  rows.push(
    { label: "Ingresos manuales", value: fmt(position?.manualIncome ?? 0, currency), tone: "positive" },
    { label: "Egresos manuales", value: fmt(position?.manualExpense ?? 0, currency), tone: "danger" },
    { label: "Caja disponible", value: fmt(cash, currency), tone: cash >= 0 ? "positive" : "danger" }
  );

  let updatedAtLabel: string | undefined;
  if (position?.lastMovement?.date) {
    try {
      updatedAtLabel = new Date(position.lastMovement.date).toLocaleDateString("es-UY", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      updatedAtLabel = position.lastMovement.date;
    }
  }

  return {
    id: "cash",
    title: `Detalle — Caja disponible ${currency}`,
    subtitle: "Dinero operativo actual. No es facturación.",
    periodLabel: periodLabel(ctx),
    currency,
    formula: "Saldo cargado + cobros posteriores + ingresos − egresos = Caja disponible",
    explanation: "Es dinero disponible. No se calcula con facturación histórica.",
    rows,
    sourceLabel: "Fuente: Tesorería",
    updatedAtLabel,
    footnote: "Para ver los movimientos que componen la caja, abrí Tesorería.",
    cta: { label: "Ver Tesorería", href: "/copilot/tesoreria" },
  };
}

export function buildCreditNotesDetail(
  slice: PanoramaCurrencySlice,
  ctx?: PanoramaDetailContext
): FinancialMetricDetail {
  const share =
    slice.grossInvoiced > 0 ? `${Math.round((slice.creditNotes / slice.grossInvoiced) * 100)}%` : "—";
  const rows: FinancialMetricDetailRow[] = [
    { label: "Total ajustes", value: fmt(slice.creditNotes, slice.code), tone: "danger" },
    { label: "Facturación", value: fmt(slice.grossInvoiced, slice.code) },
    { label: "% sobre facturación", value: share },
  ];
  const nc = countRow("Ajustes (cant.)", ctx?.metrics?.creditNoteCount);
  if (nc) rows.push(nc);

  return {
    id: "credit-notes",
    title: `Detalle — Ajustes de factura ${slice.code}`,
    subtitle: "Reducen la facturación del período. No son caja disponible.",
    periodLabel: periodLabel(ctx),
    currency: slice.code,
    formula: "Ajustes / Facturación = % sobre facturación",
    explanation: "Reducen ventas del período. No representan caja.",
    rows,
    sourceLabel: "Fuente: Zeta sincronizado / Facturas",
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
  context?: PanoramaDetailContext;
}): FinancialMetricDetail | null {
  const ctx = input.context;
  switch (input.metricId) {
    case "net-income":
      return input.slice ? buildNetIncomeDetail(input.slice, ctx) : null;
    case "collected":
      return input.slice ? buildCollectedDetail(input.slice, ctx) : null;
    case "pending":
      return input.slice ? buildPendingDetail(input.slice, ctx) : null;
    case "overdue":
      return input.slice ? buildOverdueDetail(input.slice, input.agingBuckets, ctx) : null;
    case "cash":
      return input.currency
        ? buildCashDetail(input.currency, input.cashPosition, input.projection, ctx)
        : null;
    case "credit-notes":
      return input.slice ? buildCreditNotesDetail(input.slice, ctx) : null;
    default:
      return null;
  }
}
