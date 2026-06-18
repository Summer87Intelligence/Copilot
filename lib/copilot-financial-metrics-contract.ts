/**
 * Contrato canónico de métricas financieras de Copilot.
 *
 * Define IDs, nombres visibles, fuentes y reglas de integridad para las
 * 10 métricas operativas centrales. Los módulos deben derivar sus etiquetas
 * de este contrato — no inventar labels ad-hoc.
 *
 * NO contiene lógica de cálculo (evitar importar funciones que hagan I/O).
 */

// ---------------------------------------------------------------------------
// Identificadores canónicos de métricas
// ---------------------------------------------------------------------------

export const METRIC_ID = {
  /** Saldo pendiente activo de clientes, dedupeado, separado UYU/USD. */
  DEUDA_ACTIVA: "deuda_activa",
  /** Subset de deuda activa con vencimiento superado, separado UYU/USD. */
  DEUDA_VENCIDA: "deuda_vencida",
  /** Facturas emitidas en el rango de fechas que siguen pendientes. */
  DEUDA_PERIODO: "deuda_periodo",
  /** Facturado del período menos cobrado del período. Métrica derivada de período. */
  PENDIENTE_PERIODO: "pendiente_periodo",
  /** Facturas emitidas en el rango (neto de notas de crédito). */
  FACTURADO_PERIODO: "facturado_periodo",
  /** Recibos registrados en el rango. */
  COBRADO_PERIODO: "cobrado_periodo",
  /** Cobros imputados contra facturas del rango (residual de reconciliación). */
  COBRADO_APLICADO: "cobrado_aplicado",
  /** Dinero disponible en Tesorería, separado por moneda. */
  CAJA_DISPONIBLE: "caja_disponible",
  /** Caja disponible menos pagos programados próximos 30 días. */
  CAJA_DESPUES_PAGOS: "caja_despues_pagos",
  /** Estado global derivado: healthy / attention / critical. */
  ESTADO_GLOBAL: "estado_global",
} as const;

export type MetricId = (typeof METRIC_ID)[keyof typeof METRIC_ID];

// ---------------------------------------------------------------------------
// Labels canónicos por métrica (fuente única para etiquetas visibles)
// ---------------------------------------------------------------------------

export const METRIC_LABEL: Record<MetricId, string> = {
  deuda_activa: "Deuda actual",
  deuda_vencida: "Deuda atrasada",
  deuda_periodo: "Pendiente al corte del período",
  pendiente_periodo: "Pendiente del período",
  facturado_periodo: "Ventas del período",
  cobrado_periodo: "Cobrado del período",
  cobrado_aplicado: "Cobrado aplicado",
  caja_disponible: "Caja disponible",
  caja_despues_pagos: "Caja proyectada",
  estado_global: "Estado del sistema",
};

/** Submétrica de deuda_vencida — mora superior a 30 días (no confundir con deuda atrasada total). */
export const METRIC_LABEL_OVERDUE_30D = "Deuda atrasada >30 días";

/** Labels visibles permitidos — cada módulo puede usar alias siempre que no
 *  sean confusos con otra métrica canónica. */
export const METRIC_ALIASES: Record<MetricId, readonly string[]> = {
  deuda_activa: ["Deuda actual"],
  deuda_vencida: ["Deuda atrasada", "Deuda vencida"],
  deuda_periodo: ["Pendiente al corte del período"],
  pendiente_periodo: ["Pendiente del período"],
  facturado_periodo: ["Ventas del período"],
  cobrado_periodo: ["Cobrado del período"],
  cobrado_aplicado: ["Cobrado aplicado"],
  caja_disponible: ["Caja disponible", "Dinero disponible"],
  caja_despues_pagos: ["Caja proyectada", "Caja después de pagos", "Cobertura 30 días"],
  estado_global: ["Estado del sistema", "Estado", "Salud del negocio"],
};

/** Labels explícitamente PROHIBIDOS porque mezclan conceptos distintos. */
export const METRIC_PROHIBITED_LABELS: readonly string[] = [
  "Deuda total activa y del período", // mezcla deuda_activa + deuda_periodo
  "Cobrado total", // ambiguo: no distingue cobrado_periodo vs cobrado_aplicado
  "Caja neta", // confundible con snapshot cashNet (diferente a caja_disponible)
  "Neto disponible", // ídem
  "Por cobrar", // ambiguo: puede ser deuda_activa o pendiente_periodo
  "Deuda activa", // reemplazado por Deuda actual
  "Saldo pendiente", // ambiguo sin contexto
  "Deuda total", // reemplazado por Deuda actual
  "Clientes por cobrar", // reemplazado por Deuda actual
  "Pendiente", // solo — usar Pendiente del período o Deuda actual
  "Facturado del período", // reemplazado por Ventas del período
  "Cobrado en el período", // reemplazado por Cobrado del período
];

