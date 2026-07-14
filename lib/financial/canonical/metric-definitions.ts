/**
 * FINANCIAL CANONICAL LAYER — Diccionario de métricas.
 *
 * Puente hacia el contrato ya existente y testeado
 * (`lib/copilot-financial-metrics-contract.ts`), que es la fuente única de IDs,
 * labels, fórmulas y consumidores. Esta capa NO redefine labels: los reexporta
 * y mapea cada builder canónico a su `MetricId`.
 *
 * Los módulos deben tomar sus etiquetas de aquí — nunca inventar labels ad-hoc.
 */

export {
  METRIC_ID,
  METRIC_LABEL,
  METRIC_ALIASES,
  METRIC_PROHIBITED_LABELS,
  CANONICAL_METRICS,
  COLLECTION_RATE_METRIC_ID,
  COLLECTION_RATE_METRICS,
  CURRENCY_INTEGRITY_RULES,
  METRIC_SEPARATED_CURRENCY_DISCLAIMER,
  METRIC_USD_CONSOLIDATED_DISCLAIMER,
} from "@/lib/copilot-financial-metrics-contract";
export type {
  MetricId,
  CanonicalMetricDef,
  CollectionRateMetricId,
} from "@/lib/copilot-financial-metrics-contract";

import type { MetricId } from "@/lib/copilot-financial-metrics-contract";

/**
 * Mapa builder canónico → campo → `MetricId` del contrato. Documenta qué métrica
 * del diccionario alimenta cada valor que producen los builders de esta capa.
 */
export const CANONICAL_BUILDER_METRIC_MAP = {
  sales: {
    issuedNet: "facturado_periodo",
    appliedCollected: "cobrado_aplicado",
    pendingAtCutoff: "pendiente_periodo",
  },
  registeredCollections: {
    registeredCollections: "cobrado_periodo",
  },
  debt: {
    pendingBalance: "deuda_activa",
    overdueBalance: "deuda_vencida",
  },
} as const satisfies Record<string, Record<string, MetricId>>;
