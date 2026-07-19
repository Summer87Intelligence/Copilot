/**
 * FASE BANK-HISTORICAL-REVIEW-ACTIONS-001 — invocación server-side de las acciones
 * humanas NO financieras (marcar revisada / rechazar / agregar nota).
 *
 * Cada acción llama una RPC transaccional (suggestion + event atómicos). El scope y
 * el estado se validan DENTRO de la RPC (server-side), nunca desde el cliente. No
 * llama confirm/reverse, no crea links ni allocations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type BankReviewActionOk = { ok: true; status: string; data: Record<string, unknown> };
export type BankReviewActionErr = { ok: false; code: BankReviewErrorCode; httpStatus: number };
export type BankReviewActionResult = BankReviewActionOk | BankReviewActionErr;

export type BankReviewErrorCode =
  | "NO_WORKSPACE"
  | "INVALID_ACTOR"
  | "SUGGESTION_NOT_FOUND"
  | "SCOPE_NOT_ALLOWED"
  | "SUGGESTION_NOT_ACTIVE"
  | "SUGGESTION_TERMINAL"
  | "CONCURRENT_UPDATE"
  | "REASON_INVALID"
  | "NOTE_INVALID"
  | "MIGRATION_PENDING"
  | "ACTION_FAILED";

const HTTP: Record<BankReviewErrorCode, number> = {
  NO_WORKSPACE: 400,
  INVALID_ACTOR: 403,
  SUGGESTION_NOT_FOUND: 404,
  SCOPE_NOT_ALLOWED: 409,
  SUGGESTION_NOT_ACTIVE: 409,
  SUGGESTION_TERMINAL: 409,
  CONCURRENT_UPDATE: 409,
  REASON_INVALID: 422,
  NOTE_INVALID: 422,
  MIGRATION_PENDING: 409,
  ACTION_FAILED: 500,
};

const KNOWN: BankReviewErrorCode[] = [
  "NO_WORKSPACE",
  "INVALID_ACTOR",
  "SUGGESTION_NOT_FOUND",
  "SCOPE_NOT_ALLOWED",
  "SUGGESTION_NOT_ACTIVE",
  "SUGGESTION_TERMINAL",
  "CONCURRENT_UPDATE",
  "REASON_INVALID",
  "NOTE_INVALID",
];

/** Traduce el error de una RPC (mensaje del RAISE / PostgREST) a un código estable. */
export function mapRpcError(err: { message?: string; code?: string } | null): BankReviewActionErr {
  const message = String(err?.message ?? "");
  const pgrst = String(err?.code ?? "");
  // Función inexistente ⇒ migración no aplicada.
  if (pgrst === "PGRST202" || message.includes("42883") || message.includes("Could not find the function")) {
    return { ok: false, code: "MIGRATION_PENDING", httpStatus: HTTP.MIGRATION_PENDING };
  }
  for (const code of KNOWN) {
    if (message.includes(code)) return { ok: false, code, httpStatus: HTTP[code] };
  }
  return { ok: false, code: "ACTION_FAILED", httpStatus: HTTP.ACTION_FAILED };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asRecord(data: any): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

export async function reviewSuggestion(
  supabase: SupabaseClient,
  workspaceId: string,
  suggestionId: string,
  actorId: string
): Promise<BankReviewActionResult> {
  const { data, error } = await supabase.rpc("review_bank_suggestion_v1", {
    p_workspace_id: workspaceId,
    p_suggestion_id: suggestionId,
    p_actor: actorId,
  });
  if (error) return mapRpcError(error);
  const rec = asRecord(data);
  return { ok: true, status: String(rec.status ?? "reviewed"), data: rec };
}

export async function rejectSuggestion(
  supabase: SupabaseClient,
  workspaceId: string,
  suggestionId: string,
  actorId: string,
  reason: string
): Promise<BankReviewActionResult> {
  const { data, error } = await supabase.rpc("reject_bank_suggestion_v1", {
    p_workspace_id: workspaceId,
    p_suggestion_id: suggestionId,
    p_actor: actorId,
    p_reason: reason,
  });
  if (error) return mapRpcError(error);
  const rec = asRecord(data);
  return { ok: true, status: String(rec.status ?? "rejected"), data: rec };
}

export async function addSuggestionNote(
  supabase: SupabaseClient,
  workspaceId: string,
  suggestionId: string,
  actorId: string,
  note: string,
  clientToken?: string | null
): Promise<BankReviewActionResult> {
  const { data, error } = await supabase.rpc("add_bank_suggestion_note_v1", {
    p_workspace_id: workspaceId,
    p_suggestion_id: suggestionId,
    p_actor: actorId,
    p_note: note,
    p_client_token: clientToken ?? null,
  });
  if (error) return mapRpcError(error);
  const rec = asRecord(data);
  return { ok: true, status: String(rec.status ?? "noted"), data: rec };
}
