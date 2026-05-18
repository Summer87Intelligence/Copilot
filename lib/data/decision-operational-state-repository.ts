/**
 * Decision Engine — Operational State Repository.
 * Persistencia en decision_operational_state (1 fila por workspace + cliente).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  machineStateToFollowUpState,
  normalizeMachineState,
} from "@/lib/decision-engine/operational-state-bridge";
import type {
  DEOperationalStateRow,
  OperationalMachineState,
  OperationalOwnershipStats,
  RiskLevel,
} from "@/lib/decision-engine/de-types";

const STATE_SELECT =
  "customer_id, current_risk, current_priority, operational_state, previous_state, transitioned_at, transition_reason, breached_sla, next_follow_up_at, last_contact_at, active_promise, escalated, updated_at, assigned_user_id, assigned_at, assigned_by, assignment_note" as const;

const CRITICAL_MACHINE_STATES = new Set<OperationalMachineState>([
  "critical",
  "escalated",
  "legal_review",
]);

const RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high", "critical"]);

const MACHINE_STATES = new Set<OperationalMachineState>([
  "new_risk",
  "monitoring",
  "follow_up",
  "payment_promised",
  "escalated",
  "critical",
  "recovered",
  "paused",
  "legal_review",
]);

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asRiskLevel(v: unknown): RiskLevel {
  const s = str(v);
  return RISK_LEVELS.has(s as RiskLevel) ? (s as RiskLevel) : "medium";
}

function asMachineState(v: unknown): OperationalMachineState {
  const normalized = normalizeMachineState(str(v) || null);
  return MACHINE_STATES.has(normalized) ? normalized : "monitoring";
}

export function mapOperationalStateRow(row: Record<string, unknown>): DEOperationalStateRow {
  const machine_state = asMachineState(row["operational_state"]);
  return {
    customer_id: str(row["customer_id"]),
    current_risk: asRiskLevel(row["current_risk"]),
    machine_state,
    legacy_follow_up_state: machineStateToFollowUpState(machine_state),
    previous_state: row["previous_state"] != null ? asMachineState(row["previous_state"]) : null,
    transitioned_at: strOrNull(row["transitioned_at"]),
    transition_reason: strOrNull(row["transition_reason"]),
    breached_sla: row["breached_sla"] === true,
    next_follow_up_at: strOrNull(row["next_follow_up_at"]),
    last_contact_at: strOrNull(row["last_contact_at"]),
    active_promise: row["active_promise"] === true,
    escalated: row["escalated"] === true,
    updated_at: str(row["updated_at"]),
    assigned_user_id: strOrNull(row["assigned_user_id"]),
    assigned_at: strOrNull(row["assigned_at"]),
    assigned_by: strOrNull(row["assigned_by"]),
    assignment_note: strOrNull(row["assignment_note"]),
  };
}

export type AssignOperationalOwnerInput = {
  customerId: string;
  assignedUserId: string;
  assignedBy: string;
  note?: string | null;
};

export async function ensureOperationalStateRowForCustomer(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  customerId: string
): Promise<DEOperationalStateRow> {
  const existing = await selectOperationalStateByCustomer(supabase, tenantCompanyId, customerId);
  if (existing) return existing;

  const now = new Date().toISOString();
  return upsertOperationalState(supabase, tenantCompanyId, {
    customerId,
    currentRisk: "medium",
    currentPriority: "medium",
    machineState: "monitoring",
    previousState: null,
    transitionedAt: now,
    transitionReason: "ownership_bootstrap",
    breachedSla: false,
    nextFollowUpAt: null,
    lastContactAt: null,
    activePromise: false,
    escalated: false,
  });
}

export async function assignOperationalOwner(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  input: AssignOperationalOwnerInput
): Promise<DEOperationalStateRow> {
  await ensureOperationalStateRowForCustomer(supabase, tenantCompanyId, input.customerId);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("decision_operational_state")
    .update({
      assigned_user_id: input.assignedUserId,
      assigned_at: now,
      assigned_by: input.assignedBy,
      assignment_note: input.note?.trim() || null,
      updated_at: now,
    })
    .eq("workspace_company_id", tenantCompanyId)
    .eq("customer_id", input.customerId)
    .select(STATE_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`DE: assignOperationalOwner: ${error?.message ?? "no row"}`);
  }
  return mapOperationalStateRow(data as Record<string, unknown>);
}

export async function unassignOperationalOwner(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  customerId: string
): Promise<DEOperationalStateRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("decision_operational_state")
    .update({
      assigned_user_id: null,
      assigned_at: null,
      assigned_by: null,
      assignment_note: null,
      updated_at: now,
    })
    .eq("workspace_company_id", tenantCompanyId)
    .eq("customer_id", customerId)
    .select(STATE_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(`DE: unassignOperationalOwner: ${error.message}`);
  }
  if (!data) return null;
  return mapOperationalStateRow(data as Record<string, unknown>);
}

export async function bulkAssignOperationalOwners(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  assignments: AssignOperationalOwnerInput[]
): Promise<DEOperationalStateRow[]> {
  const results: DEOperationalStateRow[] = [];
  for (const item of assignments) {
    results.push(await assignOperationalOwner(supabase, tenantCompanyId, item));
  }
  return results;
}

type AppUserNameRow = { id: string; full_name: string | null; email: string | null };

async function loadWorkspaceUserNames(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, full_name, email")
    .eq("company_id", tenantCompanyId);

  if (error) {
    console.warn("DE: loadWorkspaceUserNames (non-fatal):", error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of (data ?? []) as AppUserNameRow[]) {
    const name = row.full_name?.trim() || row.email?.trim() || "Usuario";
    map.set(row.id, name);
  }
  return map;
}

function isCriticalAssignment(row: DEOperationalStateRow): boolean {
  return (
    row.current_risk === "critical" ||
    CRITICAL_MACHINE_STATES.has(row.machine_state) ||
    row.breached_sla
  );
}

export async function selectOperationalOwnershipStats(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<OperationalOwnershipStats> {
  const [states, userNames] = await Promise.all([
    selectOperationalStatesForWorkspace(supabase, tenantCompanyId, 2000),
    loadWorkspaceUserNames(supabase, tenantCompanyId),
  ]);

  const operatorMap = new Map<
    string,
    { total: number; critical: number; overdue: number }
  >();

  let total_assigned = 0;
  let overdue_assigned = 0;
  let unassigned_critical = 0;

  for (const row of states) {
    const critical = isCriticalAssignment(row);
    if (!row.assigned_user_id && critical) {
      unassigned_critical += 1;
    }
    if (!row.assigned_user_id) continue;

    total_assigned += 1;
    if (row.breached_sla) overdue_assigned += 1;

    const bucket = operatorMap.get(row.assigned_user_id) ?? {
      total: 0,
      critical: 0,
      overdue: 0,
    };
    bucket.total += 1;
    if (critical) bucket.critical += 1;
    if (row.breached_sla) bucket.overdue += 1;
    operatorMap.set(row.assigned_user_id, bucket);
  }

  const operators = [...operatorMap.entries()]
    .map(([user_id, stats]) => ({
      user_id,
      display_name: userNames.get(user_id) ?? "Operador",
      total_assigned: stats.total,
      critical_assigned: stats.critical,
      overdue_assigned: stats.overdue,
    }))
    .sort((a, b) => b.critical_assigned - a.critical_assigned || b.total_assigned - a.total_assigned);

  const maxCritical = Math.max(0, ...operators.map((o) => o.critical_assigned));
  const high_workload = maxCritical >= 5;

  return {
    total_assigned,
    overdue_assigned,
    unassigned_critical,
    high_workload,
    operators,
  };
}

export async function resolveAssigneeDisplayNames(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  userIds: string[]
): Promise<Map<string, string>> {
  const all = await loadWorkspaceUserNames(supabase, tenantCompanyId);
  const out = new Map<string, string>();
  for (const id of userIds) {
    if (id && all.has(id)) out.set(id, all.get(id)!);
  }
  return out;
}

export type UpsertOperationalStateInput = {
  customerId: string;
  currentRisk: RiskLevel;
  currentPriority: RiskLevel;
  machineState: OperationalMachineState;
  previousState: OperationalMachineState | null;
  transitionedAt: string;
  transitionReason: string;
  breachedSla: boolean;
  nextFollowUpAt: string | null;
  lastContactAt: string | null;
  activePromise: boolean;
  escalated: boolean;
};

export async function selectOperationalStateByCustomer(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  customerId: string
): Promise<DEOperationalStateRow | null> {
  const { data, error } = await supabase
    .from("decision_operational_state")
    .select(STATE_SELECT)
    .eq("workspace_company_id", tenantCompanyId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error || !data) return null;
  return mapOperationalStateRow(data as Record<string, unknown>);
}

export async function selectOperationalStatesForWorkspace(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  limit = 500
): Promise<DEOperationalStateRow[]> {
  const { data, error } = await supabase
    .from("decision_operational_state")
    .select(STATE_SELECT)
    .eq("workspace_company_id", tenantCompanyId)
    .order("next_follow_up_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.warn("DE: selectOperationalStatesForWorkspace (non-fatal):", error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapOperationalStateRow);
}

export async function upsertOperationalState(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  input: UpsertOperationalStateInput
): Promise<DEOperationalStateRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("decision_operational_state")
    .upsert(
      {
        workspace_company_id: tenantCompanyId,
        customer_id: input.customerId,
        current_risk: input.currentRisk,
        current_priority: input.currentPriority,
        operational_state: input.machineState,
        previous_state: input.previousState,
        transitioned_at: input.transitionedAt,
        transition_reason: input.transitionReason,
        breached_sla: input.breachedSla,
        next_follow_up_at: input.nextFollowUpAt,
        last_contact_at: input.lastContactAt,
        active_promise: input.activePromise,
        escalated: input.escalated,
        updated_at: now,
      },
      { onConflict: "workspace_company_id,customer_id" }
    )
    .select(STATE_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`DE: upsertOperationalState: ${error?.message ?? "no row returned"}`);
  }

  return mapOperationalStateRow(data as Record<string, unknown>);
}
