import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";

const INITIATIVE_LIST_SELECT =
  "id, company_name, source, trigger, score, status, created_at, processing_stage" as const;
const DECISION_LIST_SELECT =
  "id, initiative_id, decision_type, recommended_channel, priority_rank, confidence_score, suggested_message, created_at" as const;
const ACTION_LIST_SELECT =
  "id, decision_id, initiative_id, action_type, channel, execution_status, action_payload, created_at, assignee_name, expected_result, before_note, updated_at" as const;

export async function selectInitiativesOrdered(
  client: OperationalSupabase,
  limit: number
) {
  return client
    .from("initiatives")
    .select(INITIATIVE_LIST_SELECT)
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function selectDecisionsOrdered(
  client: OperationalSupabase,
  limit: number
) {
  return client
    .from("decisions")
    .select(DECISION_LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function selectActionsOrdered(
  client: OperationalSupabase,
  limit: number
) {
  return client
    .from("actions")
    .select(ACTION_LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function selectInitiativeCompanyNamesByIds(
  client: OperationalSupabase,
  ids: string[]
) {
  if (ids.length === 0) {
    return { data: [] as { id: string; company_name: string | null }[], error: null };
  }
  return client.from("initiatives").select("id, company_name").in("id", ids);
}

export async function selectInitiativesForDecisionBatch(
  client: OperationalSupabase,
  batchLimit: number
) {
  return client
    .from("initiatives")
    .select("id, company_name, trigger, score")
    .eq("processing_stage", "new")
    .order("score", { ascending: false })
    .limit(batchLimit);
}

export async function selectDecisionInitiativeIdsForInitiatives(
  client: OperationalSupabase,
  initiativeIds: string[]
) {
  return client.from("decisions").select("initiative_id").in("initiative_id", initiativeIds);
}

export async function insertDecisions(
  client: OperationalSupabase,
  rows: Record<string, unknown>[]
) {
  return client.from("decisions").insert(rows).select("id, initiative_id");
}

export async function updateInitiativesProcessingStage(
  client: OperationalSupabase,
  initiativeIds: string[],
  stage: string
) {
  return client.from("initiatives").update({ processing_stage: stage }).in("id", initiativeIds);
}

export async function selectDecisionsForActionGeneration(
  client: OperationalSupabase,
  scanLimit: number
) {
  return client
    .from("decisions")
    .select("id, initiative_id, decision_type, suggested_message")
    .order("created_at", { ascending: false })
    .limit(scanLimit);
}

export async function selectActionDecisionIdsForDecisions(
  client: OperationalSupabase,
  decisionIds: string[]
) {
  return client.from("actions").select("decision_id").in("decision_id", decisionIds);
}

export async function insertActions(
  client: OperationalSupabase,
  rows: Record<string, unknown>[]
) {
  return client.from("actions").insert(rows).select("id");
}

export async function selectOutcomeIdByActionId(
  client: OperationalSupabase,
  actionId: string
) {
  return client.from("outcomes").select("id").eq("action_id", actionId).maybeSingle();
}

export async function selectActionIdAndInitiative(
  client: OperationalSupabase,
  actionId: string
) {
  return client.from("actions").select("id, initiative_id").eq("id", actionId).maybeSingle();
}

export async function selectOutcomesByActionIds(
  client: OperationalSupabase,
  actionIds: string[]
) {
  if (actionIds.length === 0) {
    return { data: [] as Record<string, unknown>[], error: null };
  }
  return client
    .from("outcomes")
    .select("id, action_id, outcome_type, revenue_amount, notes, after_note, created_at")
    .in("action_id", actionIds);
}

export async function updateActionLoopFields(
  client: OperationalSupabase,
  actionId: string,
  fields: {
    assignee_name?: string | null;
    expected_result?: string | null;
    before_note?: string | null;
  }
) {
  return client
    .from("actions")
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", actionId)
    .select("id")
    .maybeSingle();
}

export async function insertOutcome(
  client: OperationalSupabase,
  payload: Record<string, unknown>
) {
  return client
    .from("outcomes")
    .insert(payload)
    .select(
      "id, action_id, initiative_id, outcome_type, outcome_category, revenue_amount, notes, after_note, created_at"
    )
    .single();
}

export async function updateActionExecutionStatus(
  client: OperationalSupabase,
  actionId: string,
  status: string
) {
  return client
    .from("actions")
    .update({
      execution_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", actionId);
}

export async function deleteOutcomeById(
  client: OperationalSupabase,
  outcomeId: string
) {
  return client.from("outcomes").delete().eq("id", outcomeId);
}

const DEDUPE_PAGE_SIZE = 1000;

/**
 * Paginado de iniciativas por `dedupe_local_date` (generación de iniciativas / anti-duplicado).
 */
export async function selectInitiativeDedupeFieldsForLocalDatePage(
  client: OperationalSupabase,
  ymd: string,
  from: number,
  pageSize: number
) {
  return client
    .from("initiatives")
    .select("company_name, source, trigger")
    .eq("dedupe_local_date", ymd)
    .order("created_at", { ascending: true })
    .range(from, from + pageSize - 1);
}

export { DEDUPE_PAGE_SIZE };
