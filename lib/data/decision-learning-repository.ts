/**
 * Phase 5D — Decision Learning Repository.
 * Read/write para decision_learning_outcomes y decision_learning_snapshots.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DetectedOutcome, LearningOutcome, StrategicLearningSnapshot } from "@/lib/decision-engine/learning/learning-types";

export const STRATEGIC_LEARNING_TTL_MINUTES = 60;
export const STRATEGIC_LEARNING_SNAPSHOT_TYPE = "strategic_learning_v1";

export type LearningSnapshotRow = {
  id: string;
  workspace_company_id: string;
  snapshot_type: string;
  generated_at: string;
  expires_at: string;
  payload: StrategicLearningSnapshot;
  source_snapshot_ids: Record<string, unknown>;
  generation_ms: number | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

export async function readLearningOutcomes(
  supabase: SupabaseClient,
  workspaceCompanyId: string
): Promise<LearningOutcome[]> {
  const { data, error } = await supabase
    .from("decision_learning_outcomes")
    .select(
      "id, workspace_company_id, customer_id, source_type, source_id, outcome_type, outcome_amount, currency_code, observed_at, metadata, created_at"
    )
    .eq("workspace_company_id", workspaceCompanyId)
    .order("observed_at", { ascending: false })
    .limit(2000);

  if (error || !data) return [];

  return data.map((row) => ({
    id:                   row.id as string,
    workspace_company_id: row.workspace_company_id as string,
    customer_id:          row.customer_id as string,
    source_type:          row.source_type as LearningOutcome["source_type"],
    source_id:            row.source_id as string,
    outcome_type:         row.outcome_type as LearningOutcome["outcome_type"],
    outcome_amount:       row.outcome_amount as number | null,
    currency_code:        row.currency_code as string | null,
    observed_at:          row.observed_at as string,
    metadata:             (row.metadata as Record<string, unknown>) ?? {},
    created_at:           row.created_at as string,
  }));
}

export async function insertLearningOutcomes(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  outcomes: DetectedOutcome[]
): Promise<{ inserted: number; duplicates: number }> {
  if (outcomes.length === 0) return { inserted: 0, duplicates: 0 };

  const rows = outcomes.map((o) => ({
    workspace_company_id: workspaceCompanyId,
    customer_id:          o.customer_id,
    source_type:          o.source_type,
    source_id:            o.source_id,
    outcome_type:         o.outcome_type,
    outcome_amount:       o.outcome_amount,
    currency_code:        o.currency_code,
    observed_at:          o.observed_at,
    metadata:             o.metadata,
    dedupe_key:           o.dedupe_key,
  }));

  const { error, data } = await supabase
    .from("decision_learning_outcomes")
    .upsert(rows, {
      onConflict: "workspace_company_id,dedupe_key",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) throw new Error(`DE: insertLearningOutcomes: ${error.message}`);

  const inserted = data?.length ?? 0;
  return { inserted, duplicates: outcomes.length - inserted };
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export async function readLearningSnapshot(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  snapshotType: string = STRATEGIC_LEARNING_SNAPSHOT_TYPE
): Promise<LearningSnapshotRow | null> {
  const { data, error } = await supabase
    .from("decision_learning_snapshots")
    .select(
      "id, workspace_company_id, snapshot_type, generated_at, expires_at, payload, source_snapshot_ids, generation_ms, created_at"
    )
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("snapshot_type", snapshotType)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id:                   data.id as string,
    workspace_company_id: data.workspace_company_id as string,
    snapshot_type:        data.snapshot_type as string,
    generated_at:         data.generated_at as string,
    expires_at:           data.expires_at as string,
    payload:              data.payload as StrategicLearningSnapshot,
    source_snapshot_ids:  (data.source_snapshot_ids as Record<string, unknown>) ?? {},
    generation_ms:        data.generation_ms as number | null,
    created_at:           data.created_at as string,
  };
}

export function isLearningSnapshotFresh(row: LearningSnapshotRow): boolean {
  return new Date(row.expires_at) > new Date();
}

export async function upsertLearningSnapshot(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  snapshot: StrategicLearningSnapshot,
  snapshotType: string = STRATEGIC_LEARNING_SNAPSHOT_TYPE,
  ttlMinutes: number = STRATEGIC_LEARNING_TTL_MINUTES
): Promise<void> {
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const { error } = await supabase.from("decision_learning_snapshots").upsert(
    {
      workspace_company_id: workspaceCompanyId,
      snapshot_type:        snapshotType,
      generated_at:         now.toISOString(),
      expires_at:           expiresAt.toISOString(),
      payload:              snapshot as unknown as Record<string, unknown>,
      source_snapshot_ids:  snapshot.source_snapshot_ids as unknown as Record<string, unknown>,
      generation_ms:        snapshot.metrics.generation_ms,
    },
    { onConflict: "workspace_company_id,snapshot_type" }
  );

  if (error) {
    throw new Error(`DE: upsertLearningSnapshot: ${error.message}`);
  }
}
