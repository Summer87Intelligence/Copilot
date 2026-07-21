import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getActiveIdentificationForMovement,
  insertIdentification,
  revokeIdentification,
  type ClientIdentificationRow,
  type ClientIdentificationStatus,
} from "@/lib/bank/canonical/client-identification-repository.server";

/**
 * FASE BANK-HISTORICAL-PAYER-IDENTIFICATION-001 — confirmación en lote de
 * "este movimiento es de <cliente>". Escribe ÚNICAMENTE en
 * `bank_movement_client_identifications`. NUNCA crea un link financiero, una
 * allocation ni un evento de conciliación, y NUNCA marca una factura como
 * pagada — eso sigue siendo responsabilidad exclusiva de
 * `confirm_bank_reconciliation_v1` cuando exista un recibo real.
 */

export type BatchIdentificationInput = {
  workspaceId: string;
  actorUserId: string;
  clientCompanyId: string;
  /** Movimientos a confirmar para este cliente (ya sin los excluidos por el operador). */
  movementIds: string[];
  reason: string | null;
  status?: Extract<ClientIdentificationStatus, "identified" | "shared_account" | "third_party">;
  payerIdentityId?: string | null;
};

export type BatchIdentificationResult = {
  ok: true;
  created: ClientIdentificationRow[];
  alreadyIdentifiedSameClient: string[]; // movementIds (idempotente, no se re-crea)
  conflicts: Array<{ movementId: string; existingClientCompanyId: string }>; // requieren revisión humana
  /** Movimientos de salida (egreso) — la identificación de cliente solo aplica a ingresos. */
  blockedNonInflow: string[];
  /**
   * Movimientos que ya tienen un link financiero activo (`bank_movement_reconciliation_links`).
   * El cliente ya se conoce a través de esa conciliación real — no se crea una
   * identificación redundante que pudiera leerse como una segunda fuente de verdad.
   */
  alreadyReconciled: string[];
};

async function loadMovementGuardInfo(
  supabase: SupabaseClient,
  workspaceId: string,
  movementId: string
): Promise<{ direction: string; hasActiveFinancialLink: boolean } | null> {
  const { data: movement } = await supabase
    .from("bank_movements")
    .select("id, direction")
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .maybeSingle();
  if (!movement) return null;

  const { data: link } = await supabase
    .from("bank_movement_reconciliation_links")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("bank_movement_id", movementId)
    .is("archived_at", null)
    .maybeSingle();

  return { direction: (movement as { direction: string }).direction, hasActiveFinancialLink: link != null };
}

/**
 * Confirma en lote. Nunca sobrescribe una identificación activa existente
 * para OTRO cliente (sección 9: conflictos) — esos movimientos se reportan
 * en `conflicts` para que el operador decida explícitamente (reasignar o
 * dejar como cuenta compartida/pago de tercero). Nunca identifica un egreso,
 * y nunca crea una identificación redundante para un movimiento ya conciliado
 * financieramente (el cliente ya se conoce por esa vía real).
 */
export async function confirmBatchClientIdentification(
  supabase: SupabaseClient,
  input: BatchIdentificationInput
): Promise<BatchIdentificationResult> {
  const uniqueMovementIds = Array.from(new Set(input.movementIds));
  const created: ClientIdentificationRow[] = [];
  const alreadyIdentifiedSameClient: string[] = [];
  const conflicts: Array<{ movementId: string; existingClientCompanyId: string }> = [];
  const blockedNonInflow: string[] = [];
  const alreadyReconciled: string[] = [];

  for (const movementId of uniqueMovementIds) {
    const guard = await loadMovementGuardInfo(supabase, input.workspaceId, movementId);
    if (!guard) continue; // movimiento inexistente en este workspace: se ignora silenciosamente (aislamiento)
    if (guard.direction !== "inflow") {
      blockedNonInflow.push(movementId);
      continue;
    }
    if (guard.hasActiveFinancialLink) {
      alreadyReconciled.push(movementId);
      continue;
    }

    const existing = await getActiveIdentificationForMovement(supabase, input.workspaceId, movementId);
    if (existing) {
      if (existing.clientCompanyId === input.clientCompanyId) {
        alreadyIdentifiedSameClient.push(movementId);
      } else {
        conflicts.push({ movementId, existingClientCompanyId: existing.clientCompanyId });
      }
      continue;
    }
    const row = await insertIdentification(supabase, {
      workspaceId: input.workspaceId,
      movementId,
      clientCompanyId: input.clientCompanyId,
      payerIdentityId: input.payerIdentityId ?? null,
      status: input.status ?? "identified",
      identificationMode: uniqueMovementIds.length > 1 ? "manual_batch" : "manual_single",
      reason: input.reason,
      confirmedBy: input.actorUserId,
    });
    created.push(row);
  }

  return { ok: true, created, alreadyIdentifiedSameClient, conflicts, blockedNonInflow, alreadyReconciled };
}

export type ReassignResult = { ok: true; revokedId: string; created: ClientIdentificationRow };

/**
 * "Elegir otro cliente" — acción explícita y auditada, nunca automática.
 * Revoca la identificación activa (queda como histórico, no se borra) y crea
 * una nueva para el cliente elegido.
 */
export async function reassignClientIdentification(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    actorUserId: string;
    movementId: string;
    newClientCompanyId: string;
    /** Obligatorio: una reasignación siempre corrige algo, nunca es silenciosa. */
    reason: string;
  }
): Promise<ReassignResult> {
  if (!input.reason || input.reason.trim().length === 0) {
    throw new Error("REASSIGN_REASON_REQUIRED");
  }
  const existing = await getActiveIdentificationForMovement(supabase, input.workspaceId, input.movementId);
  if (!existing) throw new Error("NO_ACTIVE_IDENTIFICATION_TO_REASSIGN");
  await revokeIdentification(supabase, input.workspaceId, existing.id, input.actorUserId);
  const created = await insertIdentification(supabase, {
    workspaceId: input.workspaceId,
    movementId: input.movementId,
    clientCompanyId: input.newClientCompanyId,
    payerIdentityId: null,
    status: "identified",
    identificationMode: "manual_single",
    reason: input.reason,
    confirmedBy: input.actorUserId,
  });
  return { ok: true, revokedId: existing.id, created };
}
