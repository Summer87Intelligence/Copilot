/**
 * Modelo de lectura para /copilot/finanzas — agrega fuentes existentes sin recalcular motor.
 *
 * Fuentes:
 * - Período / cartera: `NormalizedCurrencyMetrics` (financial-reconciliation → cartera-cards-source)
 * - Vencido: `agingByCurrency` (mismo motor que Cartera)
 * - Proyección: `FinancialSnapshotApiV1` (selectores snapshot)
 * - Caja: Tesorería `CashPositionByCurrency.availableCash`
 */

import type { NormalizedCurrencyMetrics } from "@/lib/copilot-cartera-cards-source";
import { sumCarteraAgingOverdue } from "@/lib/copilot-cartera-aging-totals";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type {
  AgingBucket,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";
import {
  snapshotExpectedOutflowsTotal,
  snapshotLiquidityBalance,
  snapshotReceivablesRiskWeighted,
  snapshotRiskBand,
} from "@/lib/copilot-financial-snapshot-selectors";
import type { CashPositionByCurrency } from "@/lib/treasury/treasury-cash-position";

export type PanoramaCurrencyCode = ReconciliationCurrencyCode;

export type PanoramaCurrencySlice = {
  code: PanoramaCurrencyCode;
  grossInvoiced: number;
  creditNotes: number;
  netIncome: number;
  collectedApplied: number;
  pending: number;
  overdue: number;
  collectionRate: number | null;
  overdueRate: number | null;
};

export type PanoramaRiskLevel = "low" | "attention" | "critical";

export type PanoramaConcentration = {
  clientName: string;
  amount: number;
  currency: PanoramaCurrencyCode;
  sharePct: number;
};

export type PanoramaProjection = {
  cashTodayUyu: number;
  cashTodayUsd: number;
  expectedCollections: number;
  upcomingOutflows: number;
  estimatedCash30d: number;
  hasOutflows: boolean;
  coverageRatio: number | null;
};

export type PanoramaFiscalSummary = {
  upcomingCount: number;
  overdueCount: number;
  paidCount: number;
  estimated30: number;
  isEmpty: boolean;
};

export type PanoramaPriorityCta = {
  href: string;
  label: string;
};

export type FinancialPanoramaModel = {
  periodLabel: string;
  currencies: PanoramaCurrencySlice[];
  projection: PanoramaProjection;
  risk: { level: PanoramaRiskLevel; label: string };
  concentration: PanoramaConcentration | null;
  fiscal: PanoramaFiscalSummary;
  priorityCta: PanoramaPriorityCta;
  executiveLines: string[];
};

export function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Math.min(1, Math.max(0, numerator / denominator));
}

export function formatPanoramaRate(ratio: number | null): string {
  if (ratio == null) return "—";
  return `${Math.round(ratio * 100)}%`;
}

export function buildPanoramaCurrencySlice(
  metrics: NormalizedCurrencyMetrics,
  overdueAmount: number
): PanoramaCurrencySlice {
  const grossInvoiced = metrics.issuedInPeriod;
  const creditNotes = metrics.creditNoteAmount;
  const netIncome = metrics.issuedInPeriodNet;
  const collectedApplied = metrics.portfolioResolvedAmount;
  const pending = metrics.pendingAtCutoff;
  const overdue = Math.max(0, overdueAmount);

  return {
    code: metrics.currencyCode,
    grossInvoiced,
    creditNotes,
    netIncome,
    collectedApplied,
    pending,
    overdue,
    collectionRate: safeRatio(collectedApplied, netIncome),
    overdueRate: safeRatio(overdue, pending),
  };
}

export function buildPanoramaCurrencySlices(input: {
  metricsByCode: Partial<Record<PanoramaCurrencyCode, NormalizedCurrencyMetrics>>;
  agingByCurrency?: Partial<Record<PanoramaCurrencyCode, AgingBucket[]>>;
}): PanoramaCurrencySlice[] {
  const overdueTotals = sumCarteraAgingOverdue(input.agingByCurrency ?? {});
  const codes: PanoramaCurrencyCode[] = ["UYU", "USD"];
  const out: PanoramaCurrencySlice[] = [];

  for (const code of codes) {
    const metrics = input.metricsByCode[code];
    if (!metrics) continue;
    const hasActivity =
      metrics.issuedInPeriod > 0 ||
      metrics.pendingAtCutoff > 0 ||
      metrics.creditNoteAmount > 0 ||
      metrics.portfolioResolvedAmount > 0;
    if (!hasActivity) continue;
    out.push(
      buildPanoramaCurrencySlice(metrics, code === "UYU" ? overdueTotals.UYU : overdueTotals.USD)
    );
  }

  return out;
}

