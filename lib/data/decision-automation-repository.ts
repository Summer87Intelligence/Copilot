/**
 * Phase 4C — Automation runs & actions persistence.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AutomationAction,
  AutomationActionRow,
  AutomationActionType,
  AutomationRunRow,
  AutomationRunStatus,
} from "@/lib/decision-engine/de-types";

const RUN_SELECT =
  "id, workspace_company_id, started_at, completed_at, rules_evaluated, actions_generated, actions_executed, actions_deduped, dry_run, status, error_message" as const;

const ACTION_SELECT =
  "id, automation_run_id, customer_id, rule_key, action_type, action_payload, executed, executed_at, execution_result, dedupe_key, created_at" as const;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function mapRun(row: Record<string, unknown>): AutomationRunRow {
  return {
    id: str(row["id"]),
    workspace_company_id: str(row["workspace_company_id"]),
    started_at: str(row["started_at"]),
    completed_at: strOrNull(row["completed_at"]),
    rules_evaluated: Number(row["rules_evaluated"] ?? 0),
    actions_generated: Number(row["actions_generated"] ?? 0),
    actions_executed: Number(row["actions_executed"] ?? 0),
    actions_deduped: Number(row["actions_deduped"] ?? 0),
    dry_run: row["dry_run"] === true,
    status: str(row["status"]) as AutomationRunStatus,
    error_message: strOrNull(row["error_message"]),
  };
}

function mapAction(row: Record<string, unknown>): AutomationActionRow {
  return {
    id: str(row["id"]),
    automation_run_id: str(row["automation_run_id"]),
    customer_id: str(row["customer_id"]),
    rule_key: str(row["rule_key"]),
    action_type: str(row["action_type"]) as AutomationActionType,
    action_payload:
      row["action_payload"] != null && typeof row["action_payload"] === "object"
        ? (row["action_payload"] as Record<string, unknown>)
        : {},
    executed: row["executed"] === true,
    executed_at: strOrNull(row["executed_at"]),
    execution_result:
      row["execution_result"] != null && typeof row["execution_result"] === "object"
        ? (row["execution_result"] as Record<string, unknown>)
        : null,
    dedupe_key: str(row["dedupe_key"]),
    created_at: str(row["created_at"]),
  };
}

export async function createAutomationRun(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  dryRun: boolean
): Promise<AutomationRunRow> {
  const { data, error } = await supabase
    .from("decision_automation_runs")
    .insert({
      workspace_company_id: tenantCompanyId,
      dry_run: dryRun,
      status: "running",
    })
    .select(RUN_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`DE: createAutomationRun: ${error?.message ?? "no row"}`);
  }
  return mapRun(data as Record<string, unknown>);
}

export async function completeAutomationRun(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  runId: string,
  patch: {
    rules_evaluated: number;
    actions_generated: number;
    actions_executed: number;
    actions_deduped: number;
    status: AutomationRunStatus;
    error_message?: string | null;
  }
): Promise<AutomationRunRow> {
  const { data, error } = await supabase
    .from("decision_automation_runs")
    .update({
      completed_at: new Date().toISOString(),
      rules_evaluated: patch.rules_evaluated,
      actions_generated: patch.actions_generated,
      actions_executed: patch.actions_executed,
      actions_deduped: patch.actions_deduped,
      status: patch.status,
      error_message: patch.error_message ?? null,
    })
    .eq("id", runId)
    .eq("workspace_company_id", tenantCompanyId)
    .select(RUN_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`DE: completeAutomationRun: ${error?.message ?? "no row"}`);
  }
  return mapRun(data as Record<string, unknown>);
}

export async function insertAutomationActions(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  runId: string,
  actions: AutomationAction[]
): Promise<AutomationActionRow[]> {
  if (actions.length === 0) return [];

  const rows = actions.map((a) => ({
    workspace_company_id: tenantCompanyId,
    automation_run_id: runId,
    customer_id: a.customer_id,
    rule_key: a.rule_key,
    action_type: a.action_type,
    action_payload: a.payload,
    dedupe_key: a.dedupe_key,
    executed: false,
  }));

  const { data, error } = await supabase
    .from("decision_automation_actions")
    .insert(rows)
    .select(ACTION_SELECT);

  if (error) {
    throw new Error(`DE: insertAutomationActions: ${error.message}`);
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapAction);
}

export async function markAutomationActionExecuted(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  actionId: string,
  result: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("decision_automation_actions")
    .update({
      executed: true,
      executed_at: new Date().toISOString(),
      execution_result: result,
    })
    .eq("id", actionId)
    .eq("workspace_company_id", tenantCompanyId);

  if (error) {
    throw new Error(`DE: markAutomationActionExecuted: ${error.message}`);
  }
}

export async function findRecentDedupeKeys(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  dedupeKeys: string[],
  sinceIso: string
): Promise<Set<string>> {
  if (dedupeKeys.length === 0) return new Set();

  const { data, error } = await supabase
    .from("decision_automation_actions")
    .select("dedupe_key")
    .eq("workspace_company_id", tenantCompanyId)
    .in("dedupe_key", dedupeKeys)
    .eq("executed", true)
    .gte("created_at", sinceIso)
    .limit(500);

  if (error) {
    console.warn("DE: findRecentDedupeKeys (non-fatal):", error.message);
    return new Set();
  }

  return new Set(
    ((data ?? []) as { dedupe_key: string }[]).map((r) => r.dedupe_key).filter(Boolean)
  );
}

export async function selectAutomationRuns(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  limit = 20
): Promise<AutomationRunRow[]> {
  const { data, error } = await supabase
    .from("decision_automation_runs")
    .select(RUN_SELECT)
    .eq("workspace_company_id", tenantCompanyId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("DE: selectAutomationRuns (non-fatal):", error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapRun);
}

export async function selectAutomationActions(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: { runId?: string; limit?: number } = {}
): Promise<AutomationActionRow[]> {
  const limit = options.limit ?? 50;
  let q = supabase
    .from("decision_automation_actions")
    .select(ACTION_SELECT)
    .eq("workspace_company_id", tenantCompanyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.runId) {
    q = q.eq("automation_run_id", options.runId);
  }

  const { data, error } = await q;

  if (error) {
    console.warn("DE: selectAutomationActions (non-fatal):", error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapAction);
}

export async function findActiveAutomationRun(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  maxAgeMinutes = 30
): Promise<AutomationRunRow | null> {
  const since = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("decision_automation_runs")
    .select(RUN_SELECT)
    .eq("workspace_company_id", tenantCompanyId)
    .eq("status", "running")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapRun(data as Record<string, unknown>);
}
