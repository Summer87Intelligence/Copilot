/**
 * Phase 5A — explica prioridad en cola (complementa score, no lo reemplaza).
 */

import type { AIPriorityExplanation, AIPriorityExplainerInput } from "@/lib/decision-engine/ai/ai-types";

export function explainPriority(input: AIPriorityExplainerInput): AIPriorityExplanation {
  const { summary, hydration } = input;
  const factors: string[] = [];
  const task = summary.primary_action;

  if (summary.sla_breached || hydration?.breached_sla) {
    factors.push("SLA vencido");
  }
  if (summary.concentration_percent != null && summary.concentration_percent >= 40) {
    factors.push(`concentración crítica (${Math.round(summary.concentration_percent)}%)`);
  }
  if (task.category === "stale_contact" || summary.reasons.some((r) => r.toLowerCase().includes("contacto"))) {
    factors.push("ausencia de contacto reciente");
  }
  if (task.oldest_days >= 90) {
    factors.push("deuda +90 días");
  } else if (task.oldest_days >= 60) {
    factors.push("aging elevado");
  }
  if (summary.highest_priority === "critical" || task.priority === "critical") {
    factors.push("prioridad crítica en cola");
  }
  if (!hydration?.assigned_user_id) {
    factors.push("sin responsable asignado");
  }
  if (task.category === "promise_follow_up") {
    factors.push("promesa de pago pendiente");
  }

  const unique = [...new Set(factors)];
  const explanation =
    unique.length > 0
      ? `Priorizado por ${unique.slice(0, 4).join(", ")}.`
      : `Priorizado por score operativo (${Math.round(task.priority_score)} pts) y saldo pendiente activo.`;

  let expected_outcome = "Reducir riesgo operativo y avanzar recuperación de saldo.";
  if (summary.expected_impact.recovery_amount > 0) {
    const amt = Math.round(summary.expected_impact.recovery_amount).toLocaleString("es-UY");
    expected_outcome = `Impacto esperado: recuperar ~$${amt} y bajar presión de riesgo.`;
  }

  return {
    explanation,
    contributing_factors: unique.slice(0, 6),
    expected_outcome,
  };
}
