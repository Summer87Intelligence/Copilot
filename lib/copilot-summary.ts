import type { CopilotInsight } from "@/lib/copilot-engine";

const RECURRENT_META_TITLE = "Problema recurrente detectado";

/**
 * Síntesis ejecutiva rule-based para lectura rápida del estado del Copilot.
 * Mantiene reglas simples y texto estable para UX consistente.
 */
export function generateCopilotExecutiveSummary(
  insights: CopilotInsight[]
): string {
  if (insights.length === 0) {
    return "Sin alertas relevantes en esta lectura: mantené el monitoreo y sostené la ejecución del plan actual.";
  }

  const highAlerts = insights.filter(
    (item) => item.type === "alert" && item.priority === "high"
  ).length;
  const alertCount = insights.filter((item) => item.type === "alert").length;
  const recommendationCount = insights.filter(
    (item) => item.type === "recommendation"
  ).length;
  const opportunityCount = insights.filter(
    (item) => item.type === "opportunity"
  ).length;
  const hasRecurrence = insights.some(
    (item) => item.title === RECURRENT_META_TITLE
  );

  if (highAlerts > 0) {
    const recurrenceNote = hasRecurrence
      ? " Además, hay señales persistentes que se repiten en lecturas recientes."
      : "";
    return `Se detectan riesgos críticos que requieren acciones inmediatas para proteger caja y estabilidad operativa.${recurrenceNote}`;
  }

  if (recommendationCount >= alertCount && recommendationCount >= opportunityCount) {
    const recurrenceNote = hasRecurrence
      ? " También aparecen señales repetidas que conviene atacar de raíz."
      : "";
    return `El foco está en ajustes tácticos de ejecución para corregir desvíos de corto plazo.${recurrenceNote}`;
  }

  if (opportunityCount > 0 && highAlerts === 0) {
    const recurrenceNote = hasRecurrence
      ? " Aun así, hay patrones persistentes que vale resolver para sostener este avance."
      : "";
    return `Predominan oportunidades para consolidar resultados y escalar con menor presión operativa.${recurrenceNote}`;
  }

  const recurrenceNote = hasRecurrence
    ? " Se observan señales persistentes que justifican una revisión estructural."
    : "";
  return `Panorama mixto: equilibrá mitigación de riesgos y ejecución priorizada para sostener resultados.${recurrenceNote}`;
}
