/**
 * Phase 5B — probabilidad de recuperación por cliente (heurística explicable).
 */

import type {
  ClientOperationalHydrationRecord,
  ClientOperationalSummary,
  DECollectionAction,
  DEFollowUpRow,
  DERecentReceipt,
} from "@/lib/decision-engine/de-types";
import type {
  RecoveryLikelihood,
  RecoveryLikelihoodBand,
  RecoveryLikelihoodInput,
} from "@/lib/decision-engine/predictive/predictive-types";

const MS_PER_DAY = 86_400_000;

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

function bandFromProbability(pct: number): RecoveryLikelihoodBand {
  if (pct >= 65) return "high";
  if (pct >= 45) return "medium";
  if (pct >= 25) return "low";
  return "very_low";
}

function windowFromBand(band: RecoveryLikelihoodBand, oldestDays: number): string {
  if (band === "high") return oldestDays <= 30 ? "7-14 días" : "14-30 días";
  if (band === "medium") return "14-30 días";
  if (band === "low") return "30-60 días";
  return "60+ días";
}

function strategyFromBand(band: RecoveryLikelihoodBand, input: RecoveryLikelihoodInput): string {
  if (input.category === "promise_follow_up" || input.has_active_promise) {
    return "Confirmar promesa y asegurar cumplimiento en ventana acordada.";
  }
  if (band === "high") return "Contacto inmediato y cierre de acuerdo de pago.";
  if (band === "medium") return "Seguimiento estructurado con plan de pagos parciales.";
  if (band === "low") return "Escalar seguimiento y validar capacidad de pago.";
  return "Evaluar reestructuración o escalamiento legal según política.";
}

export function buildRecoveryLikelihoodInput(
  summary: ClientOperationalSummary,
  hydration: ClientOperationalHydrationRecord | null,
  actions: DECollectionAction[],
  followUp: DEFollowUpRow | null,
  receipts: DERecentReceipt[],
  now: Date = new Date()
): RecoveryLikelihoodInput {
  const task = summary.primary_action;
  const lastActionAt = hydration?.last_action_at ?? actions[0]?.created_at ?? null;
  const lastContactDays = daysSince(lastActionAt, now);

  const hasActivePromise =
    task.category === "promise_follow_up" ||
    actions.some((a) => a.status === "promised" || a.action_type === "promise");
  const promiseOverdue =
    hasActivePromise &&
    (task.category === "promise_follow_up" ||
      (followUp != null && new Date(followUp.scheduled_for) < now));

  const cutoff30 = now.getTime() - 30 * MS_PER_DAY;
  const recentReceipts = receipts.filter((r) => new Date(r.receipt_date).getTime() >= cutoff30);
  const hasRecentPartial =
    task.category === "payment_confirmation" ||
    recentReceipts.some((r) => r.amount > 0 && r.amount < summary.total_pending_amount);

  return {
    customer_id: summary.customer_id,
    customer_name: summary.customer_name,
    oldest_days: task.oldest_days,
    pending_amount: summary.total_pending_amount,
    currency_code: task.currency_code,
    machine_state: summary.machine_state,
    breached_sla: summary.sla_breached || (hydration?.breached_sla ?? false),
    last_action_at: lastActionAt,
    last_contact_days: lastContactDays,
    has_active_promise: hasActivePromise,
    promise_overdue: promiseOverdue,
    is_unassigned: !hydration?.assigned_user_id,
    has_recent_partial_payment: hasRecentPartial,
    category: task.category,
    risk_level: summary.risk_level,
    recent_payment_count_30d: recentReceipts.length,
  };
}

export function computeRecoveryLikelihood(input: RecoveryLikelihoodInput): RecoveryLikelihood {
  let score = 50;
  const main: string[] = [];
  const negative: string[] = [];

  if (input.oldest_days <= 30) {
    score += 25;
    main.push("Aging favorable (≤30 días)");
  } else if (input.oldest_days <= 60) {
    score += 5;
    main.push("Aging moderado (31-60 días)");
  } else if (input.oldest_days <= 90) {
    score -= 15;
    negative.push("Aging elevado (61-90 días)");
  } else {
    score -= 30;
    negative.push("Deuda +90 días");
  }

  if (input.last_contact_days != null && input.last_contact_days <= 14) {
    score += 15;
    main.push(`Contacto reciente (${input.last_contact_days}d)`);
  } else if (input.last_contact_days == null || input.last_contact_days >= 30) {
    score -= 20;
    negative.push("Sin contacto reciente");
  }

  if (!input.is_unassigned) {
    score += 8;
    main.push("Responsable asignado");
  } else {
    negative.push("Sin responsable asignado");
  }

  if (input.breached_sla) {
    score -= 12;
    negative.push("SLA vencido");
  }

  if (input.has_active_promise && !input.promise_overdue) {
    score += 12;
    main.push("Promesa de pago activa");
  } else if (input.promise_overdue) {
    score -= 10;
    negative.push("Promesa vencida");
  }

  if (input.has_recent_partial_payment || input.recent_payment_count_30d > 0) {
    score += 15;
    main.push("Señal de pago reciente");
  }

  if (input.category === "legal_review") {
    score -= 18;
    negative.push("En revisión legal");
  }

  if (input.machine_state === "recovered") {
    score += 20;
    main.push("Estado de recuperación favorable");
  } else if (
    input.machine_state === "escalated" ||
    input.machine_state === "critical" ||
    input.machine_state === "legal_review"
  ) {
    score -= 10;
    negative.push(`Estado ${input.machine_state}`);
  }

  const probability_pct = Math.max(5, Math.min(95, Math.round(score)));
  const band = bandFromProbability(probability_pct);

  let confidence = 55;
  if (input.last_action_at) confidence += 15;
  if (input.recent_payment_count_30d > 0) confidence += 10;
  if (!input.is_unassigned) confidence += 10;
  confidence = Math.min(92, confidence);

  const expected_recovery_window_days = windowFromBand(band, input.oldest_days);
  const recommended_recovery_strategy = strategyFromBand(band, input);

  return {
    customer_id: input.customer_id,
    customer_name: input.customer_name,
    probability_pct,
    band,
    confidence_pct: confidence,
    main_drivers: main.slice(0, 4),
    negative_drivers: negative.slice(0, 4),
    recommended_recovery_strategy,
    expected_recovery_window_days,
  };
}

/** Línea compacta para cards de cola. */
export function formatRecoveryLikelihoodLine(likelihood: RecoveryLikelihood): string {
  const bandLabel =
    likelihood.band === "high"
      ? "alta"
      : likelihood.band === "medium"
        ? "media"
        : likelihood.band === "low"
          ? "baja"
          : "muy baja";
  const driver =
    likelihood.negative_drivers[0] ??
    likelihood.main_drivers[0] ??
    "score operativo";
  return `Recuperación estimada: ${likelihood.probability_pct}% · ${likelihood.expected_recovery_window_days} · ${bandLabel} por ${driver.toLowerCase()}`;
}

export function computeRecoveryLikelihoodForSummary(
  summary: ClientOperationalSummary,
  hydration: ClientOperationalHydrationRecord | null,
  actions: DECollectionAction[] = [],
  followUp: DEFollowUpRow | null = null,
  receipts: DERecentReceipt[] = [],
  now?: Date
): RecoveryLikelihood {
  const input = buildRecoveryLikelihoodInput(summary, hydration, actions, followUp, receipts, now);
  return computeRecoveryLikelihood(input);
}