// ---------------------------------------------------------------------------
// Definición completa de cada métrica
// ---------------------------------------------------------------------------

export type MetricCurrency = "UYU" | "USD" | "per_currency" | "combined_no_conversion";

export type MetricTemporalScope =
  | "current" // valor al momento actual, sin rango
  | "period" // depende del rango Desde/Hasta configurado
  | "rolling_30d"; // próximos 30 días desde hoy

export type MetricSourceModule =
  | "portfolio" // lib/copilot-clients-portfolio.ts + zeta dedup
  | "cartera_aging" // lib/copilot-cartera-aging-totals.ts
  | "cartera_reconciliation" // lib/copilot-financial-reconciliation.ts
  | "treasury" // lib/treasury/treasury-cash-position.ts
  | "financial_snapshot" // lib/copilot-financial-engine.ts
  | "derived"; // derivado de otras métricas

export type CanonicalMetricDef = {
  id: MetricId;
  label: string;
  definition: string;
  formula: string;
  source: MetricSourceModule;
  currency: MetricCurrency;
  scope: MetricTemporalScope;
  /** Módulos de UI que consumen esta métrica. */
  consumers: string[];
  /** Otra métrica canónica con la que puede confundirse; explicación de diferencia. */
  divergesFrom?: { metricId: MetricId; reason: string }[];
};

