/**
 * Phase 5B — predictive snapshot repository.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PredictiveSnapshot } from "@/lib/decision-engine/predictive/predictive-types";

export const PREDICTIVE_SNAPSHOT_TTL_MINUTES = 30;

export type PredictiveSnapshotRow = {
  id: string;
  workspace_company_id: string;
  generated_at: string;
  snapshot_type: string;
  payload: PredictiveSnapshot;
  expires_at: string;
  generation_ms: number | null;
};

export async function readPredictiveSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  snapshotType: string
): Promise<PredictiveSnapshotRow | null> {
  const { data, error } = await supabase
    .from("decision_predictive_snapshots")
    .select(
      "id, workspace_company_id, generated_at, snapshot_type, payload, expires_at, generation_ms"
    )
    .eq("workspace_company_id", tenantCompanyId)
    .eq("snapshot_type", snapshotType)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    workspace_company_id: data.workspace_company_id as string,
    generated_at: data.generated_at as string,
    snapshot_type: data.snapshot_type as string,
    payload: data.payload as PredictiveSnapshot,
    expires_at: data.expires_at as string,
    generation_ms: data.generation_ms as number | null,
  };
}

export function isPredictiveSnapshotFresh(row: PredictiveSnapshotRow): boolean {
  return new Date(row.expires_at) > new Date();
}

export function isPredictiveSnapshotPayloadCurrent(
  payload: unknown
): payload is PredictiveSnapshot {
  if (payload == null || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.generated_at === "string" &&
    Array.isArray(p.recovery_likelihoods) &&
    Array.isArray(p.portfolio_forecasts) &&
    Array.isArray(p.sla_forecasts) &&
    p.metrics != null
  );
}

export async function upsertPredictiveSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  snapshotType: string,
  payload: PredictiveSnapshot,
  generationMs: number
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PREDICTIVE_SNAPSHOT_TTL_MINUTES * 60 * 1000);

  const { error } = await supabase.from("decision_predictive_snapshots").upsert(
    {
      workspace_company_id: tenantCompanyId,
      snapshot_type: snapshotType,
      generated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      payload: payload as unknown as Record<string, unknown>,
      generation_ms: generationMs,
    },
    { onConflict: "workspace_company_id,snapshot_type" }
  );

  if (error) {
    throw new Error(`DE: upsertPredictiveSnapshot: ${error.message}`);
  }
}
