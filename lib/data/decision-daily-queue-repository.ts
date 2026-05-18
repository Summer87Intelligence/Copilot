/**
 * Decision Engine — Daily Queue Snapshot Repository (Phase 2B).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DailyOperationsQueue } from "@/lib/decision-engine/de-types";

const QUEUE_TTL_MINUTES = 60;

export type DailyQueueSnapshot = {
  id: string;
  workspace_company_id: string;
  generated_at: string;
  expires_at: string;
  payload: DailyOperationsQueue;
  generation_ms: number | null;
};

export async function readDailyQueueSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<DailyQueueSnapshot | null> {
  const { data, error } = await supabase
    .from("decision_daily_queue_snapshots")
    .select("id, workspace_company_id, generated_at, expires_at, payload, generation_ms")
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    workspace_company_id: data.workspace_company_id as string,
    generated_at: data.generated_at as string,
    expires_at: data.expires_at as string,
    payload: data.payload as DailyOperationsQueue,
    generation_ms: data.generation_ms as number | null,
  };
}

export function isDailyQueueSnapshotFresh(snapshot: DailyQueueSnapshot): boolean {
  return new Date(snapshot.expires_at) > new Date();
}

export async function upsertDailyQueueSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  queue: DailyOperationsQueue,
  generationMs: number
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUEUE_TTL_MINUTES * 60 * 1000);

  const { error } = await supabase.from("decision_daily_queue_snapshots").upsert(
    {
      workspace_company_id: tenantCompanyId,
      generated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      payload: queue as unknown as Record<string, unknown>,
      generation_ms: generationMs,
    },
    { onConflict: "workspace_company_id" }
  );

  if (error) {
    throw new Error(`DE: upsertDailyQueueSnapshot: ${error.message}`);
  }
}

export async function invalidateDailyQueueSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<void> {
  await supabase
    .from("decision_daily_queue_snapshots")
    .update({ expires_at: new Date().toISOString() })
    .eq("workspace_company_id", tenantCompanyId);
}
