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
  RiskLevel,
} from "@/lib/decision-engine/de-types";

const STATE_SELECT =
  "customer_id, current_risk, current_priority, operational_state, previous_state, transitioned_at, transition_reason, breached_sla, next_follow_up_at, last_contact_at, active_promise, escalated, updated_at" as const;

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
  };
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