function mapSnapshotRisk(
  snapshot: FinancialSnapshotApiV1 | null,
  cashUyu: number,
  cashUsd: number,
  overdueUyu: number,
  overdueUsd: number,
  pendingUyu: number,
  pendingUsd: number
): { level: PanoramaRiskLevel; label: string } {
  const totalCash = cashUyu + cashUsd;
  const totalOverdue = overdueUyu + overdueUsd;
  const totalPending = pendingUyu + pendingUsd;
  const overdueShare = safeRatio(totalOverdue, totalPending);

  if (totalCash < 0 || (snapshot != null && snapshotRiskBand(snapshot) === "critical")) {
    return { level: "critical", label: "Crítico" };
  }

  const liquidity = snapshot ? snapshotLiquidityBalance(snapshot) : 0;
  const band = snapshot != null ? snapshotRiskBand(snapshot) : "low";

  if (
    totalCash <= 0 ||
    liquidity < 0 ||
    band === "high" ||
    (overdueShare != null && overdueShare > 0.3)
  ) {
    return { level: "attention", label: "Atención" };
  }

  return { level: "low", label: "Bajo" };
}

export function buildPanoramaProjection(input: {
  snapshot: FinancialSnapshotApiV1 | null;
  cashPositions: readonly CashPositionByCurrency[];
}): PanoramaProjection {
  const cashTodayUyu =
    input.cashPositions.find((p) => p.currency === "UYU")?.availableCash ?? 0;
  const cashTodayUsd =
    input.cashPositions.find((p) => p.currency === "USD")?.availableCash ?? 0;
  const expectedCollections = input.snapshot
    ? snapshotReceivablesRiskWeighted(input.snapshot)
    : 0;
  const upcomingOutflows = input.snapshot ? snapshotExpectedOutflowsTotal(input.snapshot) : 0;
  const estimatedCash30d = input.snapshot ? snapshotLiquidityBalance(input.snapshot) : 0;
  const hasOutflows = upcomingOutflows > 0;

  let coverageRatio: number | null = null;
  if (hasOutflows && input.snapshot) {
    const ratio = input.snapshot.projected?.coverage_ratio ?? input.snapshot.coverage_ratio;
    coverageRatio = Number.isFinite(ratio) && ratio <= 100 ? ratio : null;
  }

  return {
    cashTodayUyu,
    cashTodayUsd,
    expectedCollections,
    upcomingOutflows,
    estimatedCash30d,
    hasOutflows,
    coverageRatio,
  };
}

export function findTopDebtConcentration(input: {
  rows: readonly {
    name?: string | null;
    company_name?: string | null;
    debt_uyu?: number;
    debt_usd?: number;
    debtUYU?: number;
    debtUSD?: number;
  }[];
}): PanoramaConcentration | null {
  let best: PanoramaConcentration | null = null;

  for (const row of input.rows) {
    const name = String(row.name ?? row.company_name ?? "").trim();
    if (!name) continue;

    for (const currency of ["UYU", "USD"] as const) {
      const amount =
        currency === "UYU"
          ? (row.debt_uyu ?? row.debtUYU ?? 0)
          : (row.debt_usd ?? row.debtUSD ?? 0);
      if (amount <= 0) continue;
      if (!best || amount > best.amount) {
        best = { clientName: name, amount, currency, sharePct: 0 };
      }
    }
  }

  if (!best) return null;

  const totalPendingSameCurrency = input.rows.reduce(
    (s, r) =>
      s +
      (best!.currency === "UYU"
        ? (r.debt_uyu ?? r.debtUYU ?? 0)
        : (r.debt_usd ?? r.debtUSD ?? 0)),
    0
  );
  best = {
    ...best,
    sharePct:
      totalPendingSameCurrency > 0
        ? Math.round((best.amount / totalPendingSameCurrency) * 100)
        : 0,
  };

  return best;
}

export function buildPanoramaFiscalSummary(input: {
  upcomingCount: number;
  overdueCount: number;
  paidCount: number;
  estimated30: number;
}): PanoramaFiscalSummary {
  const isEmpty =
    input.upcomingCount === 0 &&
    input.overdueCount === 0 &&
    input.paidCount === 0 &&
    input.estimated30 <= 0;
  return { ...input, isEmpty };
}

