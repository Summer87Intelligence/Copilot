/**
 * COPILOT BUSINESS LANGUAGE — FUENTE ÚNICA DE TERMINOLOGÍA EJECUTIVA.
 *
 * Toda etiqueta visible (label, badge, header de columna, título de KPI, tooltip)
 * sobre conceptos financieros y operativos debe consumirse desde aquí, no
 * hardcodearse en componentes.
 *
 * Reglas:
 *  - Sin alias contradictorios. Si una métrica tiene un nombre, ese es el nombre.
 *  - El atrasado siempre se comunica como subconjunto del total pendiente.
 *  - Riesgo y prioridad son conceptos distintos (riesgo = lectura financiera;
 *    prioridad = urgencia operativa).
 *  - Estado operativo (Hoy) ≠ Estado / Riesgo financiero (Finanzas).
 */

// ---------------------------------------------------------------------------
// Diccionario canónico
// ---------------------------------------------------------------------------

export const BUSINESS_LANGUAGE = {
  /** Stock total adeudado por clientes al corte. Incluye atrasado y al día. */
  totalPending: "Total pendiente",
  /** Subconjunto del total pendiente con vencimiento superado. */
  overdue: "Atrasado",
  /** Subconjunto del atrasado con más de 30 días. */
  overdue30: "Atrasado +30 días",
  /** Subconjunto del total pendiente todavía dentro del plazo. */
  current: "Al día",

  /** Caja líquida en Tesorería al corte. */
  cashAvailable: "Caja disponible",
  /** Caja disponible + cobros probables − pagos programados. */
  cashProjected: "Caja proyectada",
  /** Proyección ponderada por historial de pago (no garantizada). */
  expectedCollections: "Cobros probables",
  /** Salidas confirmadas con vencimiento próximo. */
  scheduledPayments: "Pagos programados",

  /** Facturas emitidas netas de NC en el rango Desde/Hasta. */
  periodSales: "Ventas del período",
  /** Cobros imputados contra facturas del rango (= ventas − pendiente al cierre). */
  collectionsApplied: "Cobrado aplicado",
  /** Recibos por fecha de recibo (pueden no corresponder al período). */
  collectionsRecorded: "Cobros registrados",
  /** Ventas − cobrado aplicado del período. */
  periodPending: "Pendiente del período",

  /** Lectura financiera global: caja, deuda, cobertura. */
  financialRisk: "Riesgo financiero",
  /** Lectura operativa del día: trabajo pendiente, cobros urgentes. */
  operationalStatus: "Estado operativo",
  /** Severidad operativa de una tarea/cliente. */
  operationalPriority: "Prioridad operativa",

  /** Nota de inclusión: usar en footers / tooltips de bloques pendientes. */
  overdueIncludedNote: "El atrasado está incluido dentro del total pendiente.",
  overdue30IncludedNote:
    "El atrasado +30 días está incluido dentro del atrasado y del total pendiente.",
} as const;

// ---------------------------------------------------------------------------
// Etiquetas de severidad / prioridad operativa
// ---------------------------------------------------------------------------

export type OperationalPriorityLevel = "critical" | "high" | "medium" | "low";

export const PRIORITY_LABEL: Record<OperationalPriorityLevel, string> = {
  critical: "Prioridad crítica",
  high: "Prioridad alta",
  medium: "Prioridad media",
  low: "Prioridad baja",
};

export type FinancialRiskBand = "critical" | "high" | "medium" | "low";

export const FINANCIAL_RISK_LABEL: Record<FinancialRiskBand, string> = {
  critical: "Crítico",
  high: "Atención",
  medium: "Atención",
  low: "Estable",
};

// ---------------------------------------------------------------------------
// Aliases legacy → canónico (para auditorías y migraciones)
// ---------------------------------------------------------------------------

/**
 * Mapeo de términos legacy a su equivalente canónico actual.
 * Útil para scripts de auditoría / linter de copy.
 * NO usar en producción para renombrar en vivo; usar `BUSINESS_LANGUAGE` directo.
 */
export const LEGACY_TO_CANONICAL: Record<string, string> = {
  "Deuda actual": BUSINESS_LANGUAGE.totalPending,
  "Deuda activa": BUSINESS_LANGUAGE.totalPending,
  "Deuda total": BUSINESS_LANGUAGE.totalPending,
  "Saldo pendiente": BUSINESS_LANGUAGE.totalPending,
  "Por cobrar": BUSINESS_LANGUAGE.totalPending,
  "Clientes por cobrar": BUSINESS_LANGUAGE.totalPending,
  "Deuda vencida": BUSINESS_LANGUAGE.overdue,
  "Deuda vencida >30 días": BUSINESS_LANGUAGE.overdue30,
  Vencido: BUSINESS_LANGUAGE.overdue,
  "+30D": "+30 días",
  ALTO: PRIORITY_LABEL.high,
  CRÍTICO: PRIORITY_LABEL.critical,
  MEDIO: PRIORITY_LABEL.medium,
  BAJO: PRIORITY_LABEL.low,
  "SLA VENCIDO": "SLA atrasado",
  "SLA OK": "SLA al día",
};

// ---------------------------------------------------------------------------
// Helpers de etiquetado de monedas
// ---------------------------------------------------------------------------

export const CURRENCY_DISPLAY_LABEL: Record<"UYU" | "USD", string> = {
  UYU: "Pesos uruguayos",
  USD: "Dólares",
};

export const CURRENCY_SHORT_LABEL: Record<"UYU" | "USD", string> = {
  UYU: "Pesos",
  USD: "Dólares",
};

/**
 * Formatea una métrica canónica con la moneda asociada en lenguaje ejecutivo.
 *  - `${BUSINESS_LANGUAGE.totalPending} UYU`
 *  - `${BUSINESS_LANGUAGE.overdue30} USD`
 */
export function formatMetricWithCurrency(
  metricLabel: string,
  currency: "UYU" | "USD"
): string {
  return `${metricLabel} ${currency}`;
}
