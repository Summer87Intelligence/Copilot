/**
 * Phase 4C — ejecución de automatizaciones (idempotente, dry-run, audit).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  completeAutomationRun,
  createAutomationRun,
  findActiveAutomationRun,
  findRecentDedupeKeys,
  insertAutomationActions,
  markAutomationActionExecuted,
} from "@/lib/data/decision-automation-repository";
import { loadAutomationEvaluationInput } from "@/lib/data/decision-automation-evaluation-loader";
import { invalidateOperationalAnalyticsSnapshot } from "@/lib/data/decision-operational-analytics-repository";
import { invalidateDailyQueueSnapshot } from "@/lib/data/decision-daily-queue-repository";
import { createFollowUpDeduped } from "@/lib/data/decision-follow-up-repository";
import {
  selectOperationalStateByCustomer,
  upsertOperationalState,
} from "@/lib/data/decision-operational-state-repository";
import type {
  AutomationAction,
  AutomationRunResult,
  RiskLevel,
} from "@/lib/decision-engine/de-types";
import { autoAssignOperationalOwnersForTenant } from "@/lib/decision-engine/decision-engine-ownership-service";
import {
  AUTOMATION_RULE_COUNT,
  bumpRiskLevel,
  evaluateAutomationRules,
} from "@/lib/decision-engine/operational-automation-engine";
import {
  filterActionsByDedupe,
  sinceIsoForCooldown,
} from "@/lib/decision-engine/operational-automation-dedupe";
import type { CopilotRequestLogger } from "@/lib/copilot-structured-logger";

export const AUTOMATION_ACTOR_ID = "system:operational-automation";

export type RunAutomationOptions = {
  dryRun?: boolean;
  customerIds?: string[];
  force?: boolean;
  preview?: boolean;
  actorUserId?: string;
};

async function loadBlockedDedupeKeys(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  actions: AutomationAction[],
  now: Date
): Promise<Set<string>> {
  const blocked = new Set<string>();
  const byRule = new Map<string, AutomationAction[]>();
  for (const a of actions) {
    const list = byRule.get(a.rule_key) ?? [];
    list.push(a);
    byRule.set(a.rule_key, list);
  }

  for (const [, group] of byRule) {
    const keys = group.map((a) => a.dedupe_key);
    const since = sinceIsoForCooldown(group[0]!.rule_key, now);
    const recent = await findRecentDedupeKeys(supabase, tenantCompanyId, keys, since);
    for (const k of recent) blocked.add(k);
  }

  return blocked;
}

async function executeAutomationAction(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  action: AutomationAction,
  actorUserId: string
): Promise<Record<string, unknown>> {
  const customerId = action.customer_id;
  const state = await selectOperationalStateByCustomer(supabase, tenantCompanyId, customerId);
  const now = new Date().toISOString();

  switch (action.action_type) {
    case "create_follow_up": {
      const scheduled = String(action.payload.scheduled_for ?? "");
      const row = await createFollowUpDeduped(supabase, tenantCompanyId, {
        customerId,
        scheduledFor: scheduled,
        reason: String(action.payload.reason ?? action.reason),
        sourceActionId: null,
        priority: (action.payload.priority as RiskLevel) ?? "high",
      });
      return { ok: true, follow_up_id: row.id };
    }
    case "escalate_case": {
      const target = String(action.payload.target_state ?? "escalated");
      const row = await upsertOperationalState(supabase, tenantCompanyId, {
        customerId,
        currentRisk: state?.current_risk === "critical" ? "critical" : "high",
        currentPriority: "critical",
        machineState: target as "escalated",
        previousState: state?.machine_state ?? null,
        transitionedAt: now,
        transitionReason: `automation:${action.rule_key}`,
        breachedSla: state?.breached_sla ?? true,
        nextFollowUpAt: state?.next_follow_up_at ?? null,
        lastContactAt: state?.last_contact_at ?? null,
        activePromise: state?.active_promise ?? false,
        escalated: true,
      });
      return { ok: true, machine_state: row.machine_state };
    }
    case "auto_assign": {
      const result = await autoAssignOperationalOwnersForTenant(supabase, tenantCompanyId, {
        customerIds: [customerId],
        assignedBy: actorUserId,
      });
      const assigned = result.assigned[0];
      return {
        ok: Boolean(assigned),
        assigned_user_id: assigned?.assigned_user_id ?? null,
      };
    }
    case "increase_priority": {
      const risk = (action.payload.target_risk as RiskLevel) ?? bumpRiskLevel(state?.current_risk ?? "medium");
      const row = await upsertOperationalState(supabase, tenantCompanyId, {
        customerId,
        currentRisk: risk,
        currentPriority: (action.payload.target_priority as RiskLevel) ?? risk,
        machineState: state?.machine_state ?? "follow_up",
        previousState: state?.previous_state ?? null,
        transitionedAt: state?.transitioned_at ?? now,
        transitionReason: `automation:${action.rule_key}`,
        breachedSla: true,
        nextFollowUpAt: state?.next_follow_up_at ?? null,
        lastContactAt: state?.last_contact_at ?? null,
        activePromise: state?.active_promise ?? false,
        escalated: state?.escalated ?? false,
      });
      return { ok: true, current_risk: row.current_risk };
    }
    case "mark_overdue": {
      const row = await upsertOperationalState(supabase, tenantCompanyId, {
        customerId,
        currentRisk: state?.current_risk ?? "high",
        currentPriority: state?.current_risk ?? "high",
        machineState: state?.machine_state ?? "follow_up",
        previousState: state?.previous_state ?? null,
        transitionedAt: state?.transitioned_at ?? now,
        transitionReason: `automation:${action.rule_key}`,
        breachedSla: true,
        nextFollowUpAt: state?.next_follow_up_at ?? null,
        lastContactAt: state?.last_contact_at ?? null,
        activePromise: state?.active_promise ?? false,
        escalated: state?.escalated ?? false,
      });
      return { ok: true, breached_sla: row.breached_sla };
    }
    case "create_operational_alert":
    case "suggest_payment_plan":
    case "trigger_manual_review": {
      if (action.action_type === "trigger_manual_review") {
        const row = await upsertOperationalState(supabase, tenantCompanyId, {
          customerId,
          currentRisk: "critical",
          currentPriority: "critical",
          machineState: "legal_review",
          previousState: state?.machine_state ?? null,
          transitionedAt: now,
          transitionReason: `automation:${action.rule_key}`,
          breachedSla: state?.breached_sla ?? false,
          nextFollowUpAt: state?.next_follow_up_at ?? null,
          lastContactAt: state?.last_contact_at ?? null,
          activePromise: state?.active_promise ?? false,
          escalated: state?.escalated ?? true,
        });
        return { ok: true, machine_state: row.machine_state, recorded: true };
      }
      return { ok: true, recorded: true, action_type: action.action_type, payload: action.payload };
    }
    default:
      return { ok: false, error: "unknown_action_type" };
  }
}

export async function runOperationalAutomation(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: RunAutomationOptions,
  log?: CopilotRequestLogger
): Promise<AutomationRunResult> {
  const dryRun = options.dryRun ?? false;
  const preview = options.preview ?? false;
  const actorUserId = options.actorUserId ?? AUTOMATION_ACTOR_ID;
  const now = new Date();

  if (!options.force) {
    const active = await findActiveAutomationRun(supabase, tenantCompanyId);
    if (active) {
      throw new Error("DE: automation run already in progress for workspace");
    }
  }

  log?.info("automation_started", {
    tenant_id: tenantCompanyId,
    dry_run: dryRun,
    preview,
    customer_filter: options.customerIds?.length ?? 0,
  });

  const run = await createAutomationRun(supabase, tenantCompanyId, dryRun || preview);

  try {
    const input = await loadAutomationEvaluationInput(
      supabase,
      tenantCompanyId,
      options.customerIds,
      now
    );
    const rawActions = evaluateAutomationRules(input, now);
    const blocked = await loadBlockedDedupeKeys(supabase, tenantCompanyId, rawActions, now);
    const inRun = new Set<string>();
    const { allowed, deduped } = filterActionsByDedupe(rawActions, blocked, inRun);

    for (const a of rawActions) {
      if (!allowed.some((x) => x.dedupe_key === a.dedupe_key) && blocked.has(a.dedupe_key)) {
        log?.info("automation_deduped", {
          rule_key: a.rule_key,
          customer_id: a.customer_id,
          dedupe_key: a.dedupe_key,
        });
      }
    }

    for (const a of allowed) {
      log?.info("automation_rule_triggered", {
        rule_key: a.rule_key,
        customer_id: a.customer_id,
        action_type: a.action_type,
      });
    }

    const persisted = await insertAutomationActions(
      supabase,
      tenantCompanyId,
      run.id,
      allowed
    );

    log?.info("automation_action_created", { count: persisted.length });

    let executed = 0;
    if (!dryRun && !preview) {
      for (const row of persisted) {
        const action = allowed.find(
          (a) => a.dedupe_key === row.dedupe_key && a.customer_id === row.customer_id
        );
        if (!action) continue;
        try {
          const result = await executeAutomationAction(
            supabase,
            tenantCompanyId,
            action,
            actorUserId
          );
          await markAutomationActionExecuted(supabase, tenantCompanyId, row.id, result);
          executed += 1;
        } catch (err) {
          await markAutomationActionExecuted(supabase, tenantCompanyId, row.id, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (executed > 0) {
        await Promise.all([
          invalidateDailyQueueSnapshot(supabase, tenantCompanyId),
          invalidateOperationalAnalyticsSnapshot(supabase, tenantCompanyId),
        ]);
      }
    }

    const escalations = allowed.filter((a) => a.action_type === "escalate_case").length;
    const followUps = allowed.filter((a) => a.action_type === "create_follow_up").length;

    const completed = await completeAutomationRun(supabase, tenantCompanyId, run.id, {
      rules_evaluated: AUTOMATION_RULE_COUNT,
      actions_generated: allowed.length,
      actions_executed: executed,
      actions_deduped: deduped,
      status: "completed",
    });

    log?.info("automation_completed", {
      run_id: completed.id,
      actions_generated: allowed.length,
      actions_executed: executed,
      actions_deduped: deduped,
      dry_run: dryRun,
    });

    return {
      run: completed,
      actions: persisted,
      preview: allowed,
      metrics: {
        total_evaluated: input.customers.length,
        actions_generated: allowed.length,
        actions_executed: executed,
        actions_deduped: deduped,
        escalations_triggered: escalations,
        follow_ups_created: followUps,
      },
    };
  } catch (err) {
    await completeAutomationRun(supabase, tenantCompanyId, run.id, {
      rules_evaluated: AUTOMATION_RULE_COUNT,
      actions_generated: 0,
      actions_executed: 0,
      actions_deduped: 0,
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
    });
    log?.error("automation_failed", err, { run_id: run.id });
    throw err;
  }
}
