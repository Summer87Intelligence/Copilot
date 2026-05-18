/**
 * Phase 4B — carga datos para analytics operacional (sin tocar hydration/ownership engine).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { selectPendingFollowUpsForWorkspace } from "@/lib/data/decision-follow-up-repository";
import { selectOperationalStatesForWorkspace } from "@/lib/data/decision-operational-state-repository";
import {
  loadRecentActionsOnly,
} from "@/lib/data/decision-engine-data-loader";
import type { OperatorAnalyticsInput } from "@/lib/decision-engine/de-types";

async function loadWorkspaceUserNames(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, full_name, email")
    .eq("company_id", tenantCompanyId);

  if (error) {
    console.warn("DE analytics: loadWorkspaceUserNames (non-fatal):", error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
    map.set(row.id, row.full_name?.trim() || row.email?.trim() || "Operador");
  }
  return map;
}

export async function loadOperatorAnalyticsInput(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<OperatorAnalyticsInput> {
  const [operationalStates, pendingFollowUps, recentActions, operatorNames] = await Promise.all([
    selectOperationalStatesForWorkspace(supabase, tenantCompanyId, 2000),
    selectPendingFollowUpsForWorkspace(supabase, tenantCompanyId),
    loadRecentActionsOnly(supabase, tenantCompanyId),
    loadWorkspaceUserNames(supabase, tenantCompanyId),
  ]);

  return {
    operationalStates,
    pendingFollowUps,
    recentActions,
    operatorNames,
    loadedAt: new Date().toISOString(),
  };
}
