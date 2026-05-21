import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";
import type {
  OicAuditSnapshotRow,
  OicAuditSnapshotInsert,
  OicSnapshotType,
  OicSnapshotSummary,
} from "@/lib/operacional/types";

const TABLE = "operational_audit_snapshots";

export async function selectLatestSnapshotByType(
  client: OperationalSupabase,
  workspaceCompanyId: string,
  snapshotType: OicSnapshotType
): Promise<OicAuditSnapshotRow | null> {
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("snapshot_type", snapshotType)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as OicAuditSnapshotRow | null;
}

export async function selectSnapshotsByDateRange(
  client: OperationalSupabase,
  workspaceCompanyId: string,
  snapshotType: OicSnapshotType,
  fromDate: string,
  toDate: string
): Promise<OicAuditSnapshotRow[]> {
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("snapshot_type", snapshotType)
    .gte("snapshot_date", fromDate)
    .lte("snapshot_date", toDate)
    .order("snapshot_date", { ascending: false });

  if (error) throw error;
  return (data ?? []) as OicAuditSnapshotRow[];
}

export async function selectRecentSnapshotSummaries(
  client: OperationalSupabase,
  workspaceCompanyId: string,
  limit = 50
): Promise<OicSnapshotSummary[]> {
  const { data, error } = await client
    .from(TABLE)
    .select(
      "id, snapshot_type, snapshot_date, score_value, severity, item_count, issue_count, triggered_by, computed_duration_ms, created_at"
    )
    .eq("workspace_company_id", workspaceCompanyId)
    .order("snapshot_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    snapshotType: row.snapshot_type as OicSnapshotType,
    snapshotDate: row.snapshot_date,
    scoreValue: row.score_value,
    severity: row.severity,
    itemCount: row.item_count,
    issueCount: row.issue_count,
    triggeredBy: row.triggered_by,
    computedDurationMs: row.computed_duration_ms,
    createdAt: row.created_at,
  }));
}

export async function upsertAuditSnapshot(
  client: OperationalSupabase,
  row: OicAuditSnapshotInsert
): Promise<OicAuditSnapshotRow> {
  const { data, error } = await client
    .from(TABLE)
    .upsert(row, {
      onConflict: "workspace_company_id,snapshot_type,snapshot_date",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as OicAuditSnapshotRow;
}

export async function selectAllSnapshotTypesForDate(
  client: OperationalSupabase,
  workspaceCompanyId: string,
  snapshotDate: string
): Promise<OicAuditSnapshotRow[]> {
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("snapshot_date", snapshotDate);

  if (error) throw error;
  return (data ?? []) as OicAuditSnapshotRow[];
}