export const CANONICAL_METRICS: Record<MetricId, CanonicalMetricDef> = {
  deuda_activa: {
    id: "deuda_activa",
    label: METRIC_LABEL.deuda_activa,
    definition:
      "Saldo pendiente activo de clientes, dedupeado (sin filas shadow Zeta), con balance_amount > 0.",
    formula:
      "SUM(proto_invoices.balance_amount) WHERE balance_amount > 0 AND category != ZETA_SALDOS_PENDIENTES_CATEGORY, agrupado por currency_code",
    source: "portfolio",
    currency: "per_currency",
    scope: "current",
    consumers: [
      "hoy/hoy-money-cards (Clientes por cobrar)",
      "hoy/hoy-clients-with-debt-section (tabla de deudores)",
      "rutas/clientes-riesgo (filtro por deuda activa)",
      "alertas (umbral de alerta de deuda)",
    ],
    divergesFrom: [
      {
        metricId: "deuda_periodo",
        reason:
          "deuda_activa es el stock total al día de hoy; deuda_periodo es el flujo dentro de un rango seleccionado.",
      },
    ],
  },

  deuda_vencida: {
    id: "deuda_vencida",
    label: METRIC_LABEL.deuda_vencida,
    definition:
      "Subset de deuda activa cuya fecha de vencimiento (due_date) ya pasó — incluye mora de 1 a 30 días y más. Fuente primaria: portfolio.overdue_uyu/overdue_usd (suma por factura vencida).",
    formula:
      "sumPortfolioOverdueDebt(portfolioRows) — Σ balance_amount donde due_date < hoy. Métrica separada >30d: sumCarteraAgingOverdue (buckets 31_60 + 61_90 + 90_plus).",
    source: "cartera_aging",
    currency: "per_currency",
    scope: "current",
    consumers: [
      "hoy/hoy-money-cards (Vencido >30 días dentro de Clientes por cobrar)",
      "hoy/hoy-clients-with-debt-section (columna Vencido)",
      "copilot-today-business-pulse (determineStatus, alertas de riesgo)",
      "rutas/clientes-riesgo (filtro critical)",
    ],
    divergesFrom: [
      {
        metricId: "deuda_activa",
        reason:
          "deuda_vencida es un subconjunto de deuda_activa — siempre deuda_vencida ≤ deuda_activa por moneda.",
      },
    ],
  },

  deuda_periodo: {
    id: "deuda_periodo",
    label: METRIC_LABEL.deuda_periodo,
    definition:
      "Facturas emitidas dentro del rango Desde/Hasta seleccionado que siguen pendientes al cierre del rango.",
    formula: "report.currencies[currency].pendingAtCutoff — extraído por carteraPeriodActivityFromReport()",
    source: "cartera_reconciliation",
    currency: "per_currency",
    scope: "period",
    consumers: [
      "hoy/hoy-period-activity-section (Por cobrar del período)",
      "hoy/hoy-current-state-section (bloque estado actual)",
    ],
    divergesFrom: [
      {
        metricId: "deuda_activa",
        reason:
          "deuda_periodo solo incluye facturas del rango seleccionado; deuda_activa incluye todo el stock histórico vigente.",
      },
    ],
  },

  pendiente_periodo: {
    id: "pendiente_periodo",
    label: METRIC_LABEL.pendiente_periodo,
    definition:
      "Saldo pendiente de facturas del período al cierre del rango. Equivale a facturado neto menos cobros aplicados.",
    formula:
      "pendingAtCutoff = issuedInPeriodNet - portfolioResolvedAmount = facturado_periodo - cobrado_aplicado",
    source: "derived",
    currency: "per_currency",
    scope: "period",
    consumers: [
      "dashboard/kpi-cards (Pendiente del período)",
      "dashboard/summary-pdf",
    ],
    divergesFrom: [
      {
        metricId: "deuda_activa",
        reason:
          "pendiente_periodo mide el flujo neto del rango; deuda_activa es el stock total al día de hoy.",
      },
      {
        metricId: "deuda_periodo",
        reason:
          "deuda_periodo es el saldo pendiente de facturas del rango al cierre; pendiente_periodo es facturado menos cobrado (derivada).",
      },
    ],
  },

  facturado_periodo: {
    id: "facturado_periodo",
    label: METRIC_LABEL.facturado_periodo,
    definition: "Facturas emitidas dentro del rango, neto de notas de crédito.",
    formula:
      "report.currencies[currency].issuedInPeriod - creditNoteAmount = issuedInPeriodNet, extraído por carteraPeriodActivityFromReport()",
    source: "cartera_reconciliation",
    currency: "per_currency",
    scope: "period",
    consumers: [
      "hoy/hoy-period-activity-section (Facturado)",
      "hoy/hoy-currency-executive-card (bloque UYU/USD)",
    ],
  },

  cobrado_periodo: {
    id: "cobrado_periodo",
    label: METRIC_LABEL.cobrado_periodo,
    definition:
      "Recibos registrados en el rango. PUEDE superar lo facturado si hay cobros de facturas anteriores.",
    formula:
      "report.currencies[currency].collectedInPeriod — suma de montos de recibos con fecha en el rango",
    source: "cartera_reconciliation",
    currency: "per_currency",
    scope: "period",
    consumers: [
      "hoy/hoy-period-activity-section (Cobrado)",
      "hoy/hoy-currency-executive-card (bloque UYU/USD)",
    ],
    divergesFrom: [
      {
        metricId: "cobrado_aplicado",
        reason:
          "cobrado_periodo = suma bruta de recibos en el rango. cobrado_aplicado = residual de reconciliación (facturas del período − pendiente). Pueden diferir si hay cobros de facturas anteriores.",
      },
    ],
  },

  cobrado_aplicado: {
    id: "cobrado_aplicado",
    label: METRIC_LABEL.cobrado_aplicado,
    definition:
      "Cobros imputados contra facturas emitidas en el rango. Residual de reconciliación: facturado − pendiente al cierre.",
    formula:
      "max(0, issuedInPeriod - creditNoteAmount - pendingAtCutoff) — implícito en portfolioResolvedAmount de carteraPeriodMetricsFromReport()",
    source: "cartera_reconciliation",
    currency: "per_currency",
    scope: "period",
    consumers: [
      "dashboard/kpi-cards (Cobrado aplicado)",
      "dashboard/summary-pdf",
      "hoy/hoy-currency-executive-card (operatingResult implícito)",
      "copilot/cartera (sección Reconciliación)",
    ],
    divergesFrom: [
      {
        metricId: "cobrado_periodo",
        reason:
          "cobrado_aplicado mide imputación contra facturas del período; cobrado_periodo mide recibos en el período independientemente de a qué factura se imputan.",
      },
    ],
  },

  caja_disponible: {
    id: "caja_disponible",
    label: METRIC_LABEL.caja_disponible,
    definition:
      "Dinero disponible en Tesorería: apertura + cobros Zeta posteriores + movimientos manuales de ingreso − egresos manuales. Separado por moneda.",
    formula:
      "CashPositionByCurrency.availableCash = openingBalance + collectedFromClients + manualIncome - manualExpense + adjustments + transfersNet",
    source: "treasury",
    currency: "per_currency",
    scope: "current",
    consumers: [
      "hoy/hoy-money-cards (Caja disponible — card superior izquierda)",
      "hoy/hoy-current-state-section (bloque caja actual)",
      "hoy/hoy-projection-30d-section (base para proyección)",
      "tesoreria (sección saldo disponible)",
    ],
    divergesFrom: [
      {
        metricId: "estado_global",
        reason:
          "caja_disponible es un número bruto; estado_global incorpora caja + cobertura + deuda + riesgo para derivar healthy/attention/critical.",
      },
    ],
  },

  caja_despues_pagos: {
    id: "caja_despues_pagos",
    label: METRIC_LABEL.caja_despues_pagos,
    definition:
      "Caja disponible menos pagos programados en los próximos 30 días.",
    formula:
      "safeCash30d = CashPositionByCurrency.availableCash - TreasuryOutflowSummary.next30Days (por moneda)",
    source: "treasury",
    currency: "per_currency",
    scope: "rolling_30d",
    consumers: [
      "hoy/hoy-money-cards (Caja después de pagos — card inferior derecha)",
      "hoy/hoy-projection-30d-section (bloque proyección)",
      "dashboard/kpi-cards (Caja proyectada)",
      "copilot-today-business-pulse (cashAfterPaymentsCritical flag)",
    ],
    divergesFrom: [
      {
        metricId: "caja_disponible",
        reason:
          "caja_despues_pagos descuenta compromisos ya cargados en Tesorería; caja_disponible es el stock bruto actual.",
      },
    ],
  },

  estado_global: {
    id: "estado_global",
    label: METRIC_LABEL.estado_global,
    definition:
      "Estado operativo global: healthy / attention / critical. Derivado de deuda vencida, cobertura de caja, risk_band del snapshot, y clientes de alto riesgo.",
    formula: `determineStatus({
  riskBand: snapshotRiskBand(snapshot),       // del motor financiero
  coverageRatio: snapshotCoverageRatio(snapshot),
  highRiskCount: portfolio.filter(r => r.risk === 'Alto').length,
  overdueCount: portfolio.filter(r => r.overdue_debt > 0).length,
}):
  critical si riskBand === 'critical' OR coverageRatio < 0.5 OR highRiskCount >= 3
  attention si riskBand === 'high' OR coverageRatio < 1.0 OR overdueCount > 0
  healthy en caso contrario`,
    source: "derived",
    currency: "per_currency", // N/A pero requerido por tipo
    scope: "current",
    consumers: [
      "hoy/hoy-compact-hero (dot badge + label + headline)",
      "hoy/hoy-executive-summary-card",
      "hoy/hoy-cockpit-card-drawer (acento de cards)",
      "copilot/hoy (cashAfterPaymentsCritical flag en ExecutiveSummaryCard)",
    ],
  },
};

