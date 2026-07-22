/**
 * FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001 — crea o reutiliza una
 * suggestion operational `manual_draft` para un movimiento sin suggestion
 * canónica activa. No confirma, no crea link ni allocation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertShadowWriteAllowed } from "@/lib/bank/intelligence/server/guards";
import {
  insertSuggestionEvent,
  listSuggestionsByScope,
} from "@/lib/bank/intelligence/server/repositories";

/** Versión de motor dedicada a borradores manuales (no colisiona con shadow v1). */
export const MANUAL_DRAFT_ENGINE_VERSION = 9001;

export type CreateManualDraftResult =
  | { ok: true; suggestionId: string; reused: boolean; movementId: string }
  | { ok: false; code: string; message: string };

function fail(code: string, message: string): CreateManualDraftResult {
  return { ok: false, code, message };
}

export async function createOrReuseManualDraftSuggestion(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    actorUserId: string;
    movementId: string;
  }
): Promise<CreateManualDraftResult> {
  const movementId = String(input.movementId ?? "").trim();
  if (!movementId) return fail("MOVEMENT_REQUIRED", "movementId es obligatorio.");

  const { data: movement, error: movErr } = await supabase
    .from("bank_movements")
    .select("id, workspace_id, direction, status")
    .eq("id", movementId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();

  if (movErr) return fail("MOVEMENT_READ_FAILED", movErr.message);
  if (!movement) return fail("MOVEMENT_NOT_FOUND", "Movimiento no encontrado en este workspace.");
  if (movement.direction !== "inflow") {
    return fail("NON_COMMERCIAL", "Solo transferencias recibidas se concilian con cliente/recibo.");
  }
  if (movement.status === "matched") {
    return fail("MOVEMENT_ALREADY_RECONCILED", "Este movimiento ya está conciliado.");
  }
  if (movement.status === "ignored") {
    return fail("MOVEMENT_NOT_RECONCILABLE", "Este movimiento está ignorado.");
  }

  const active = await listSuggestionsByScope(supabase, input.workspaceId, "operational", {
    statuses: ["generated", "pending_review"],
    movementIds: [movementId],
  });
  if (active.length > 0) {
    return {
      ok: true,
      suggestionId: active[0]!.id,
      reused: true,
      movementId,
    };
  }

  assertShadowWriteAllowed("bank_reconciliation_suggestions", "insert");
  const { data, error } = await supabase
    .from("bank_reconciliation_suggestions")
    .insert({
      workspace_id: input.workspaceId,
      bank_movement_id: movementId,
      payer_identity_id: null,
      proposed_client_id: null,
      proposed_receipt_id: null,
      confidence: 0,
      // `reasons` es `ReconciliationReason[]` — códigos string planos, nunca
      // objetos. Un objeto acá rompe el render aguas abajo (React no puede
      // pintar un objeto como children de un elemento de lista).
      reasons: ["MANUAL_DRAFT"],
      warnings: [],
      recommended_action: "REVIEW",
      engine_version: MANUAL_DRAFT_ENGINE_VERSION,
      status: "generated",
      suggestion_scope: "operational",
    })
    .select("id")
    .single();

  if (error || !data) {
    return fail("MANUAL_DRAFT_INSERT_FAILED", error?.message ?? "no data");
  }

  const suggestionId = String((data as { id: string }).id);

  try {
    await insertSuggestionEvent(supabase, {
      workspaceId: input.workspaceId,
      entityId: suggestionId,
      eventType: "suggestion_created",
      actorUserId: input.actorUserId,
      newState: "generated",
      metadata: {
        source: "manual_draft",
        movementId,
        engineVersion: MANUAL_DRAFT_ENGINE_VERSION,
      },
    });
  } catch {
    // Evento best-effort: la suggestion ya existe y es usable.
  }

  return {
    ok: true,
    suggestionId,
    reused: false,
    movementId,
  };
}
