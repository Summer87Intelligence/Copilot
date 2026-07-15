/**
 * Modelo puro de `StatusBadge` (DS-Core).
 *
 * Unifica los múltiples badges ad-hoc (financial-status / severity / surface /
 * obligation) bajo un único set de tonos. Solo lógica de mapeo, testeable.
 */

export type StatusTone = "positive" | "warning" | "danger" | "neutral";

export type RiskLevel = "healthy" | "attention" | "critical";

/** Nivel de riesgo → tono de badge. */
export function riskToStatusTone(risk: RiskLevel): StatusTone {
  if (risk === "critical") return "danger";
  if (risk === "attention") return "warning";
  return "positive";
}

/** Días de atraso → tono (Al día / mora leve / mora dura). */
export function overdueDaysToStatusTone(days: number): StatusTone {
  if (days <= 0) return "positive";
  if (days <= 14) return "warning";
  return "danger";
}
