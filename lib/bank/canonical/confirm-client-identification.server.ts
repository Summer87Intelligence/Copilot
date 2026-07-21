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
};

/**
 * Confirma en lote. Nunca sobrescribe una identificación activa existente
 * para OTRO cliente (sección 9: conflictos) — esos movimientos se reportan
 * en `conflicts` para que el operador decida explícitamente (reasignar o
 * dejar como cuenta compartida/pago de tercero).
 */
export async function confirmBatchClientIdentification(
  supabase: SupabaseClient,
  input: BatchIdentificationInput
): Promise<BatchIdentificationResult> {
  const uniqueMovementIds = Array.from(new Set(input.movementIds));
  const created: ClientIdentificationRow[] = [];
  const alreadyIdentifiedSameClient: string[] = [];
  const conflicts: Array<{ movementId: string; existingClientCompanyId: string }> = [];

  for (const movementId of uniqueMovementIds) {
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

  return { ok: true, created, alreadyIdentifiedSameClient, conflicts };
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
    reason: string | null;
  }
): Promise<ReassignResult> {
  const existing = await getActiveIdentificationForMovement(supabase, input.workspaceId, input.movementId);
  if (!existing) throw new Error("NO_ACTIVE_IDENTIFICATION_TO_REASSIGN");
  await revokeIdentification(supabase, input.workspaceId, existing.id);
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
