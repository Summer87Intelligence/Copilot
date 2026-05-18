/**
 * Phase 5C — Executive Briefing Repository.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutiveDecisionBrief } from "@/lib/decision-engine/executive-decision-engine";

export const EXECUTIVE_BRIEFING_TTL_MINUTES = 15;

export type ExecutiveBriefingRow = {
  id: string;
  workspace_company_id: string;
  generated_at: string;
  payload: ExecutiveDecisionBrief;
  source_snapshot_ids: Record<string, unknown>;
  expires_at: string;
  created_at: string;
};

export async function readExecutiveBriefing(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<ExecutiveBriefingRow | null> {
  const { data, error } = await supabase
    .from("decision_executive_briefings")
    .select("id, workspace_company_id, generated_at, payload, source_snapshot_ids, expires_at, created_at")
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id:                   data.id as string,
    workspace_company_id: data.workspace_company_id as string,
    generated_at:         data.generated_at as string,
    payload:              data.payload as ExecutiveDecisionBrief,
    source_snapshot_ids:  (data.source_snapshot_ids as Record<string, unknown>) ?? {},
    expires_at:           data.expires_at as string,
    created_at:           data.created_at as string,
  };
}

export function isExecutiveBriefingFresh(row: ExecutiveBriefingRow): boolean {
  return new Date(row.expires_at) > new Date();
}

export function isExecutiveBriefingPayloadCurrent(
  payload: unknown
): payload is ExecutiveDecisionBrief {
  if (payload == null || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.generated_at === "string" &&
    typeof p.executive_summary === "string" &&
    Array.isArray(p.top_decisions) &&
    Array.isArray(p.source_signals)
  );
}

export async function upsertExecutiveBriefing(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  brief: ExecutiveDecisionBrief,
  sourceSnapshotIds: Record<string, unknown>
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXECUTIVE_BRIEFING_TTL_MINUTES * 60 * 1000);

  const { error } = await supabase.from("decision_executive_briefings").upsert(
    {
      workspace_company_id: tenantCompanyId,
      generated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      payload: brief as unknown as Record<string, unknown>,
      source_snapshot_ids: sourceSnapshotIds,
    },
    { onConflict: "workspace_company_id" }
  );

  if (error) {
    throw new Error(`DE: upsertExecutiveBriefing: ${error.message}`);
  }
}
