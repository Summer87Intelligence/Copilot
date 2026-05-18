/**
 * Phase 5B — detector de oportunidades de recuperación rápida.
 */

import type { PredictiveContext, RecoveryOpportunity } from "@/lib/decision-engine/predictive/predictive-types";
import {
  buildRecoveryLikelihoodInput,
  computeRecoveryLikelihood,
} from "@/lib/decision-engine/predictive/recovery-likelihood-engine";

export function detectRecoveryOpportunities(ctx: PredictiveContext): RecoveryOpportunity[] {
  const opportunities: RecoveryOpportunity[] = [];

  for (const summary of ctx.client_summaries) {
    const hydration = ctx.hydration_by_customer[summary.customer_id] ?? null;
    const actions = ctx.recent_actions_by_customer.get(summary.customer_id) ?? [];
    const followUp = ctx.follow_ups_by_customer.get(summary.customer_id) ?? null;
    const receipts = ctx.recent_receipts_by_customer.get(summary.customer_id) ?? [];
    const input = buildRecoveryLikelihoodInput(summary, hydration, actions, followUp, receipts);
    const likelihood = computeRecoveryLikelihood(input);
    const task = summary.primary_action;

    if (
      likelihood.band === "high" &&
      summary.total_pending_amount >= 500 &&
      task.oldest_days <= 45
    ) {
      opportunities.push({
        customer_id: summary.customer_id,
        customer_name: summary.customer_name,
        opportunity_type: "quick_win",
        recovery_amount: summary.expected_impact.recovery_amount || summary.total_pending_amount,
        confidence_pct: likelihood.confidence_pct,
        reason: `${summary.customer_name} presenta alta probabilidad de recuperación rápida con contacto inmediato.`,
        recommended_action: "Llamada o acuerdo de pago en 48h",
        urgency: "high",
      });
      continue;
    }

    if (
      summary.total_pending_amount >= 5000 &&
      (likelihood.band === "medium" || likelihood.band === "high") &&
      summary.risk_level !== "critical"
    ) {
      opportunities.push({
        customer_id: summary.customer_id,
        customer_name: summary.customer_name,
        opportunity_type: "high_amount_medium_risk",
        recovery_amount: summary.total_pending_amount,
        confidence_pct: Math.min(85, likelihood.probability_pct + 10),
        reason: `Monto elevado (${task.currency_code} ${Math.round(summary.total_pending_amount).toLocaleString("es-UY")}) con riesgo moderado — impacto alto si se recupera.`,
        recommended_action: "Plan de pago estructurado",
        urgency: "medium",
      });
      continue;
    }

    if (
      input.has_active_promise &&
      !input.promise_overdue &&
      summary.total_pending_amount < 10000
    ) {
      opportunities.push({
        customer_id: summary.customer_id,
        customer_name: summary.customer_name,
        opportunity_type: "promise_near_term",
        recovery_amount: summary.total_pending_amount,
        confidence_pct: 72,
        reason: "Promesa activa con saldo acotado — confirmar cumplimiento.",
        recommended_action: "Confirmar promesa y registrar pago",
        urgency: "high",
      });
      continue;
    }

    if (input.has_recent_partial_payment && summary.total_pending_amount > 0) {
      opportunities.push({
        customer_id: summary.customer_id,
        customer_name: summary.customer_name,
        opportunity_type: "partial_payment_residual",
        recovery_amount: summary.total_pending_amount,
        confidence_pct: 68,
        reason: "Pago parcial reciente — saldo residual recuperable.",
        recommended_action: "Seguimiento de saldo residual",
        urgency: "medium",
      });
      continue;
    }

    const lastDays = input.last_contact_days;
    if (!input.is_unassigned && lastDays != null && lastDays <= 7 && likelihood.probability_pct >= 50) {
      opportunities.push({
        customer_id: summary.customer_id,
        customer_name: summary.customer_name,
        opportunity_type: "assigned_recent_contact",
        recovery_amount: summary.expected_impact.recovery_amount || summary.total_pending_amount,
        confidence_pct: likelihood.confidence_pct,
        reason: "Dueño asignado y contacto reciente — momentum favorable.",
        recommended_action: "Cerrar acuerdo en próxima interacción",
        urgency: "medium",
      });
    }
  }

  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return opportunities
    .sort((a, b) => rank[a.urgency] - rank[b.urgency] || b.confidence_pct - a.confidence_pct)
    .slice(0, 15);
}
