/**
 * Sistema central de vocabulario financiero de Copilot.
 *
 * Fuente única de verdad para:
 *  - Etiquetas de términos financieros (en español, estilo Summer87 Copilot).
 *  - Descripción de cada fuente de datos y su alcance.
 *  - Tipos para badges de proveniencia (Fuente · Período · Alcance).
 *  - Re-exports de las funciones de formato compartidas.
 *
 * Regla: ningún componente hardcodea "Pesos", "U$S", "Zeta API",
 * "Historial completo" ni conceptos similares. Importa desde aquí.
 *
 * No importar librerías externas. Solo tipos y constantes puras.
 */

// ---------------------------------------------------------------------------
// Re-exports de formato (fuente única — usa es-UY en todo el producto)
// ---------------------------------------------------------------------------

export {
  currencyLabelFor,
  currencyShortLabelFor,
  currencySymbolFor,
  deriveCollectionEffectiveness,
  formatCarteraInteger,
  formatCarteraMoney,
  formatCarteraPercent,
  formatRelativeAgeHours,
  pickMostRecentSync,
  pickWorstSyncStatus,
} from "@/lib/copilot-cartera-format";

// ---------------------------------------------------------------------------
// Vocabulario financiero — términos canónicos
// ---------------------------------------------------------------------------

export const FT = {
  // Montos
  facturado:           "Facturado",
  cobrado:             "Cobrado",
  pendiente:           "Pendiente",
  saldoPendiente:      "Saldo pendiente",
  saldoOperativo:      "Saldo operativo",
  deudaHistorica:      "Deuda histórica",
  carteraActiva:       "Cartera activa",

  // Métricas
  efectividadCobranza: "Efectividad de cobranza",
  efectividad:         "Efectividad",
  aging:               "Aging",
  agingOperativo:      "Aging operativo",

  // Estados
  reconciled:          "Reconciliado",
  stale:               "Desactualizado",
  orphan:              "Huérfano",
  outstanding:         "Con saldo abierto",

  // Período
  periodoOperativo:    "Período operativo",
  historialCompleto:   "Historial completo",
  excluido:            "Excluido",

  // Clientes
  topDeudores:         "Top deudores",
  clientesConDeuda:    "Clientes con deuda",
  clientesEnRiesgo:    "Clientes en riesgo",
} as const;

export type FinancialTermKey = keyof typeof FT;

// ---------------------------------------------------------------------------
// Aging — etiquetas de rango canónicas (display)
// ---------------------------------------------------------------------------

/** Etiquetas de pantalla para aging buckets. Formato unificado en todo el producto. */
export const AGING_DISPLAY_LABELS = {
  "0_30":    "0–30 días",
  "31_60":   "31–60 días",
  "61_90":   "61–90 días",
  "90_plus": "+90 días",
  // Aliases del sistema del home (formato antiguo)
  "0-30":    "0–30 días",
  "31-60":   "31–60 días",
  "61-90":   "61–90 días",
  "90+":     "+90 días",
} as const;

export type AgingRangeKey = keyof typeof AGING_DISPLAY_LABELS;

export function agingDisplayLabel(range: string): string {
  return (AGING_DISPLAY_LABELS as Record<string, string>)[range] ?? range;
}

// ---------------------------------------------------------------------------
// Moneda — etiquetas canónicas
// ---------------------------------------------------------------------------

export const CURRENCY_DISPLAY_LABELS: Record<string, string> = {
  UYU: "Pesos uruguayos",
  USD: "Dólares",
};

export const CURRENCY_SHORT_LABELS: Record<string, string> = {
  UYU: "Pesos",
  USD: "Dólares",
};

export function currencyDisplayLabel(code: string): string {
  return CURRENCY_DISPLAY_LABELS[code] ?? code;
}

// ---------------------------------------------------------------------------
// Fuentes de datos — proveniencia
// ---------------------------------------------------------------------------

export type DataSourceId =
  | "zeta_api"          // Zeta API directa (proto_invoices is_active=true, sincronizado)
  | "dataset_api"       // Dataset API interno (proto_invoices all — activas + archivadas)
  | "analytics"         // Derivado en backend (cálculos sobre datos persistidos)
  | "reconciliation"    // Motor de reconciliación financiera
  | "manual";           // Ingresado manualmente por el usuario

export type DataSourceMeta = {
  id: DataSourceId;
  label: string;
  description: string;
  /** Clase de color Tailwind para el badge. */
  badgeClass: string;
};

