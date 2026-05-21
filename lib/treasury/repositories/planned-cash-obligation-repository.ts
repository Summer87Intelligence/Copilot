import type { SupabaseClient } from "@supabase/supabase-js";

import { mapPlannedCashObligationRow } from "@/lib/treasury/treasury-mappers";
import { eqTreasuryWorkspace } from "@/lib/treasury/treasury-db-helpers";
import type {
  PlannedCashObligation,
  PlannedObligationListFilters,
} from "@/lib/treasury/treasury-types";

const TABLE = "planned_cash_obligations" as const;

export async function plannedCashObligationRepositoryList(
  supabase: SupabaseClient,
  workspaceId: string,
  filters: PlannedObligationListFilters = {},
  limit = 200
): Promise<{ rows: PlannedCashObligation[]; error: { message?: string } | null }> {
  let qb = eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.currencyCode) qb = qb.eq("currency_code", filters.currencyCode);
  if (filters.accountId) qb = qb.eq("expected_account_id", filters.accountId);
  if (filters.fromDate) qb = qb.gte("due_date", filters.fromDate);
  if (filters.toDate) qb = qb.lte("due_date", filters.toDate);
  if (filters.status) qb = qb.eq("status", filters.status);
  if (filters.obligationType) qb = qb.eq("obligation_type", filters.obligationType);
  if (filters.priority) qb = qb.eq("priority", filters.priority);
  if (filters.direction) qb = qb.eq("direction", filters.direction);

  const { data, error } = await qb;
  if (error) return { rows: [], error };
  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) =>
    mapPlannedCashObligationRow(row)
  );
  return { rows, error: null };
}

export async function plannedCashObligationRepositoryListByRecurringTemplate(
  supabase: SupabaseClient,
  workspaceId: string,
  templateId: string,
  limit = 500
): Promise<{ rows: PlannedCashObligation[]; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .eq("recurring_template_id", templateId.trim())
    .order("due_date", { ascending: true })
    .limit(limit);
  if (error) return { rows: [], error };
  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) =>
    mapPlannedCashObligationRow(row)
  );
  return { rows, error: null };
}

export async function plannedCashObligationRepositoryFindByInstanceKey(
  supabase: SupabaseClient,
  workspaceId: string,
  instanceKey: string
): Promise<{ row: PlannedCashObligation | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .eq("recurring_instance_key", instanceKey.trim())
    .maybeSingle();
  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return { row: mapPlannedCashObligationRow(data as Record<string, unknown>), error: null };
}

export async function plannedCashObligationRepositoryGetById(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<{ row: PlannedCashObligation | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .eq("id", id.trim())
    .maybeSingle();
  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return { row: mapPlannedCashObligationRow(data as Record<string, unknown>), error: null };
}

export async function plannedCashObligationRepositoryInsert(
  supabase: SupabaseClient,
  workspaceId: string,
  payload: Record<string, unknown>
): Promise<{ row: PlannedCashObligation | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, workspace_id: workspaceId })
    .select("*")
    .single();
  if (error) return { row: null, error };
  return { row: mapPlannedCashObligationRow(data as Record<string, unknown>), error: null };
}

export async function plannedCashObligationRepositoryUpdate(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string,
  payload: Record<string, unknown>
): Promise<{ row: PlannedCashObligation | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).update(payload), workspaceId)
    .eq("id", id.trim())
    .select("*")
    .maybeSingle();
  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return { row: mapPlannedCashObligationRow(data as Record<string, unknown>), error: null };
}

export async function plannedCashObligationRepositoryDelete(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<{ deleted: boolean; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).delete(), workspaceId)
    .eq("id", id.trim())
    .select("id")
    .maybeSingle();
  if (error) return { deleted: false, error };
  return { deleted: data != null, error: null };
}
