/**
 * Phase 5A — narrativa de riesgo por cliente (determinística).
 */

import { OPERATIONAL_MACHINE_STATE_LABELS } from "@/lib/decision-engine/de-types";
import type { AIRiskNarrative, AIRiskNarrativeInput } from "@/lib/decision-engine/ai/ai-types";

function machineLabel(state: string | null): string {
  if (!state) return "sin estado formal";
  return OPERATIONAL_MACHINE_STATE_LABELS[state as keyof typeof OPERATIONAL_MACHINE_STATE_LABELS] ?? state;
}

export function buildRiskNarrative(input: AIRiskNarrativeInput): AIRiskNarrative {
  const factors: string[] = [];
  let urgency = "Seguimiento estándar de cartera.";

  if (input.sla_breached || input.breached_sla) {
    factors.push("SLA operativo vencido");
    urgency = "Requiere acción inmediata por incumplimiento de SLA.";
  }

  if (input.concentration_percent != null && input.concentration_percent >= 40) {
    factors.push(`Concentración elevada (${Math.round(input.concentration_percent)}% del riesgo)`);
    if (urgency.startsWith("Seguimiento")) {
      urgency = "Priorizar por exposición concentrada en cartera.";
    }
  }

  if (input.oldest_days >= 90) {
    factors.push(`Antigüedad crítica (${input.oldest_days} días)`);
  } else if (input.oldest_days >= 60) {
    factors.push(`Aging elevado (${input.oldest_days} días)`);
  }

  if (input.last_contact_days != null && input.last_contact_days >= 14) {
    factors.push(`Sin contacto reciente (${input.last_contact_days} días)`);
  }

  if (input.is_unassigned) {
    factors.push("Sin responsable operacional asignado");
  }

  if (input.risk_level === "critical" || input.machine_state === "critical" || input.machine_state === "escalated") {
    factors.push(`Estado ${machineLabel(input.machine_state)}`);
  }

  if (factors.length === 0) {
    factors.push("Saldo pendiente activo con señales moderadas");
  }

  const currency = input.currency_code === "USD" ? "USD" : "UYU";
  const narrativeParts: string[] = [];

  if (input.risk_level === "critical" || input.sla_breached) {
    narrativeParts.push("Cliente con deterioro operativo acelerado.");
  } else if (input.oldest_days >= 60) {
    narrativeParts.push("Cliente con exposición envejecida que requiere seguimiento sostenido.");
  } else {
    narrativeParts.push("Cliente con riesgo operacional activo en seguimiento.");
  }

  if (input.concentration_percent != null && input.concentration_percent >= 35) {
    narrativeParts.push(
      `Concentra alta exposición ${currency} (${Math.round(input.concentration_percent)}% del riesgo visible).`
    );
  }

  if (input.last_contact_days != null && input.last_contact_days >= 14) {
    narrativeParts.push("No registra interacción reciente en el período operativo.");
  }

  if (input.assignee_display_name && !input.is_unassigned) {
    narrativeParts.push(`Responsable actual: ${input.assignee_display_name}.`);
  }

  let recommended_focus = "Registrar contacto y confirmar próximo paso.";
  if (input.sla_breached) recommended_focus = "Contactar hoy y registrar compromiso de pago o plan.";
  else if (input.is_unassigned) recommended_focus = "Asignar responsable y definir primera acción.";
  else if (input.concentration_percent != null && input.concentration_percent >= 40) {
    recommended_focus = "Revisar concentración y coordinar estrategia de recuperación.";
  }

  return {
    narrative: narrativeParts.join(" "),
    top_risk_factors: factors.slice(0, 5),
    urgency_reason: urgency,
    recommended_focus,
  };
}

export function riskNarrativeInputFromSummary(
  summary: {
    customer_id: string;
    customer_name: string;
    machine_state: string | null;
    risk_level: string;
    primary_action: { oldest_days: number; currency_code: string; breached_sla: boolean };
    concentration_percent: number | null;
    sla_breached: boolean;
    reasons: string[];
    total_pending_amount: number;
  },
  hydration?: {
    breached_sla: boolean;
    assignee_display_name: string | null;
    assigned_user_id: string | null;
    last_action_at: string | null;
  } | null,
  now = new Date()
): AIRiskNarrativeInput {
  let last_contact_days: number | null = null;
  if (hydration?.last_action_at) {
    const t = new Date(hydration.last_action_at).getTime();
    if (!isNaN(t)) {
      last_contact_days = Math.floor((now.getTime() - t) / 86_400_000);
    }
  }

  return {
    customer_id: summary.customer_id,
    customer_name: summary.customer_name,
    machine_state: summary.machine_state,
    risk_level: summary.risk_level,
    oldest_days: summary.primary_action.oldest_days,
    concentration_percent: summary.concentration_percent,
    sla_breached: summary.sla_breached,
    breached_sla: hydration?.breached_sla ?? summary.sla_breached,
    assignee_display_name: hydration?.assignee_display_name ?? null,
    is_unassigned: !hydration?.assigned_user_id,
    last_contact_days,
    pending_amount: summary.total_pending_amount,
    currency_code: summary.primary_action.currency_code,
    reasons: summary.reasons,
  };
}
