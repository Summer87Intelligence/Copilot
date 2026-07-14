/**
 * FINANCIAL CANONICAL LAYER — Barrel público.
 *
 * Punto de entrada único de la capa canónica financiera. Los consumidores deben
 * importar desde `@/lib/financial/canonical`, no desde los submódulos.
 *
 * Ver: docs/technical/financial-canonical-layer.md
 */

export * from "./types";
export {
  buildCanonicalFinancialContext,
  canonicalPeriodFromContext,
} from "./report-context";
export type { BuildCanonicalFinancialContextInput } from "./report-context";
export {
  SUPPORTED_CURRENCIES,
  normalizeCurrency,
  roundMoney,
  consolidateCanonicalToUsd,
  convertMoneyToUsd,
  consolidateToUsd,
  formatExchangeRateLabel,
  roundUsd,
} from "./currency";
export { buildCanonicalSalesMetrics } from "./sales";
export { buildCanonicalRegisteredCollectionsMetrics } from "./collections";
export {
  buildCanonicalCollectionsSnapshot,
} from "./collections-snapshot";
export type {
  BuildCanonicalCollectionsSnapshotInput,
  CanonicalAppliedCollectionsMetrics,
  CanonicalCollectionsDiagnostic,
  CanonicalCollectionsDiagnosticCode,
  CanonicalCollectionsSnapshot,
  CanonicalCollectionsSnapshotCurrency,
  CanonicalRegisteredCollectionsMetricsExplicit,
} from "./collections-snapshot";
export { buildCanonicalDebtMetrics, buildCanonicalDebtMetricsFromUnits } from "./debt";
export { buildCanonicalAgingMetrics, buildCanonicalAgingMetricsFromUnits } from "./aging";
export { buildCanonicalDebtUnits, isDebtUnitOverdue } from "./debt-units";
export type { BuildCanonicalDebtUnitsInput } from "./debt-units";
export { buildCanonicalDebtSnapshot } from "./snapshot";
export type { BuildCanonicalDebtSnapshotInput } from "./snapshot";
export {
  buildCanonicalFinancialSummary,
} from "./summary";
export type { BuildCanonicalFinancialSummaryInput } from "./summary";
export {
  METRIC_ID,
  METRIC_LABEL,
  CANONICAL_METRICS,
  CANONICAL_BUILDER_METRIC_MAP,
} from "./metric-definitions";
export type { MetricId } from "./metric-definitions";
