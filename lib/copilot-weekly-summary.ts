import type { CopilotInsight } from "@/lib/copilot-engine";
import type { CopilotInsightRecord } from "@/types/copilot-insight-record";

const RECURRENT_META_TITLE = "Problema recurrente detectado";
const REPEATED_TITLE_MIN = 2;
const HIGH_ALERT_SHARE_THRESHOLD = 0.35;
const LOW_ALERT_SHARE_THRESHOLD = 0.2;

type TypeCounts = Record<CopilotInsight["type"], number>;
type PriorityCounts = Record<CopilotInsight["priority"], number>;

export function countInsightTypes(
  insights: CopilotInsightRecord[]
): TypeCounts {
  const counts: TypeCounts = {
    alert: 0,
    recommendation: 0,
    opportunity: 0,
  };
  for (const row of insights) {
    counts[row.type] += 1;
  }
  return counts;
}

export function countInsightPriorities(
  insights: CopilotInsightRecord[]
): PriorityCounts {
  const counts: PriorityCounts = {
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const row of insights) {
    counts[row.priority] += 1;
  }
  return counts;
}

/**
 * Cuenta títulos repetidos en historial y devuelve:
 * - `repeatedTitleKinds`: cuántos títulos distintos se repiten (>= 2)
 * - `maxTitleFrequency`: la mayor frecuencia de un mismo título
 */
export function detectInsightTitleRepetitions(insights: CopilotInsightRecord[]): {
  repeatedTitleKinds: number;
  maxTitleFrequency: number;
} {
  const titleCounts = new Map<string, number>();
  for (const row of insights) {
    const key = row.title.trim();
    if (!key) continue;
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  let repeatedTitleKinds = 0;
  let maxTitleFrequency = 0;
  for (const count of titleCounts.values()) {
    if (count >= REPEATED_TITLE_MIN) {
      repeatedTitleKinds += 1;
    }
    maxTitleFrequency = Math.max(maxTitleFrequency, count);
  }

  return { repeatedTitleKinds, maxTitleFrequency };
}

/**
 * Síntesis semanal rule-based basada en el historial reciente de insights.
 * No usa IA: reglas transparentes y fáciles de ajustar.
 */
export function generateCopilotWeeklySummary(
  insights: CopilotInsightRecord[]
): string {
  if (insights.length === 0) {
    return "Semana sin señales relevantes en el historial del Copilot: mantené seguimiento periódico y disciplina operativa.";
  }

  const typeCounts = countInsightTypes(insights);
  const priorityCounts = countInsightPriorities(insights);
  const { repeatedTitleKinds, maxTitleFrequency } =
    detectInsightTitleRepetitions(insights);

  const total = insights.length;
  const highAlerts = insights.filter(
    (item) => item.type === "alert" && item.priority === "high"
  ).length;
  const highAlertShare = highAlerts / total;
  const hasRecurrenceMeta = insights.some(
    (item) => item.title === RECURRENT_META_TITLE
  );
  const hasPersistentPattern = hasRecurrenceMeta || repeatedTitleKinds >= 2;

  const persistenceNote = hasPersistentPattern
    ? ` Se observan patrones repetitivos en la semana (hasta ${maxTitleFrequency} apariciones de un mismo tema).`
    : "";

  if (highAlertShare >= HIGH_ALERT_SHARE_THRESHOLD) {
    return `La semana muestra presión de riesgos relevantes, con foco en alertas críticas y necesidad de intervención inmediata.${persistenceNote}`;
  }

  if (
    typeCounts.recommendation >= typeCounts.alert &&
    typeCounts.recommendation >= typeCounts.opportunity
  ) {
    return `La semana estuvo orientada a correcciones tácticas y ajustes de ejecución para ordenar desvíos operativos.${persistenceNote}`;
  }

  if (
    typeCounts.opportunity > 0 &&
    highAlertShare <= LOW_ALERT_SHARE_THRESHOLD
  ) {
    return `La semana refleja una dinámica favorable, con espacio para consolidar oportunidades y escalar con mayor previsibilidad.${persistenceNote}`;
  }

  if (priorityCounts.high > priorityCounts.low) {
    return `La semana presenta un escenario mixto con tensión en temas prioritarios: conviene sostener foco en mitigación y disciplina de ejecución.${persistenceNote}`;
  }

  return `La semana mantiene un balance operativo razonable, con oportunidades de mejora incremental en frentes puntuales.${persistenceNote}`;
}
