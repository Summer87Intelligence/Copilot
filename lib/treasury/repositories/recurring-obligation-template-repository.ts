import type { SupabaseClient } from "@supabase/supabase-js";

import { mapPlannedCashObligationTemplateRow } from "@/lib/treasury/treasury-mappers";
import { eqTreasuryWorkspace } from "@/lib/treasury/treasury-db-helpers";
import type { PlannedCashObligationTemplate } from "@/lib/treasury/treasury-recurring-obligations";

const TABLE = "planned_cash_obligation_templates" as const;

export async function recurringObligationTemplateRepositoryList(
  supabase: SupabaseClient,
  workspaceId: string,
  activeOnly = false,
  limit = 200
): Promise<{ rows: PlannedCashObligationTemplate[]; error: { message?: string } | null }> {
  let qb = eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .order("next_occurrence_date", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (activeOnly) qb = qb.eq("active", true);
  const { data, error } = await qb;
  if (error) return { rows: [], error };
  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) =>
    mapPlannedCashObligationTemplateRow(row)
  );
  return { rows, error: null };
}

export async function recurringObligationTemplateRepositoryGetById(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string
): Promise<{ row: PlannedCashObligationTemplate | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).select("*"), workspaceId)
    .eq("id", id.trim())
    .maybeSingle();
  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return {
    row: mapPlannedCashObligationTemplateRow(data as Record<string, unknown>),
    error: null,
  };
}

export async function recurringObligationTemplateRepositoryInsert(
  supabase: SupabaseClient,
  workspaceId: string,
  payload: Record<string, unknown>
): Promise<{ row: PlannedCashObligationTemplate | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, workspace_id: workspaceId })
    .select("*")
    .single();
  if (error) return { row: null, error };
  return {
    row: mapPlannedCashObligationTemplateRow(data as Record<string, unknown>),
    error: null,
  };
}

export async function recurringObligationTemplateRepositoryUpdate(
  supabase: SupabaseClient,
  workspaceId: string,
  id: string,
  payload: Record<string, unknown>
): Promise<{ row: PlannedCashObligationTemplate | null; error: { message?: string } | null }> {
  const { data, error } = await eqTreasuryWorkspace(supabase.from(TABLE).update(payload), workspaceId)
    .eq("id", id.trim())
    .select("*")
    .maybeSingle();
  if (error) return { row: null, error };
  if (!data) return { row: null, error: null };
  return {
    row: mapPlannedCashObligationTemplateRow(data as Record<string, unknown>),
    error: null,
  };
}
