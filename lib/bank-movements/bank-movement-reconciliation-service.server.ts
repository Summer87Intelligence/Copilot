import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReconciliationListFilters } from "@/lib/bank-movements/bank-movement-reconciliation-api";
import {
  buildReconciliationSuggestions,
  RECONCILIATION_DATE_WINDOW_DAYS,
  type ReconciliationConfidence,
  type ReconciliationSuggestion,
} from "@/lib/bank-movements/bank-movement-reconciliation";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import {
  buildHideMetadata,
  buildRestoreMetadata,
  isBankMovementUiHidden,
} from "@/lib/bank-movements/bank-movement-visibility";
import { BANK_OPERATIONAL_START_DATE } from "@/lib/bank/canonical/historical-policy";
import { plannedCashObligationRepositoryGetById, plannedCashObligationRepositoryList } from "@/lib/treasury/repositories/planned-cash-obligation-repository";

export type ReconciliationListItem = {
  movement: BankMovement;
  suggestions: ReconciliationSuggestion[];
};

export type ReconciliationListMeta = {
  pending_count: number;
  with_high_confidence: number;
  with_medium_confidence: number;
  without_suggestions: number;
  matched_count: number;
  ignored_count: number;
};

export type ReconciliationListResult = {
  items: ReconciliationListItem[];
  meta: ReconciliationListMeta;
};

function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd.slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function filterItemsByConfidence(
  items: ReconciliationListItem[],
  confidence: ReconciliationListFilters["confidence"]
): ReconciliationListItem[] {
  if (!confidence || confidence === "all") return items;
  if (confidence === "none") {
    return items.filter((item) => item.suggestions.length === 0);
  }
  return items.filter((item) => item.suggestions[0]?.confidence === confidence);
}

function buildMeta(items: ReconciliationListItem[]): ReconciliationListMeta {
  let with_high_confidence = 0;
  let with_medium_confidence = 0;
  let without_suggestions = 0;

  for (const item of items) {
    const best = item.suggestions[0];
    if (!best) {
      without_suggestions += 1;
      continue;
    }
    if (best.confidence === "high") with_high_confidence += 1;
    if (best.confidence === "medium") with_medium_confidence += 1;
  }

  return {
    pending_count: items.length,
    with_high_confidence,
    with_medium_confidence,
    without_suggestions,
    matched_count: 0,
    ignored_count: 0,
  };
}

export async function loadBankMovementReconciliationList(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  filters: ReconciliationListFilters;
}): Promise<ReconciliationListResult> {
  const { supabase, workspaceId, filters } = params;

  let movementQuery = supabase
    .from("bank_movements")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("movement_date", { ascending: false })
    .limit(2000);

  if (filters.currency) movementQuery = movementQuery.eq("currency", filters.currency);

  // Política temporal (FASE-3): por defecto solo movimientos operativos alimentan
  // conciliación/tareas/alertas. Los históricos quedan fuera salvo opt-in explícito.
  if (!filters.includeHistorical) {
    movementQuery = movementQuery.gte("movement_date", BANK_OPERATIONAL_START_DATE);
  }

  if (filters.status === "matched") {
    movementQuery = movementQuery.eq("status", "matched");
  } else if (filters.status === "ignored") {
    movementQuery = movementQuery.eq("status", "ignored");
  } else if (filters.status === "pending" || !filters.status) {
    movementQuery = movementQuery.in("status", ["pending", "suggested", "needs_review"]);
  }

  const { data: movementRows, error: movementError } = await movementQuery;
  if (movementError) throw new Error("LOAD_MOVEMENTS_FAILED");

  const movements = (movementRows ?? []) as BankMovement[];
  const outflowMovements = movements.filter((movement) => movement.direction === "outflow");

  let fromDate: string | undefined;
  let toDate: string | undefined;
  if (outflowMovements.length > 0) {
    const dates = outflowMovements.map((movement) => movement.movement_date.slice(0, 10)).sort();
    fromDate = addDaysYmd(dates[0]!, -RECONCILIATION_DATE_WINDOW_DAYS);
    toDate = addDaysYmd(dates[dates.length - 1]!, RECONCILIATION_DATE_WINDOW_DAYS);
  }

  const { rows: obligations, error: obligationError } = await plannedCashObligationRepositoryList(
    supabase,
    workspaceId,
    {
      direction: "outflow",
      fromDate,
      toDate,
      currencyCode: filters.currency,
    },
    500
  );
  if (obligationError) throw new Error("LOAD_OBLIGATIONS_FAILED");

  const openObligations = obligations.filter((row) =>
    ["planned", "confirmed", "overdue", "paid"].includes(row.status)
  );

  const rawItems = buildReconciliationSuggestions(outflowMovements, openObligations);
  const filtered = filterItemsByConfidence(rawItems, filters.confidence);
  const meta = buildMeta(rawItems);

  if (filters.status === "matched" || filters.status === "ignored") {
    meta.pending_count = 0;
  }

  const { count: matchedCount } = await supabase
    .from("bank_movements")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "matched");
  const { count: ignoredCount } = await supabase
    .from("bank_movements")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "ignored");

  meta.matched_count = matchedCount ?? 0;
  meta.ignored_count = ignoredCount ?? 0;

  return { items: filtered, meta };
}

