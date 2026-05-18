/**
 * Decision Engine — Operational State Repository.
 * Persistencia en decision_operational_state (1 fila por workspace + cliente).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DEOperationalStateRow,
  FollowUpState,
  RiskLevel,
} from "@/lib/decision-engine/de-types";

const STATE_SELECT =
  "customer_id, current_risk, current_priority, operational_state, next_follow_up_at, last_contact_at, active_promise, escalated, updated_at" as const;

const RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high", "critical"]);
const FOLLOW_UP_STATES = new Set<FollowUpState>([
  "awaiting_promise",
  "retry_call",
  "retry_email",
  "payment_cleared",
  "escalated_active",
  "overdue_no_contact",
  "monitor",
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

function asFollowUpState(v: unknown): FollowUpState {
  const s = str(v);
  return FOLLOW_UP_STATES.has(s as FollowUpState) ? (s as FollowUpState) : "monitor";
}

export function mapOperationalStateRow(row: Record<string, unknown>): DEOperationalStateRow {
  return {
    customer_id: str(row["customer_id"]),
    current_risk: asRiskLevel(row["current_risk"]),
    operational_state: asFollowUpState(row["operational_state"]),
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
  operationalState: FollowUpState;
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
        operational_state: input.operationalState,
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
