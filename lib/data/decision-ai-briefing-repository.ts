/**
 * Phase 5A — AI briefing snapshot repository.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AIOperationalIntelligencePayload } from "@/lib/decision-engine/ai/ai-types";

export const AI_BRIEFING_TTL_MINUTES = 30;

export type AIBriefingSnapshotRow = {
  id: string;
  workspace_company_id: string;
  generated_at: string;
  briefing_type: string;
  payload: AIOperationalIntelligencePayload;
  source_snapshot_ids: Record<string, unknown>;
  expires_at: string;
  generation_ms: number | null;
};

export async function readAIBriefingSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  briefingType: string
): Promise<AIBriefingSnapshotRow | null> {
  const { data, error } = await supabase
    .from("decision_ai_briefings")
    .select(
      "id, workspace_company_id, generated_at, briefing_type, payload, source_snapshot_ids, expires_at, generation_ms"
    )
    .eq("workspace_company_id", tenantCompanyId)
    .eq("briefing_type", briefingType)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    workspace_company_id: data.workspace_company_id as string,
    generated_at: data.generated_at as string,
    briefing_type: data.briefing_type as string,
    payload: data.payload as AIOperationalIntelligencePayload,
    source_snapshot_ids: (data.source_snapshot_ids as Record<string, unknown>) ?? {},
    expires_at: data.expires_at as string,
    generation_ms: data.generation_ms as number | null,
  };
}

export function isAIBriefingSnapshotFresh(row: AIBriefingSnapshotRow): boolean {
  return new Date(row.expires_at) > new Date();
}

export function isAIBriefingPayloadCurrent(
  payload: unknown
): payload is AIOperationalIntelligencePayload {
  if (payload == null || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.generated_at === "string" &&
    p.briefing != null &&
    Array.isArray(p.anomalies) &&
    Array.isArray(p.operator_insights) &&
    p.metrics != null
  );
}

export async function upsertAIBriefingSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  briefingType: string,
  payload: AIOperationalIntelligencePayload,
  generationMs: number
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + AI_BRIEFING_TTL_MINUTES * 60 * 1000);

  const { error } = await supabase.from("decision_ai_briefings").upsert(
    {
      workspace_company_id: tenantCompanyId,
      briefing_type: briefingType,
      generated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      payload: payload as unknown as Record<string, unknown>,
      source_snapshot_ids: payload.source_snapshot_ids,
      generation_ms: generationMs,
    },
    { onConflict: "workspace_company_id,briefing_type" }
  );

  if (error) {
    throw new Error(`DE: upsertAIBriefingSnapshot: ${error.message}`);
  }
}
