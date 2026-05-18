/**
 * Decision Engine — Follow-up & SLA Engine.
 * Determina next_follow_up_at, sla_status y operational_state por cliente.
 * Pure: sin DB, sin side effects.
 */

import type { FollowUpInput, FollowUpResult, FollowUpState, SlaStatus } from "@/lib/decision-engine/de-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3_600_000);
}

function slaFromDate(target: Date, now: Date): SlaStatus {
  const diffDays = (target.getTime() - now.getTime()) / 86_400_000;
  if (diffDays < 0)  return "overdue";
  if (diffDays < 1)  return "due_today";
  if (diffDays <= 3) return "due_soon";
  return "ok";
}

function result(
  state: FollowUpState,
  next_follow_up_at: string | null,
  sla_status: SlaStatus,
  pending_action: string,
  follow_up_reason: string,
  snoozed_until: string | null = null
): FollowUpResult {
  return { next_follow_up_at, sla_status, pending_action, snoozed_until, follow_up_reason, operational_state: state };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeFollowUp(input: FollowUpInput, now?: Date): FollowUpResult {
  const ref = now ?? new Date();
  const {
    last_action_type, last_action_date, last_action_status,
    promise_date, has_active_promise, has_broken_promise, has_escalation,
    oldest_days, risk_score, days_since_contact,
  } = input;

  // RULE 1 — Active promise → snooze until promise_date + 24h
  if (has_active_promise && promise_date) {
    const promiseDay = new Date(promise_date);
    if (!isNaN(promiseDay.getTime())) {
      const followUp = addHours(promiseDay, 24);
      return result(
        "awaiting_promise",
        isoDate(followUp),
        slaFromDate(followUp, ref),
        "Confirmar pago prometido",
        "Promesa de pago activa — confirmar después de la fecha acordada",
        promise_date
      );
    }
  }

  // RULE 2 — Escalation → SLA crítico 24h
  if (has_escalation) {
    const followUp = addHours(ref, 24);
    return result(
      "escalated_active",
      isoDate(followUp),
      "critical",
      "Gestionar escalación urgente",
      "Caso escalado activo — SLA 24h obligatorio"
    );
  }

  // RULE 3 — Broken promise → overdue inmediato
  if (has_broken_promise) {
    return result(
      "overdue_no_contact",
      isoDate(ref),
      "overdue",
      "Contactar urgente — promesa incumplida",
      "Promesa de pago no cumplida — requiere acción inmediata"
    );
  }

  // RULE 4 — Call with no answer → retry in 72h
  if (last_action_type === "call" && last_action_status === "pending_review" && last_action_date) {
    const lastDate = new Date(last_action_date);
    if (!isNaN(lastDate.getTime())) {
      const followUp = addHours(lastDate, 72);
      return result(
        "retry_call",
        isoDate(followUp),
        slaFromDate(followUp, ref),
        "Reintentar llamada",
        "Llamada sin respuesta — reintentar en 72h",
        isoDate(followUp)
      );
    }
  }

  // RULE 5 — Email / WhatsApp sent → retry in 96h
  if ((last_action_type === "email" || last_action_type === "whatsapp") && last_action_date) {
    const lastDate = new Date(last_action_date);
    if (!isNaN(lastDate.getTime())) {
      const followUp = addHours(lastDate, 96);
      const state: FollowUpState = last_action_type === "email" ? "retry_email" : "retry_call";
      const medium = last_action_type === "email" ? "Email" : "WhatsApp";
      return result(
        state,
        isoDate(followUp),
        slaFromDate(followUp, ref),
        `Hacer seguimiento del ${medium}`,
        `${medium} enviado — hacer seguimiento en 96h`,
        isoDate(followUp)
      );
    }
  }

  // RULE 6 — No contact > 14 days with overdue debt
  if (oldest_days > 0 && (days_since_contact === null || days_since_contact > 14)) {
    const sla: SlaStatus = days_since_contact === null ? "no_contact" : "overdue";
    return result(
      "overdue_no_contact",
      isoDate(ref),
      sla,
      "Establecer contacto",
      days_since_contact === null
        ? "Sin contacto registrado — deuda vencida"
        : `Sin contacto desde hace ${days_since_contact} días`
    );
  }

  // RULE 7 — Critical risk → revisit in 24h
  if (risk_score >= 75) {
    const followUp = addHours(ref, 24);
    return result(
      "monitor",
      isoDate(followUp),
      slaFromDate(followUp, ref),
      "Revisión de riesgo crítico",
      `Riesgo crítico (${risk_score}pts) — revisión diaria`
    );
  }

  // RULE 8 — High risk → revisit in 72h
  if (risk_score >= 50) {
    const followUp = addHours(ref, 72);
    return result(
      "monitor",
      isoDate(followUp),
      slaFromDate(followUp, ref),
      "Revisión de riesgo alto",
      `Riesgo alto (${risk_score}pts) — revisión en 3 días`
    );
  }

  // RULE 9 — Default: monitor weekly
  const followUp = addHours(ref, 168);
  return result(
    "monitor",
    isoDate(followUp),
    "ok",
    "Monitoreo rutinario",
    "Sin urgencia — seguimiento semanal"
  );
}