export function resolvePanoramaPriorityCta(input: {
  currencies: PanoramaCurrencySlice[];
  projection: PanoramaProjection;
  risk: PanoramaRiskLevel;
}): PanoramaPriorityCta {
  const totalOverdue = input.currencies.reduce((s, c) => s + c.overdue, 0);
  const totalPending = input.currencies.reduce((s, c) => s + c.pending, 0);
  const cashLow =
    input.projection.cashTodayUyu + input.projection.cashTodayUsd <= 0 ||
    input.risk === "critical";

  if (totalOverdue > 0) {
    return { href: "/copilot/cartera", label: "Ver clientes vencidos" };
  }
  if (cashLow || input.risk === "attention") {
    return { href: "/copilot/tesoreria", label: "Ver Tesorería" };
  }
  if (!input.projection.hasOutflows && totalPending > 0) {
    return { href: "/copilot/reportes", label: "Generar reporte de deudores" };
  }
  if (!input.projection.hasOutflows) {
    return {
      href: "/copilot/tesoreria?section=programados",
      label: "Cargar pago programado",
    };
  }
  return { href: "/copilot/cartera", label: "Ver Cartera" };
}

export function buildPanoramaExecutiveLines(input: {
  currencies: PanoramaCurrencySlice[];
  projection: PanoramaProjection;
  priorityLabel: string;
}): string[] {
  const lines: string[] = [];

  if (input.currencies.length === 0) {
    lines.push("Todavía no hay métricas de período para mostrar.");
    return lines;
  }

  for (const c of input.currencies) {
    const prefix = input.currencies.length > 1 ? `${c.code}: ` : "";
    lines.push(
      `${prefix}El negocio generó ingresos netos en el período; se cobró ${formatPanoramaRate(c.collectionRate)} del neto.`
    );
    if (c.pending > 0) {
      lines.push(
        `${prefix}Quedan saldos por cobrar; ${formatPanoramaRate(c.overdueRate)} del pendiente está vencido.`
      );
    }
  }

  if (input.projection.cashTodayUyu > 0 || input.projection.cashTodayUsd > 0) {
    const parts: string[] = [];
    if (input.projection.cashTodayUyu > 0) parts.push(`UYU ${Math.round(input.projection.cashTodayUyu).toLocaleString("es-AR")}`);
    if (input.projection.cashTodayUsd > 0) parts.push(`USD ${Math.round(input.projection.cashTodayUsd).toLocaleString("es-AR")}`);
    lines.push(`La caja disponible actual (Tesorería) es ${parts.join(" · ")}.`);
  } else {
    lines.push("La caja disponible se consulta en Tesorería; acá no se mezcla con facturación.");
  }

  lines.push(`Prioridad sugerida: ${input.priorityLabel.replace(/^Ver /, "").toLowerCase()}.`);
  return lines;
}

export function buildFinancialPanoramaModel(input: {
  periodLabel: string;
  metricsByCode: Partial<Record<PanoramaCurrencyCode, NormalizedCurrencyMetrics>>;
  agingByCurrency?: Partial<Record<PanoramaCurrencyCode, AgingBucket[]>>;
  snapshot: FinancialSnapshotApiV1 | null;
  cashPositions: readonly CashPositionByCurrency[];
  portfolioRows: readonly {
    name?: string | null;
    company_name?: string | null;
    debt_uyu?: number;
    debt_usd?: number;
    debtUYU?: number;
    debtUSD?: number;
  }[];
  fiscal: PanoramaFiscalSummary;
}): FinancialPanoramaModel {
  const currencies = buildPanoramaCurrencySlices({
    metricsByCode: input.metricsByCode,
    agingByCurrency: input.agingByCurrency,
  });

  const overdueTotals = sumCarteraAgingOverdue(input.agingByCurrency ?? {});
  const pendingUyu = input.metricsByCode.UYU?.pendingAtCutoff ?? 0;
  const pendingUsd = input.metricsByCode.USD?.pendingAtCutoff ?? 0;

  const projection = buildPanoramaProjection({
    snapshot: input.snapshot,
    cashPositions: input.cashPositions,
  });

  const risk = mapSnapshotRisk(
    input.snapshot,
    projection.cashTodayUyu,
    projection.cashTodayUsd,
    overdueTotals.UYU,
    overdueTotals.USD,
    pendingUyu,
    pendingUsd
  );

  const concentration = findTopDebtConcentration({ rows: input.portfolioRows });
  const priorityCta = resolvePanoramaPriorityCta({
    currencies,
    projection,
    risk: risk.level,
  });

  const executiveLines = buildPanoramaExecutiveLines({
    currencies,
    projection,
    priorityLabel: priorityCta.label,
  });

  return {
    periodLabel: input.periodLabel,
    currencies,
    projection,
    risk,
    concentration,
    fiscal: input.fiscal,
    priorityCta,
    executiveLines,
  };
}

export function shouldShowExpandedFiscalBlock(fiscal: PanoramaFiscalSummary): boolean {
  return !fiscal.isEmpty;
}
