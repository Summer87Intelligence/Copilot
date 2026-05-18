/**
 * Phase 4C — dedupe windows & cooldowns (anti-loop).
 */

import type { AutomationAction, AutomationRuleKey } from "@/lib/decision-engine/de-types";

const MS_PER_HOUR = 3_600_000;

/** Cooldown por regla + cliente (default 24h). */
export const RULE_COOLDOWN_MS: Record<AutomationRuleKey | "default", number> = {
  default: 24 * MS_PER_HOUR,
  promise_overdue_no_action_24h: 24 * MS_PER_HOUR,
  critical_unowned_2h: 12 * MS_PER_HOUR,
  sla_breach_48h: 24 * MS_PER_HOUR,
  no_contact_14d: 24 * MS_PER_HOUR,
  concentration_critical_alert: 12 * MS_PER_HOUR,
  aging_90d_manual_review: 48 * MS_PER_HOUR,
  partial_payment_plan: 24 * MS_PER_HOUR,
};

export function buildDedupeKey(
  ruleKey: AutomationRuleKey,
  customerId: string,
  alertType?: string
): string {
  if (alertType) {
    return `${ruleKey}:${customerId}:${alertType}`;
  }
  return `${ruleKey}:${customerId}`;
}

export function cooldownMsForRule(ruleKey: AutomationRuleKey): number {
  return RULE_COOLDOWN_MS[ruleKey] ?? RULE_COOLDOWN_MS.default;
}

export function sinceIsoForCooldown(ruleKey: AutomationRuleKey, now = new Date()): string {
  return new Date(now.getTime() - cooldownMsForRule(ruleKey)).toISOString();
}

export function filterActionsByDedupe(
  actions: AutomationAction[],
  blockedKeys: Set<string>,
  inRunKeys: Set<string>
): { allowed: AutomationAction[]; deduped: number } {
  const allowed: AutomationAction[] = [];
  let deduped = 0;

  for (const action of actions) {
    if (blockedKeys.has(action.dedupe_key) || inRunKeys.has(action.dedupe_key)) {
      deduped += 1;
      continue;
    }
    inRunKeys.add(action.dedupe_key);
    allowed.push(action);
  }

  return { allowed, deduped };
}

export function collectDedupeLookback(actions: AutomationAction[], now = new Date()): {
  keys: string[];
  sinceByKey: Map<string, string>;
} {
  const keys = [...new Set(actions.map((a) => a.dedupe_key))];
  const sinceByKey = new Map<string, string>();
  for (const action of actions) {
    const since = sinceIsoForCooldown(action.rule_key, now);
    const prev = sinceByKey.get(action.dedupe_key);
    if (!prev || since < prev) {
      sinceByKey.set(action.dedupe_key, since);
    }
  }
  return { keys, sinceByKey };
}
