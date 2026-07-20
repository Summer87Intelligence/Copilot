/**
 * FASE BANK-CANONICAL-CONFIRM-UI-001 — rechaza una sugerencia operacional
 * ("esta propuesta está mal"), no el movimiento. ÚNICA escritura permitida:
 * `reject_bank_suggestion_v1` vía RPC — nunca toca `bank_movements`, por lo
 * que el movimiento sigue disponible para una futura sugerencia del motor.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getShadowSuggestionById } from "@/lib/bank/intelligence/server/repositories";
import {
  canonicalRpcErrorMessage,
  extractCanonicalRpcErrorCode,
  isIdempotentSuccessStatus,
} from "@/lib/bank/canonical/canonical-rpc-error-messages";

export type RejectCanonicalSuggestionInput = {
  workspaceId: string;
  actorUserId: string;
  suggestionId: string;
  expectedMovementId: string;
  reason: string;
};

export type RejectCanonicalSuggestionResult =
  | { ok: true; data: { idempotent: boolean; status: string | null } }
  | { ok: false; code: string; message: string };

function fail(code: string): RejectCanonicalSuggestionResult {
  return { ok: false, code, message: canonicalRpcErrorMessage(code) };
}

export async function rejectCanonicalSuggestion(
  supabase: SupabaseClient,
  input: RejectCanonicalSuggestionInput
): Promise<RejectCanonicalSuggestionResult> {
  const suggestion = await getShadowSuggestionById(supabase, input.workspaceId, input.suggestionId);
  if (!suggestion) return fail("SUGGESTION_NOT_FOUND");

  // La bandeja diaria solo trabaja `operational` — nunca rechazar desde acá una
  // sugerencia histórica, aunque la RPC en sí lo permitiría.
  if (suggestion.suggestionScope !== "operational") {
    return fail("SCOPE_NOT_ALLOWED");
  }
  if (suggestion.bankMovementId !== input.expectedMovementId) {
    return fail("MOVEMENT_MISMATCH");
  }

  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    return fail("REASON_INVALID");
  }

  const { data, error } = await supabase.rpc("reject_bank_suggestion_v1", {
    p_workspace_id: input.workspaceId,
    p_suggestion_id: input.suggestionId,
    p_actor: input.actorUserId,
    p_reason: reason,
  });

  if (error) {
    const code = extractCanonicalRpcErrorCode(error);
    return fail(code);
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const status = typeof row.status === "string" ? row.status : null;
  return {
    ok: true,
    data: {
      idempotent: isIdempotentSuccessStatus(status),
      status,
    },
  };
}