// ---------------------------------------------------------------------------
// Reglas de integridad UYU/USD
// ---------------------------------------------------------------------------

/**
 * Reglas que deben cumplirse en toda la UI:
 * 1. UYU y USD NUNCA se suman para deuda, caja o cobros.
 * 2. Las métricas de snapshot (Finanzas) combinan monedas sin conversión —
 *    deben mostrar el disclaimer METRIC_MIXED_CURRENCY_DISCLAIMER.
 * 3. Si un cliente tiene deuda en ambas monedas, aparece en dos filas separadas.
 */
export const CURRENCY_INTEGRITY_RULES = [
  "UYU y USD nunca se suman en métricas de deuda, caja o cobros.",
  "Los campos legacy total_debt / overdue_debt / total_billing son mixed-currency y NO deben usarse para display.",
  "El financial snapshot mezcla monedas por diseño — siempre mostrar METRIC_MIXED_CURRENCY_DISCLAIMER.",
  "Un cliente con deuda en UYU y USD genera dos filas en la tabla de deudores — el conteo de clientes se deduplica.",
] as const;

/** Disclaimer cuando UYU y USD se muestran por separado (sin conversión). */
export const METRIC_SEPARATED_CURRENCY_DISCLAIMER =
  "Vista actualizada desde Zeta. UYU y USD se analizan por separado.";

