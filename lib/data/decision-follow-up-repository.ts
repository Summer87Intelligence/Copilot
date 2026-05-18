/**
 * Decision Engine — Follow-up Repository.
 * Persistencia en decision_follow_ups con deduplicación de pendientes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DEFollowUpRow, RiskLevel } from "@/lib/decision-engine/de-types";

const FOLLOW_UP_SELECT =
  "id, customer_id, status, scheduled_for, reason, source_action_id, priority" as const;

const ACTIVE_STATUSES = ["pending", "in_progress"] as const;
const PRIORITY_LEVELS = new Set<DEFollowUpRow["priority"]>(["low", "medium", "high", "critical"]);
const STATUS_VALUES = new Set<DEFollowUpRow["status"]>([
  "pending",
  "in_progress",
  "completed",
  "snoozed",
  "cancelled",
]);

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asPriority(v: unknown): DEFollowUpRow["priority"] {
  const s = str(v);
  return PRIORITY_LEVELS.has(s as DEFollowUpRow["priority"])
    ? (s as DEFollowUpRow["priority"])
    : "medium";
}

function asStatus(v: unknown): DEFollowUpRow["status"] {
  const s = str(v);
  return STATUS_VALUES.has(s as DEFollowUpRow["status"])
    ? (s as DEFollowUpRow["status"])
    : "pending";
}

export function mapFollowUpRow(row: Record<string, unknown>): DEFollowUpRow {
  return {
    id: str(row["id"]),
    customer_id: str(row["customer_id"]),
    status: asStatus(row["status"]),
    scheduled_for: str(row["scheduled_for"]),
    reason: strOrNull(row["reason"]),
    source_action_id: strOrNull(row["source_action_id"]),
    priority: asPriority(row["priority"]),
  };
}

export function scheduleDateToTimestamptz(dateOrIso: string): string {
  if (dateOrIso.includes("T")) return dateOrIso;
  return `${dateOrIso}T12:00:00.000Z`;
}

export function scheduledForDayKey(iso: string): string {
  return iso.split("T")[0] ?? iso;
}

export type CreateFollowUpInput = {
  customerId: string;
  scheduledFor: string;
  reason: string | null;
  sourceActionId: string | null;
  priority: RiskLevel;
};

export async function selectPendingFollowUpsForWorkspace(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  limit = 200
): Promise<DEFollowUpRow[]> {
  const { data, error } = await supabase
    .from("decision_follow_ups")
    .select(FOLLOW_UP_SELECT)
    .eq("workspace_company_id", tenantCompanyId)
    .in("status", [...ACTIVE_STATUSES])
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (error) {
    console.warn("DE: selectPendingFollowUpsForWorkspace (non-fatal):", error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapFollowUpRow);
}

export async function findActiveFollowUpForCustomerOnDay(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  customerId: string,
  scheduledDay: string
): Promise<DEFollowUpRow | null> {
  const dayStart = `${scheduledDay}T00:00:00.000Z`;
  const dayEnd = `${scheduledDay}T23:59:59.999Z`;

  const { data, error } = await supabase
    .from("decision_follow_ups")
    .select(FOLLOW_UP_SELECT)
    .eq("workspace_company_id", tenantCompanyId)
    .eq("customer_id", customerId)
    .in("status", [...ACTIVE_STATUSES])
    .gte("scheduled_for", dayStart)
    .lte("scheduled_for", dayEnd)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapFollowUpRow(data as Record<string, unknown>);
}

/**
 * Crea un follow-up pendiente solo si no existe otro activo el mismo día programado.
 */
export async function createFollowUpDeduped(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  input: CreateFollowUpInput
): Promise<DEFollowUpRow> {
  const scheduledFor = scheduleDateToTimestamptz(input.scheduledFor);
  const dayKey = scheduledForDayKey(scheduledFor);

  const existing = await findActiveFollowUpForCustomerOnDay(
    supabase,
    tenantCompanyId,
    input.customerId,
    dayKey
  );
  if (existing) {
    if (input.sourceActionId && existing.source_action_id !== input.sourceActionId) {
      const { data, error } = await supabase
        .from("decision_follow_ups")
        .update({ source_action_id: input.sourceActionId, reason: input.reason ?? existing.reason })
        .eq("id", existing.id)
        .eq("workspace_company_id", tenantCompanyId)
        .select(FOLLOW_UP_SELECT)
        .single();

      if (!error && data) {
        return mapFollowUpRow(data as Record<string, unknown>);
      }
    }
    return existing;
  }

  const { data, error } = await supabase
    .from("decision_follow_ups")
    .insert({
      workspace_company_id: tenantCompanyId,
      customer_id: input.customerId,
      status: "pending",
      scheduled_for: scheduledFor,
      reason: input.reason,
      source_action_id: input.sourceActionId,
      priority: input.priority,
    })
    .select(FOLLOW_UP_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`DE: createFollowUpDeduped: ${error?.message ?? "no row returned"}`);
  }

  return mapFollowUpRow(data as Record<string, unknown>);
}