export const DATA_SOURCES: Record<DataSourceId, DataSourceMeta> = {
  zeta_api: {
    id: "zeta_api",
    label: "Zeta API",
    description: "Datos sincronizados desde Zeta Software. Solo facturas activas (is_active=true).",
    badgeClass: "border-emerald-200/70 bg-emerald-50/70 text-emerald-800",
  },
  dataset_api: {
    id: "dataset_api",
    label: "Dataset",
    description: "Dataset interno completo: facturas activas y archivadas. Incluye todo el historial.",
    badgeClass: "border-sky-200/70 bg-sky-50/70 text-sky-800",
  },
  analytics: {
    id: "analytics",
    label: "Analytics",
    description: "Métrica derivada en backend a partir de datos persistidos. No requiere sync Zeta.",
    badgeClass: "border-[var(--copilot-border)] bg-white/70 text-[var(--copilot-ink-muted)]",
  },
  reconciliation: {
    id: "reconciliation",
    label: "Recon",
    description: "Resultado del motor de reconciliación financiera (activas reconciliadas).",
    badgeClass: "border-amber-200/70 bg-amber-50/60 text-amber-800",
  },
  manual: {
    id: "manual",
    label: "Manual",
    description: "Dato ingresado manualmente por el usuario o el equipo.",
    badgeClass: "border-violet-200/70 bg-violet-50/60 text-violet-800",
  },
};

// ---------------------------------------------------------------------------
// Períodos — etiquetas
// ---------------------------------------------------------------------------

export type PeriodScopeId =
  | "operational_2026"   // 2026-01-01 → hoy (período operativo)
  | "full_history"        // Todo el historial (2025 + 2026 + anterior)
  | "current_month"       // Mes actual
  | "custom";             // Período personalizado

export type PeriodScopeMeta = {
  id: PeriodScopeId;
  label: string;
  description: string;
  badgeClass: string;
};

export const PERIOD_SCOPES: Record<PeriodScopeId, PeriodScopeMeta> = {
  operational_2026: {
    id: "operational_2026",
    label: "2026+",
    description: "Período operativo: 01/01/2026 → hoy. Excluye deuda histórica pre-2026.",
    badgeClass: "border-emerald-200/70 bg-emerald-50/70 text-emerald-800",
  },
  full_history: {
    id: "full_history",
    label: "Historial",
    description: "Todo el historial de facturas. Incluye datos pre-2026.",
    badgeClass: "border-amber-200/70 bg-amber-50/60 text-amber-800",
  },
  current_month: {
    id: "current_month",
    label: "Mes actual",
    description: "Solo el mes corriente.",
    badgeClass: "border-sky-200/70 bg-sky-50/70 text-sky-800",
  },
  custom: {
    id: "custom",
    label: "Período",
    description: "Rango personalizado.",
    badgeClass: "border-[var(--copilot-border)] bg-white/70 text-[var(--copilot-ink-muted)]",
  },
};

// ---------------------------------------------------------------------------
// Alcance de registros
// ---------------------------------------------------------------------------

export type RecordScopeId =
  | "active_only"     // is_active = true (solo facturas activas)
  | "all_records"     // activas + archivadas
  | "reconciled";     // activas reconciliadas (motor reconciliación)

export type RecordScopeMeta = {
  id: RecordScopeId;
  label: string;
  description: string;
};

export const RECORD_SCOPES: Record<RecordScopeId, RecordScopeMeta> = {
  active_only: {
    id: "active_only",
    label: "Solo activas",
    description: "Solo facturas con is_active=true. Excluye archivadas.",
  },
  all_records: {
    id: "all_records",
    label: "Activas + archivadas",
    description: "Incluye facturas activas y archivadas válidas. No incluye eliminadas.",
  },
  reconciled: {
    id: "reconciled",
    label: "Reconciliadas",
    description: "Facturas activas procesadas por el motor de reconciliación.",
  },
};

// ---------------------------------------------------------------------------
// Proveniencia completa de un bloque de datos (para DataProvenanceBadge)
// ---------------------------------------------------------------------------

export type DataProvenanceConfig = {
  source: DataSourceId;
  period: PeriodScopeId;
  scope: RecordScopeId;
  /** Texto explicativo libre (aparece en tooltip). */
  note?: string;
};

/** Proveniencia del bloque "Salud financiera" del home. */
export const PROVENANCE_HOME_DASHBOARD: DataProvenanceConfig = {
  source: "dataset_api",
  period: "operational_2026",
  scope: "all_records",
  note: "Solo facturas del período operativo 2026+. Para reconciliación por cliente, ir a Cartera.",
};

/** Proveniencia del bloque operativo de Cartera (cartera reconciliada). */
export const PROVENANCE_CARTERA_OPERATIONAL: DataProvenanceConfig = {
  source: "reconciliation",
  period: "operational_2026",
  scope: "reconciled",
  note: "Período operativo 2026: solo facturas activas reconciliadas desde 01/01/2026.",
};

/** Proveniencia de una card de Cartera con fuente Zeta. */
export const PROVENANCE_CARTERA_ZETA: DataProvenanceConfig = {
  source: "zeta_api",
  period: "operational_2026",
  scope: "active_only",
  note: "Datos sincronizados desde Zeta API. Solo facturas activas del período operativo 2026.",
};