/** Disclaimer cuando los importes se consolidan a USD con tipo de cambio configurable. */
export const METRIC_USD_CONSOLIDATED_DISCLAIMER =
  "Vista consolidada en USD con el tipo de cambio configurado. UYU y USD no se mezclan sin conversión explícita.";

/** Alias legacy — Panorama financiero y vistas multimoneda separada. */
export const METRIC_MIXED_CURRENCY_DISCLAIMER = METRIC_SEPARATED_CURRENCY_DISCLAIMER;

/**
 * Disclaimer para secciones que consolidan UYU y USD sin conversión de tipo de cambio
 * (motor histórico de snapshot). Usarlo en lugar de METRIC_MIXED_CURRENCY_DISCLAIMER
 * cuando los montos son efectivamente combinados, no separados.
 */
export const METRIC_COMBINED_CURRENCY_DISCLAIMER =
  "Esta sección combina UYU y USD solo como lectura histórica. Para caja operativa, usá las métricas separadas por moneda.";

/** Copy para la sección colapsable de análisis histórico en /copilot/finanzas. */
export const FINANZAS_ANALISIS_HISTORICO = {
  title: "Análisis histórico",
  subtitle: METRIC_COMBINED_CURRENCY_DISCLAIMER,
} as const;

// ---------------------------------------------------------------------------
// Reglas de navegación entre módulos
// ---------------------------------------------------------------------------

/**
 * CTAs mínimas requeridas entre módulos para que el usuario pueda navegar
 * de un contexto al origen de la información relacionada.
 */
export const REQUIRED_NAVIGATION_CTAS = [
  {
    from: "hoy/clientes-con-deuda",
    to: "/copilot/cartera",
    label: "Ver toda la cartera",
    exists: true,
  },
  {
    from: "hoy/alertas-atencion",
    to: "/copilot/clientes?filter=attention",
    label: "Ver clientes con atención",
    exists: true,
  },
  {
    from: "hoy/caja-despues-pagos",
    to: "/copilot/tesoreria",
    label: "Ver Tesorería",
    exists: true,
  },
  {
    from: "cartera/clientes",
    to: "/copilot/clientes/{company_id}",
    label: "Ver ficha del cliente",
    exists: true, // via deepLink en DebtorCollectionRow
  },
  {
    from: "finanzas/panorama",
    to: "/copilot/tesoreria",
    label: "Ver caja y pagos en Tesorería",
    exists: true, // CTA añadida en app/copilot/finanzas/page.tsx
  },
  {
    from: "alertas/deuda-vencida",
    to: "/copilot/cartera?filter=overdue",
    label: "Ver clientes vencidos",
    exists: true, // banner contextual cuando hay alertas client_overdue
  },
  {
    from: "estado-sistema/popover",
    to: "/copilot/cartera + /copilot/tesoreria + /copilot/finanzas",
    label: "Ver Cartera / Ver Tesorería / Ver Finanzas",
    exists: true, // señales con CTA inline en hoy-executive-summary-card.tsx
  },
] as const;

// ---------------------------------------------------------------------------
// Señales del Estado Global del Sistema
// ---------------------------------------------------------------------------

/**
 * Señales que deben incluirse en el popover de Estado del sistema.
 * Cada señal debe tener: motivo, fuente, y CTA al módulo relacionado.
 */
export type SystemStateSignal = {
  id: string;
  label: string;
  source: MetricSourceModule;
  ctaHref: string;
  ctaLabel: string;
};

export const SYSTEM_STATE_SIGNALS: readonly SystemStateSignal[] = [
  {
    id: "overdue_debt",
    label: "Deuda vencida de clientes",
    source: "cartera_aging",
    ctaHref: "/copilot/cartera",
    ctaLabel: "Ver Cartera",
  },
  {
    id: "cash_after_payments",
    label: "Caja proyectada",
    source: "treasury",
    ctaHref: "/copilot/tesoreria",
    ctaLabel: "Ver Tesorería",
  },
  {
    id: "coverage_ratio",
    label: "Ratio de cobertura financiera",
    source: "financial_snapshot",
    ctaHref: "/copilot/finanzas",
    ctaLabel: "Ver Finanzas",
  },
  {
    id: "high_risk_clients",
    label: "Clientes de alto riesgo",
    source: "portfolio",
    ctaHref: "/copilot/cartera",
    ctaLabel: "Ver clientes críticos",
  },
] as const;
