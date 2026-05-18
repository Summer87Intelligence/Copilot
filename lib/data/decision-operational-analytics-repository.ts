/**
 * Phase 4B — Operational Analytics Snapshot Repository.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OperationalAnalyticsSnapshot } from "@/lib/decision-engine/de-types";

export const ANALYTICS_TTL_MINUTES = 15;

export type OperationalAnalyticsSnapshotRow = {
  id: string;
  workspace_company_id: string;
  generated_at: string;
  expires_at: string;
  payload: OperationalAnalyticsSnapshot;
  generation_ms: number | null;
};

export async function readOperationalAnalyticsSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<OperationalAnalyticsSnapshotRow | null> {
  const { data, error } = await supabase
    .from("decision_operational_analytics_snapshots")
    .select("id, workspace_company_id, generated_at, expires_at, payload, generation_ms")
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    workspace_company_id: data.workspace_company_id as string,
    generated_at: data.generated_at as string,
    expires_at: data.expires_at as string,
    payload: data.payload as OperationalAnalyticsSnapshot,
    generation_ms: data.generation_ms as number | null,
  };
}

export function isOperationalAnalyticsSnapshotFresh(
  snapshot: OperationalAnalyticsSnapshotRow
): boolean {
  return new Date(snapshot.expires_at) > new Date();
}

export function isOperationalAnalyticsPayloadCurrent(
  payload: unknown
): payload is OperationalAnalyticsSnapshot {
  if (payload == null || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.generated_at === "string" &&
    p.global != null &&
    typeof p.global === "object" &&
    Array.isArray(p.operators) &&
    p.sla != null &&
    typeof p.sla === "object"
  );
}

export async function upsertOperationalAnalyticsSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  snapshot: OperationalAnalyticsSnapshot,
  generationMs: number
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ANALYTICS_TTL_MINUTES * 60 * 1000);

  const { error } = await supabase.from("decision_operational_analytics_snapshots").upsert(
    {
      workspace_company_id: tenantCompanyId,
      generated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      payload: snapshot as unknown as Record<string, unknown>,
      generation_ms: generationMs,
    },
    { onConflict: "workspace_company_id" }
  );

  if (error) {
    throw new Error(`DE: upsertOperationalAnalyticsSnapshot: ${error.message}`);
  }
}

export async function invalidateOperationalAnalyticsSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<void> {
  await supabase
    .from("decision_operational_analytics_snapshots")
    .update({ expires_at: new Date().toISOString() })
    .eq("workspace_company_id", tenantCompanyId);
}
