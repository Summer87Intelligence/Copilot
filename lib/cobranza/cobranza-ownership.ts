import type { SupabaseClient } from "@supabase/supabase-js";

import type { CobranzaClientRow, OwnershipEntry } from "@/lib/copilot-cobranza-summary";

export type { OwnershipEntry };
export type OwnershipMap = Map<string, OwnershipEntry>;

export type ResponsableFilter = "all" | "me" | "unassigned";

export function applyResponsableFilter(
  rows: CobranzaClientRow[],
  filter: ResponsableFilter,
  currentUserId: string | null
): CobranzaClientRow[] {
  if (filter === "me") {
    if (!currentUserId) return rows;
    return rows.filter((r) => r.assignedUserId === currentUserId);
  }
  if (filter === "unassigned") {
    return rows.filter((r) => r.assignedUserId === null);
  }
  return rows;
}

/**
 * Batch-fetches ownership from decision_operational_state + app_users.
 * No N+1: one query per table regardless of how many companyIds.
 */
export async function fetchCobranzaOwnershipBatch(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  companyIds: string[]
): Promise<OwnershipMap> {
  if (companyIds.length === 0) return new Map();

  const { data: stateRows } = await supabase
    .from("decision_operational_state")
    .select("customer_id, assigned_user_id")
    .eq("workspace_company_id", tenantCompanyId)
    .in("customer_id", companyIds)
    .not("assigned_user_id", "is", null);

  const rows = (stateRows ?? []) as Array<{ customer_id: string; assigned_user_id: string }>;
  if (rows.length === 0) return new Map();

  const userIds = [...new Set(rows.map((r) => r.assigned_user_id))];
  const { data: userRows } = await supabase
    .from("app_users")
    .select("id, full_name, email")
    .in("id", userIds);

  const userMap = new Map<string, { name: string; email: string }>();
  for (const u of (userRows ?? []) as Array<{ id: string; full_name: string; email: string }>) {
    userMap.set(u.id, {
      name: u.full_name?.trim() || u.email?.trim() || "Usuario",
      email: u.email ?? "",
    });
  }

  const out: OwnershipMap = new Map();
  for (const row of rows) {
    const user = userMap.get(row.assigned_user_id);
    if (user) {
      out.set(row.customer_id, {
        userId: row.assigned_user_id,
        name: user.name,
        email: user.email,
      });
    }
  }
  return out;
}

export function filterByResponsableMe(
  rows: CobranzaClientRow[],
  currentUserId: string
): CobranzaClientRow[] {
  return rows.filter((r) => r.assignedUserId === currentUserId);
}
