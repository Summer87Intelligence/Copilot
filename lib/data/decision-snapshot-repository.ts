/**
 * Decision Engine — Snapshot Repository.
 * Lee y escribe en decision_snapshots y portfolio_score_history.
 * Sin lógica de negocio: solo persistencia.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyBriefing, PortfolioScore } from "@/lib/decision-engine/de-types";

const SNAPSHOT_TYPE_BRIEFING = "daily_briefing";
const BRIEFING_TTL_MINUTES = 60;

// ---------------------------------------------------------------------------
// decision_snapshots
// ---------------------------------------------------------------------------

export type DecisionSnapshot = {
  id: string;
  workspace_company_id: string;
  snapshot_type: string;
  generated_at: string;
  expires_at: string;
  payload: DailyBriefing;
  generation_ms: number | null;
};

export async function readBriefingSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<DecisionSnapshot | null> {
  const { data, error } = await supabase
    .from("decision_snapshots")
    .select("id, workspace_company_id, snapshot_type, generated_at, expires_at, payload, generation_ms")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("snapshot_type", SNAPSHOT_TYPE_BRIEFING)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id:                   data.id as string,
    workspace_company_id: data.workspace_company_id as string,
    snapshot_type:        data.snapshot_type as string,
    generated_at:         data.generated_at as string,
    expires_at:           data.expires_at as string,
    payload:              data.payload as DailyBriefing,
    generation_ms:        data.generation_ms as number | null,
  };
}

export function isBriefingSnapshotFresh(snapshot: DecisionSnapshot): boolean {
  return new Date(snapshot.expires_at) > new Date();
}

export async function upsertBriefingSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  briefing: DailyBriefing,
  generationMs: number
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + BRIEFING_TTL_MINUTES * 60 * 1000);

  await supabase
    .from("decision_snapshots")
    .upsert(
      {
        workspace_company_id: tenantCompanyId,
        snapshot_type:        SNAPSHOT_TYPE_BRIEFING,
        generated_at:         now.toISOString(),
        expires_at:           expiresAt.toISOString(),
        payload:              briefing as unknown as Record<string, unknown>,
        generation_ms:        generationMs,
      },
      { onConflict: "workspace_company_id,snapshot_type" }
    );
}

export async function invalidateBriefingSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<void> {
  await supabase
    .from("decision_snapshots")
    .update({ expires_at: new Date().toISOString() })
    .eq("workspace_company_id", tenantCompanyId)
    .eq("snapshot_type", SNAPSHOT_TYPE_BRIEFING);
}

// ---------------------------------------------------------------------------
// portfolio_score_history
// ---------------------------------------------------------------------------

export async function upsertPortfolioScoreHistory(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  score: PortfolioScore,
  scoredAt: string
): Promise<void> {
  await supabase
    .from("portfolio_score_history")
    .upsert(
      {
        workspace_company_id: tenantCompanyId,
        scored_at:            scoredAt,
        score:                score.score,
        band:                 score.band,
        effectiveness_score:  score.effectiveness_score,
        aging_score:          score.aging_score,
        concentration_score:  score.concentration_score,
        total_pending_uyu:    score.total_pending_uyu,
        total_pending_usd:    score.total_pending_usd,
        active_debtors_count: score.active_debtors_count,
        metadata:             { effectiveness_pct: score.effectiveness_pct, over90_pct: score.over90_pct },
      },
      { ignoreDuplicates: true }
    );
}

export async function selectPortfolioScoreHistory(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  limit = 30
) {
  return supabase
    .from("portfolio_score_history")
    .select("scored_at, score, band, effectiveness_score, aging_score, concentration_score, total_pending_uyu, total_pending_usd, active_debtors_count, metadata")
    .eq("workspace_company_id", tenantCompanyId)
    .order("scored_at", { ascending: false })
    .limit(limit);
}