export async function reconcileBankMovementWithObligation(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  movementId: string;
  targetId: string;
  confidence: ReconciliationConfidence;
  score: number;
  notes?: string;
}): Promise<BankMovement> {
  const { supabase, workspaceId, userId, movementId, targetId, confidence, score, notes } = params;
  const now = new Date().toISOString();

  const { data: movement, error: movementError } = await supabase
    .from("bank_movements")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .maybeSingle();
  if (movementError || !movement) throw new Error("MOVEMENT_NOT_FOUND");

  const { row: obligation, error: obligationError } = await plannedCashObligationRepositoryGetById(
    supabase,
    workspaceId,
    targetId
  );
  if (obligationError || !obligation) throw new Error("TARGET_NOT_FOUND");

  const movementRow = movement as BankMovement & { metadata?: Record<string, unknown> };
  const existingMetadata = movementRow.metadata ?? {};

  const patch = {
    status: "matched",
    matched_type: "planned_payment",
    matched_id: targetId,
    matched_confidence: score,
    matched_by: userId,
    matched_at: now,
    updated_at: now,
    metadata: {
      ...existingMetadata,
      reconciliation: {
        target_type: "planned_cash_obligation",
        target_id: targetId,
        confidence,
        score,
        notes: notes ?? null,
        reconciled_at: now,
      },
    },
  };

  const { data: updated, error: updateError } = await supabase
    .from("bank_movements")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .select("*")
    .maybeSingle();
  if (updateError || !updated) throw new Error("MOVEMENT_UPDATE_FAILED");

  await supabase
    .from("bank_movement_match_suggestions")
    .update({ status: "accepted", updated_at: now })
    .eq("workspace_id", workspaceId)
    .eq("bank_movement_id", movementId)
    .eq("candidate_type", "planned_payment")
    .eq("candidate_id", targetId)
    .eq("status", "open");

  return updated as BankMovement;
}

export async function ignoreBankMovement(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  movementId: string;
  reason?: string;
}): Promise<BankMovement> {
  const { supabase, workspaceId, movementId, reason } = params;
  const now = new Date().toISOString();

  const { data: movement, error: loadError } = await supabase
    .from("bank_movements")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .maybeSingle();
  if (loadError || !movement) throw new Error("MOVEMENT_NOT_FOUND");

  const movementRow = movement as BankMovement & { metadata?: Record<string, unknown> };
  const existingMetadata = movementRow.metadata ?? {};

  const { data: updated, error: updateError } = await supabase
    .from("bank_movements")
    .update({
      status: "ignored",
      matched_type: null,
      matched_id: null,
      matched_confidence: null,
      matched_by: null,
      matched_at: null,
      updated_at: now,
      metadata: {
        ...existingMetadata,
        ignore_reason: reason ?? null,
        ignored_at: now,
      },
    })
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .select("*")
    .maybeSingle();
  if (updateError || !updated) throw new Error("MOVEMENT_UPDATE_FAILED");

  await supabase
    .from("bank_movement_match_suggestions")
    .update({ status: "rejected", updated_at: now })
    .eq("workspace_id", workspaceId)
    .eq("bank_movement_id", movementId)
    .eq("status", "open");

  return updated as BankMovement;
}

export async function hideBankMovement(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  movementId: string;
  actorId: string;
  reason?: string;
}): Promise<BankMovement> {
  const { supabase, workspaceId, movementId, actorId, reason } = params;
  const { data: movement, error: loadError } = await supabase
    .from("bank_movements")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .maybeSingle();
  if (loadError || !movement) throw new Error("MOVEMENT_NOT_FOUND");

  const movementRow = movement as BankMovement & { metadata?: Record<string, unknown> };
  const existingMetadata = movementRow.metadata ?? {};
  if (isBankMovementUiHidden(existingMetadata)) {
    return movementRow as BankMovement;
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("bank_movements")
    .update({
      updated_at: now,
      metadata: buildHideMetadata(existingMetadata, { actorId, reason, at: now }),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .select("*")
    .maybeSingle();
  if (updateError || !updated) throw new Error("MOVEMENT_HIDE_FAILED");
  return updated as BankMovement;
}

export async function restoreBankMovement(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  movementId: string;
  actorId: string;
}): Promise<BankMovement> {
  const { supabase, workspaceId, movementId, actorId } = params;
  const { data: movement, error: loadError } = await supabase
    .from("bank_movements")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .maybeSingle();
  if (loadError || !movement) throw new Error("MOVEMENT_NOT_FOUND");

  const movementRow = movement as BankMovement & { metadata?: Record<string, unknown> };
  const existingMetadata = movementRow.metadata ?? {};
  if (!isBankMovementUiHidden(existingMetadata)) {
    return movementRow as BankMovement;
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("bank_movements")
    .update({
      updated_at: now,
      metadata: buildRestoreMetadata(existingMetadata, { actorId, at: now }),
    })
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .select("*")
    .maybeSingle();
  if (updateError || !updated) throw new Error("MOVEMENT_RESTORE_FAILED");
  return updated as BankMovement;
}
