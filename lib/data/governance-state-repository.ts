import type { SupabaseClient } from "@supabase/supabase-js";

import type { OperationalAutomationGovernanceState } from "@/lib/copilot-operational-governance-types";
import type { OperationalAutomationAuditEvent } from "@/lib/copilot-operational-governance-types";

const GOVERNANCE_STATE_SELECT =
  "rule_id, enabled, muted_until, cooldown_minutes, metadata, updated_by, updated_at" as const;

export type GovernanceStateRow = {
  rule_id: string;
  enabled: boolean;
  muted_until: string | null;
  cooldown_minutes: number | null;
  metadata: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
};

export function mapGovernanceStateRow(
  row: Record<string, unknown>
): OperationalAutomationGovernanceState["rules"][number] {
  return {
    ruleId: String(row.rule_id),
    enabled: Boolean(row.enabled),
    cooldownMinutes:
      row.cooldown_minutes != null ? Number(row.cooldown_minutes) : undefined,
    mutedUntil:
      row.muted_until != null ? String(row.muted_until) : undefined,
  };
}

export async function loadGovernanceStateFromDb(
  client: SupabaseClient,
  workspaceCompanyId: string
): Promise<OperationalAutomationGovernanceState["rules"]> {
  const result = await client
    .from("copilot_operational_governance_state")
    .select(GOVERNANCE_STATE_SELECT)
    .eq("workspace_company_id", workspaceCompanyId);

  if (result.error || !result.data) return [];
  return (result.data as Record<string, unknown>[]).map(mapGovernanceStateRow);
}

export async function upsertGovernanceRuleToDb(
  client: SupabaseClient,
  workspaceCompanyId: string,
  ruleId: string,
  patch: {
    enabled?: boolean;
    mutedUntil?: string | null;
    cooldownMinutes?: number;
  },
  updatedBy?: string | null
): Promise<void> {
  const row: Record<string, unknown> = {
    workspace_company_id: workspaceCompanyId,
    rule_id: ruleId,
    updated_by: updatedBy ?? null,
    updated_at: new Date().toISOString(),
  };

  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.cooldownMinutes !== undefined) row.cooldown_minutes = patch.cooldownMinutes;
  if (patch.mutedUntil !== undefined) {
    row.muted_until = patch.mutedUntil ?? null;
  }

  await client
    .from("copilot_operational_governance_state")
    .upsert(row, { onConflict: "workspace_company_id,rule_id" });
}

export async function insertGovernanceAuditBatch(
  client: SupabaseClient,
  workspaceCompanyId: string,
  events: OperationalAutomationAuditEvent[]
): Promise<void> {
  if (events.length === 0) return;

  const rows = events.map((event) => ({
    workspace_company_id: workspaceCompanyId,
    rule_id: event.ruleId,
    workflow_id: event.workflowId ?? null,
    action_id: event.actionId ?? null,
    decision: event.decision,
    reasons: event.reasons,
    occurred_at: event.generatedAt,
  }));

  await client.from("copilot_operational_governance_audit").insert(rows);
}
