/**
 * Phase 4C — reglas automáticas determinísticas.
 */

import { buildDedupeKey } from "@/lib/decision-engine/operational-automation-dedupe";
import type {
  AutomationAction,
  AutomationCustomerContext,
  AutomationEvaluationInput,
  AutomationRuleKey,
  RiskLevel,
} from "@/lib/decision-engine/de-types";

const MS_PER_HOUR = 3_600_000;
const INACTIVE = new Set(["recovered", "paused"]);

function hoursSince(iso: string | null, now: Date): number {
  if (!iso) return 9999;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 9999;
  return (now.getTime() - t) / MS_PER_HOUR;
}

function daysSince(iso: string | null, now: Date): number {
  return hoursSince(iso, now) / 24;
}

function isActive(ctx: AutomationCustomerContext): boolean {
  if (!ctx.state) return ctx.pending_balance > 0;
  return !INACTIVE.has(ctx.state.machine_state);
}

function isCritical(ctx: AutomationCustomerContext): boolean {
  const s = ctx.state;
  if (!s) return false;
  return (
    s.current_risk === "critical" ||
    s.machine_state === "critical" ||
    s.machine_state === "escalated" ||
    s.machine_state === "legal_review" ||
    s.breached_sla
  );
}

function hasActionSince(ctx: AutomationCustomerContext, hours: number, now: Date): boolean {
  if (!ctx.last_action_at) return false;
  return hoursSince(ctx.last_action_at, now) <= hours;
}

function action(
  rule_key: AutomationRuleKey,
  action_type: AutomationAction["action_type"],
  ctx: AutomationCustomerContext,
  priority: number,
  reason: string,
  payload: Record<string, unknown>,
  alertType?: string
): AutomationAction {
  return {
    rule_key,
    action_type,
    customer_id: ctx.customer_id,
    dedupe_key: buildDedupeKey(rule_key, ctx.customer_id, alertType),
    priority,
    reason,
    payload,
  };
}

/** Regla 1: promesa vencida + sin acción 24h → escalate */
function rulePromiseOverdue(ctx: AutomationCustomerContext, now: Date): AutomationAction | null {
  const s = ctx.state;
  if (!s || !isActive(ctx)) return null;
  const promiseOverdue =
    s.active_promise &&
    (s.next_follow_up_at ? new Date(s.next_follow_up_at).getTime() < now.getTime() : false);
  if (!promiseOverdue && s.machine_state !== "payment_promised") return null;
  if (hasActionSince(ctx, 24, now)) return null;
  if (s.machine_state === "escalated" || s.machine_state === "critical") return null;

  return action(
    "promise_overdue_no_action_24h",
    "escalate_case",
    ctx,
    90,
    "Promesa vencida sin contacto en 24h",
    { target_state: "escalated", previous_state: s.machine_state }
  );
}

/** Regla 2: crítico sin owner > 2h → auto_assign */
function ruleCriticalUnowned(ctx: AutomationCustomerContext, now: Date): AutomationAction | null {
  const s = ctx.state;
  if (!s || !isActive(ctx) || !isCritical(ctx)) return null;
  if (s.assigned_user_id) return null;
  const anchor = s.transitioned_at ?? s.updated_at;
  if (hoursSince(anchor, now) < 2) return null;

  return action(
    "critical_unowned_2h",
    "auto_assign",
    ctx,
    95,
    "Caso crítico sin responsable > 2h",
    { reason: "critical_unowned_2h" }
  );
}

/** Regla 3: SLA vencido > 48h → increase_priority */
function ruleSlaBreach48h(ctx: AutomationCustomerContext, now: Date): AutomationAction | null {
  const s = ctx.state;
  if (!s || !isActive(ctx) || !s.breached_sla) return null;
  if (hoursSince(s.transitioned_at ?? s.updated_at, now) < 48) return null;
  if (s.current_risk === "critical") return null;

  return action(
    "sla_breach_48h",
    "increase_priority",
    ctx,
    85,
    "SLA vencido más de 48h",
    { target_risk: "critical", target_priority: "critical" }
  );
}

/** Regla 4: sin contacto > 14d → create_follow_up */
function ruleNoContact14d(ctx: AutomationCustomerContext, now: Date): AutomationAction | null {
  if (!isActive(ctx)) return null;
  const contactRef = ctx.last_contact_at ?? ctx.state?.last_contact_at ?? null;
  if (daysSince(contactRef, now) < 14) return null;
  if (ctx.pending_follow_up) return null;

  const scheduled = new Date(now);
  scheduled.setDate(scheduled.getDate() + 1);

  return action(
    "no_contact_14d",
    "create_follow_up",
    ctx,
    70,
    "Sin contacto más de 14 días",
    {
      scheduled_for: scheduled.toISOString().split("T")[0],
      reason: "Seguimiento automático — sin contacto 14d",
      priority: "high",
    }
  );
}

/** Regla 5: concentración > 40% + crítico → alert */
function ruleConcentrationAlert(ctx: AutomationCustomerContext): AutomationAction | null {
  if (!isActive(ctx) || !isCritical(ctx)) return null;
  if (ctx.concentration_pct <= 40) return null;

  return action(
    "concentration_critical_alert",
    "create_operational_alert",
    ctx,
    80,
    `Concentración ${ctx.concentration_pct}% con riesgo crítico`,
    {
      alert_type: "high_concentration_critical",
      concentration_pct: ctx.concentration_pct,
    },
    "high_concentration_critical"
  );
}

/** Regla 6: +90d sin respuesta → manual review */
function ruleAging90d(ctx: AutomationCustomerContext, now: Date): AutomationAction | null {
  if (!isActive(ctx) || ctx.oldest_invoice_days < 90) return null;
  if (hasActionSince(ctx, 72, now)) return null;
  const s = ctx.state;
  if (s?.machine_state === "legal_review") return null;

  return action(
    "aging_90d_manual_review",
    "trigger_manual_review",
    ctx,
    75,
    "Deuda +90d sin respuesta reciente",
    { target_state: "legal_review" }
  );
}

/** Regla 7: pago parcial reciente → suggest payment plan */
function rulePartialPayment(ctx: AutomationCustomerContext): AutomationAction | null {
  if (!ctx.has_partial_payment_recent) return null;

  return action(
    "partial_payment_plan",
    "suggest_payment_plan",
    ctx,
    60,
    "Pago parcial reciente — sugerir plan",
    { pending_balance: ctx.pending_balance }
  );
}

const RULE_EVALUATORS: Array<
  (ctx: AutomationCustomerContext, now: Date) => AutomationAction | null
> = [
  rulePromiseOverdue,
  ruleCriticalUnowned,
  ruleSlaBreach48h,
  ruleNoContact14d,
  ruleConcentrationAlert,
  ruleAging90d,
  rulePartialPayment,
];

export const AUTOMATION_RULE_COUNT = RULE_EVALUATORS.length;

export function evaluateAutomationRules(
  input: AutomationEvaluationInput,
  now = new Date()
): AutomationAction[] {
  const actions: AutomationAction[] = [];

  for (const ctx of input.customers) {
    for (const evaluate of RULE_EVALUATORS) {
      const result = evaluate(ctx, now);
      if (result) actions.push(result);
    }
  }

  return actions.sort((a, b) => b.priority - a.priority);
}

export function bumpRiskLevel(level: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ["low", "medium", "high", "critical"];
  const idx = order.indexOf(level);
  return order[Math.min(order.length - 1, idx + 1)]!;
}
