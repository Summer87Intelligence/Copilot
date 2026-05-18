/**
 * Pre-go-live hardening — Fase 4C automation (no commit).
 * Run: node --env-file=.env.local --import tsx scripts/hardening-4c-pre-go-live.ts
 */

import { createClient } from "@supabase/supabase-js";

import {
  isDailyQueueSnapshotFresh,
  readDailyQueueSnapshot,
} from "@/lib/data/decision-daily-queue-repository";
import {
  isOperationalAnalyticsSnapshotFresh,
  readOperationalAnalyticsSnapshot,
} from "@/lib/data/decision-operational-analytics-repository";
import { runOperationalAutomation } from "@/lib/decision-engine/operational-automation-runner";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const tenantId = process.env.WORKSPACE_COMPANY_ID?.trim();

if (!url || !key || !tenantId) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or WORKSPACE_COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function section(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

async function pickLowRiskCustomerId(): Promise<string | null> {
  const { data, error } = await supabase
    .from("decision_operational_state")
    .select("customer_id, current_risk, operational_state, breached_sla")
    .eq("workspace_company_id", tenantId!)
    .in("current_risk", ["low", "medium"])
    .in("operational_state", ["monitoring", "follow_up", "new_risk"])
    .eq("breached_sla", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("pickLowRiskCustomerId:", error.message);
    return null;
  }
  return data?.customer_id ?? null;
}

async function countRows(table: string, filter: Record<string, string | boolean>) {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filter)) {
    q = q.eq(k, v);
  }
  const { count, error } = await q;
  if (error) return { error: error.message, count: null };
  return { count: count ?? 0 };
}

async function snapshotStatus() {
  const [queue, analytics] = await Promise.all([
    readDailyQueueSnapshot(supabase, tenantId!),
    readOperationalAnalyticsSnapshot(supabase, tenantId!),
  ]);
  return {
    queue: queue
      ? { generated_at: queue.generated_at, expires_at: queue.expires_at, fresh: isDailyQueueSnapshotFresh(queue) }
      : null,
    analytics: analytics
      ? {
          generated_at: analytics.generated_at,
          expires_at: analytics.expires_at,
          fresh: isOperationalAnalyticsSnapshotFresh(analytics),
        }
      : null,
  };
}

async function main() {
  section("0. Preflight — tablas automation");
  const { data: runsCheck } = await supabase.from("decision_automation_runs").select("id").limit(1);
  const { data: actionsCheck } = await supabase.from("decision_automation_actions").select("id").limit(1);
  console.log({
    decision_automation_runs: runsCheck !== null ? "ok" : "missing",
    decision_automation_actions: actionsCheck !== null ? "ok" : "missing",
  });

  const beforeSnapshots = await snapshotStatus();
  console.log("Snapshots before:", beforeSnapshots);

  section("1. Dry-run (preview, sin ejecutar)");
  const dry = await runOperationalAutomation(supabase, tenantId!, {
    dryRun: true,
    preview: true,
    force: true,
    actorUserId: "hardening:4c",
  });

  console.log({
    run_id: dry.run.id,
    dry_run: dry.run.dry_run,
    status: dry.run.status,
    rules_evaluated: dry.run.rules_evaluated,
    actions_generated: dry.run.actions_generated,
    actions_executed: dry.run.actions_executed,
    actions_deduped: dry.run.actions_deduped,
    metrics: dry.metrics,
  });

  const previewSample = dry.preview.slice(0, 8).map((a) => ({
    rule_key: a.rule_key,
    action_type: a.action_type,
    customer_id: a.customer_id,
    dedupe_key: a.dedupe_key,
    reason: a.reason,
  }));
  console.log("Preview sample:", previewSample);

  const dryActionsAllUnexecuted = dry.actions.every((a) => !a.executed);
  console.log("Dry-run: todas las actions persisted con executed=false:", dryActionsAllUnexecuted);

  const previewCustomer =
    process.env.TARGET_CUSTOMER_ID?.trim() ??
    dry.preview.find((a) => a.action_type === "create_follow_up")?.customer_id ??
    "23d180ca-3896-461b-825f-5bc0819a2c49";
  const customerId = previewCustomer ?? (await pickLowRiskCustomerId());
  if (!customerId) {
    console.error("No customer found — aborting live test");
    process.exit(1);
  }
  console.log("Customer for live test:", customerId, previewCustomer ? "(from dry-run preview)" : "(low-risk fallback)");

  const stateBefore = await supabase
    .from("decision_operational_state")
    .select("operational_state, current_risk, breached_sla, assigned_user_id")
    .eq("workspace_company_id", tenantId!)
    .eq("customer_id", customerId)
    .maybeSingle();

  const followUpsBefore = await countRows("decision_follow_ups", {
    workspace_company_id: tenantId!,
    customer_id: customerId,
  });

  section("2. Live limitado (1 customer)");
  const live1 = await runOperationalAutomation(supabase, tenantId!, {
    dryRun: false,
    customerIds: [customerId],
    force: true,
    actorUserId: "hardening:4c",
  });

  console.log({
    run_id: live1.run.id,
    actions_generated: live1.run.actions_generated,
    actions_executed: live1.run.actions_executed,
    actions_deduped: live1.run.actions_deduped,
    actions: live1.actions.map((a) => ({
      rule_key: a.rule_key,
      action_type: a.action_type,
      dedupe_key: a.dedupe_key,
      executed: a.executed,
      result_ok: a.execution_result?.ok,
    })),
  });

  const afterSnapshots1 = await snapshotStatus();
  console.log("Snapshots after live #1:", afterSnapshots1);

  section("3. Segunda corrida (dedupe esperado)");
  const live2 = await runOperationalAutomation(supabase, tenantId!, {
    dryRun: false,
    customerIds: [customerId],
    force: true,
    actorUserId: "hardening:4c",
  });

  console.log({
    run_id: live2.run.id,
    actions_generated: live2.run.actions_generated,
    actions_executed: live2.run.actions_executed,
    actions_deduped: live2.run.actions_deduped,
  });

  const dedupeWorked =
    live2.run.actions_generated === 0 ||
    live2.run.actions_deduped >= live2.run.actions_generated ||
    live2.metrics.actions_deduped > 0;

  console.log("Dedupe segunda corrida OK:", dedupeWorked);

  const stateAfter = await supabase
    .from("decision_operational_state")
    .select("operational_state, current_risk, breached_sla, assigned_user_id")
    .eq("workspace_company_id", tenantId!)
    .eq("customer_id", customerId)
    .maybeSingle();

  const followUpsAfter = await countRows("decision_follow_ups", {
    workspace_company_id: tenantId!,
    customer_id: customerId,
  });

  section("4. Resumen seguridad");
  console.log({
    state_before: stateBefore.data,
    state_after: stateAfter.data,
    follow_ups_before: followUpsBefore.count,
    follow_ups_after: followUpsAfter.count,
    queue_invalidated:
      beforeSnapshots.queue?.fresh === true && afterSnapshots1.queue?.fresh === false,
    analytics_invalidated:
      beforeSnapshots.analytics?.fresh === true && afterSnapshots1.analytics?.fresh === false,
  });

  section("DONE");
  process.exit(dedupeWorked && dry.run.actions_executed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
