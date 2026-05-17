/**
 * ZETA-16: Repository for zeta_daily_snapshots.
 *
 * Snapshots are idempotent: upsert by (workspace_company_id, snapshot_date).
 * Re-running the cron on the same day updates the existing row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailySnapshotInput, DailySnapshotRow } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

export async function upsertDailySnapshot(
  supabase: SupabaseClient,
  input: DailySnapshotInput
): Promise<DailySnapshotRow | null> {
  const { data, error } = await supabase
    .from("zeta_daily_snapshots")
    .upsert(
      {
        workspace_company_id: input.workspace_company_id,
        snapshot_date: input.snapshot_date,
        invoices_count: input.invoices_count ?? null,
        receipts_count: input.receipts_count ?? null,
        contacts_count: input.contacts_count ?? null,
        cuotas_count: input.cuotas_count ?? null,
        open_invoices_count: input.open_invoices_count ?? null,
        total_balance_pending: input.total_balance_pending ?? null,
        sync_runs_today: input.sync_runs_today ?? 0,
        sync_errors_today: input.sync_errors_today ?? 0,
        integrity_violations_open: input.integrity_violations_open ?? 0,
        critical_violations_open: input.critical_violations_open ?? 0,
        resync_jobs_completed: input.resync_jobs_completed ?? 0,
        resync_jobs_failed: input.resync_jobs_failed ?? 0,
        dead_letter_jobs: input.dead_letter_jobs ?? 0,
        metadata: input.metadata ?? null,
      },
      { onConflict: "workspace_company_id,snapshot_date" }
    )
    .select("*")
    .single();

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-daily-snapshot-repo", kind: "upsert_error", error: error.message })
    );
    return null;
  }
  return data as DailySnapshotRow;
}

export async function getDailySnapshots(
  supabase: SupabaseClient,
  workspaceId: string,
  days = 30
): Promise<DailySnapshotRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("zeta_daily_snapshots")
    .select("*")
    .eq("workspace_company_id", workspaceId)
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: false });
  return (data ?? []) as DailySnapshotRow[];
}

export async function getLatestSnapshot(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<DailySnapshotRow | null> {
  const { data } = await supabase
    .from("zeta_daily_snapshots")
    .select("*")
    .eq("workspace_company_id", workspaceId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as DailySnapshotRow | null) ?? null;
}

/** Returns the previous day's snapshot for delta comparison. */
export async function getPreviousSnapshot(
  supabase: SupabaseClient,
  workspaceId: string,
  currentDate: string // YYYY-MM-DD
): Promise<DailySnapshotRow | null> {
  const { data } = await supabase
    .from("zeta_daily_snapshots")
    .select("*")
    .eq("workspace_company_id", workspaceId)
    .lt("snapshot_date", currentDate)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as DailySnapshotRow | null) ?? null;
}
