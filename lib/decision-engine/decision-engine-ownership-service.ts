/**
 * Phase 4A — operaciones de ownership (servidor).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assignOperationalOwner,
  bulkAssignOperationalOwners,
  selectOperationalOwnershipStats,
  selectOperationalStatesForWorkspace,
  unassignOperationalOwner,
} from "@/lib/data/decision-operational-state-repository";
import type {
  DEOperationalStateRow,
  OperationalOwnershipStats,
} from "@/lib/decision-engine/de-types";
import {
  planAutoAssignments,
  type AutoAssignCandidate,
} from "@/lib/decision-engine/operational-ownership-engine";

export type AssignOwnerInput = {
  customerId: string;
  assignedUserId: string;
  assignedBy: string;
  note?: string | null;
};

export async function assignOperationalOwnerForTenant(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  input: AssignOwnerInput
) {
  return assignOperationalOwner(supabase, tenantCompanyId, {
    customerId: input.customerId,
    assignedUserId: input.assignedUserId,
    assignedBy: input.assignedBy,
    note: input.note,
  });
}

export async function unassignOperationalOwnerForTenant(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  customerId: string
) {
  return unassignOperationalOwner(supabase, tenantCompanyId, customerId);
}

export async function getOperationalOwnershipStatsForTenant(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<OperationalOwnershipStats> {
  return selectOperationalOwnershipStats(supabase, tenantCompanyId);
}

function isAutoAssignEligible(row: DEOperationalStateRow): boolean {
  if (row.assigned_user_id) return false;
  return (
    row.current_risk === "critical" ||
    row.machine_state === "critical" ||
    row.machine_state === "escalated" ||
    row.machine_state === "legal_review" ||
    row.breached_sla
  );
}

function rowToCandidate(row: DEOperationalStateRow): AutoAssignCandidate {
  return {
    customer_id: row.customer_id,
    current_risk: row.current_risk,
    machine_state: row.machine_state,
    breached_sla: row.breached_sla,
    existing_owner_id: row.assigned_user_id,
  };
}

export async function autoAssignOperationalOwnersForTenant(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: { customerIds?: string[]; assignedBy: string }
) {
  const [stats, states] = await Promise.all([
    selectOperationalOwnershipStats(supabase, tenantCompanyId),
    selectOperationalStatesForWorkspace(supabase, tenantCompanyId, 2000),
  ]);

  const idFilter = options.customerIds?.length
    ? new Set(options.customerIds)
    : null;

  const candidates = states
    .filter((row) => (idFilter ? idFilter.has(row.customer_id) : isAutoAssignEligible(row)))
    .filter((row) => !row.assigned_user_id)
    .map(rowToCandidate);

  if (stats.operators.length === 0) {
    return { assigned: [] as DEOperationalStateRow[], decisions: [] };
  }

  const decisions = planAutoAssignments(stats.operators, candidates);
  const assigned = await bulkAssignOperationalOwners(
    supabase,
    tenantCompanyId,
    decisions.map((d) => ({
      customerId: d.customer_id,
      assignedUserId: d.assigned_user_id,
      assignedBy: options.assignedBy,
      note: `auto:${d.reason}`,
    }))
  );

  return { assigned, decisions };
}
