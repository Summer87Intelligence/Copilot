/**
 * FASE BANK-CANONICAL-CONFIRM-UI-001 — capa server-side que confirma una
 * sugerencia operacional del motor canónico (D). ÚNICA escritura permitida:
 * `confirm_bank_reconciliation_v1` vía RPC. Nunca escribe
 * `bank_movement_reconciliation_links` / `payment_allocations` /
 * `bank_movements` directamente, nunca usa Motor C.
 *
 * FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001 — agrega `mode`:
 * - "suggested": confirma exactamente cliente/recibo propuestos por el motor
 *   (comportamiento idéntico a antes de esta fase; misma forma de llamada a
 *   la RPC, sin `p_metadata`, funciona contra la v2 ya en producción).
 * - "manual_reviewed": la persona seleccionó explícitamente un cliente y/o
 *   recibo distintos de los propuestos. La RPC en sí NUNCA exigió que el
 *   recibo coincidiera con `proposed_receipt_id` (auditado: esa restricción
 *   vivía únicamente acá, en el adapter) — lo nuevo es revalidar la
 *   selección manual de forma independiente (cliente real del workspace,
 *   recibo perteneciente a ESE cliente, motivo obligatorio) y registrarla
 *   vía `p_metadata` (requiere la migración v3, no aplicada todavía).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getShadowClientById,
  getShadowReceiptById,
  getShadowSuggestionById,
  listShadowInvoices,
} from "@/lib/bank/intelligence/server/repositories";
import {
  canonicalRpcErrorMessage,
  extractCanonicalRpcErrorCode,
  isIdempotentSuccessStatus,
} from "@/lib/bank/canonical/canonical-rpc-error-messages";

export type ConfirmCanonicalSuggestionInvoiceAllocation = {
  invoiceId: string;
  amount: number;
};

export type ConfirmCanonicalSuggestionMode = "suggested" | "manual_reviewed";

export type ConfirmCanonicalSuggestionInput = {
  workspaceId: string;
  actorUserId: string;
  suggestionId: string;
  expectedMovementId: string;
  mode: ConfirmCanonicalSuggestionMode;
  /** Cliente elegido por la persona (o el propuesto, en modo "suggested"). Puede ser null si la sugerencia no proponía ninguno. */
  selectedClientId: string | null;
  selectedReceiptId: string | null;
  invoiceAllocations: ConfirmCanonicalSuggestionInvoiceAllocation[];
  /** Obligatorio (3-500 chars) cuando mode='manual_reviewed'. */
  manualReason: string | null;
};

export type ConfirmCanonicalSuggestionResult =
  | {
      ok: true;
      data: {
        linkId: string;
        idempotent: boolean;
        status: string | null;
        appliedAmount: number | null;
        allocatedAmount: number | null;
        unappliedAmount: number | null;
      };
    }
  | { ok: false; code: string; message: string };

function fail(code: string): ConfirmCanonicalSuggestionResult {
  return { ok: false, code, message: canonicalRpcErrorMessage(code) };
}

export async function confirmCanonicalSuggestion(
  supabase: SupabaseClient,
  input: ConfirmCanonicalSuggestionInput
): Promise<ConfirmCanonicalSuggestionResult> {
  const suggestion = await getShadowSuggestionById(supabase, input.workspaceId, input.suggestionId);
  if (!suggestion) return fail("SUGGESTION_NOT_FOUND");

  if (suggestion.suggestionScope !== "operational") {
    return fail("SUGGESTION_NOT_CONFIRMABLE");
  }
  if (suggestion.bankMovementId !== input.expectedMovementId) {
    return fail("MOVEMENT_MISMATCH");
  }

  let receiptId: string | null;
  let candidateClientId: string | null;

  if (input.mode === "suggested") {
    if (input.selectedClientId !== suggestion.proposedClientId) {
      return fail("CLIENT_MISMATCH");
    }
    if (input.selectedReceiptId != null && suggestion.proposedReceiptId !== input.selectedReceiptId) {
      return fail("RECEIPT_MISMATCH");
    }
    receiptId = input.selectedReceiptId ?? suggestion.proposedReceiptId ?? null;
    candidateClientId = suggestion.proposedClientId;
  } else {
    const reason = (input.manualReason ?? "").trim();
    if (reason.length < 3 || reason.length > 500) {
      return fail("MANUAL_REASON_REQUIRED");
    }
    if (!input.selectedClientId) {
      return fail("CLIENT_NOT_FOUND");
    }
    const client = await getShadowClientById(supabase, input.workspaceId, input.selectedClientId);
    if (!client) return fail("CLIENT_NOT_FOUND");

    if (input.selectedReceiptId != null) {
      const receipt = await getShadowReceiptById(supabase, input.workspaceId, input.selectedReceiptId);
      if (!receipt) return fail("RECEIPT_NOT_FOUND");
      if (receipt.companyId !== input.selectedClientId) return fail("RECEIPT_CLIENT_MISMATCH");
    }
    receiptId = input.selectedReceiptId ?? null;
    candidateClientId = input.selectedClientId;
  }

  if (input.invoiceAllocations.length > 0) {
    if (!receiptId || !candidateClientId) {
      return fail("INVOICE_NOT_IN_EVIDENCE");
    }
    // Misma fuente de verdad que la evidencia mostrada en el drawer (candidateInvoices):
    // recalculamos las facturas candidatas del cliente/moneda seleccionados (no
    // necesariamente el propuesto por la sugerencia, en modo manual_reviewed) y
    // validamos que cada factura seleccionada por el usuario pertenezca a ese conjunto.
    const receiptRes = await supabase
      .from("proto_receipts")
      .select("currency_code")
      .eq("workspace_company_id", input.workspaceId)
      .eq("id", receiptId)
      .maybeSingle();
    const currency = receiptRes.data?.currency_code ? String(receiptRes.data.currency_code) : null;
    if (!currency) return fail("RECEIPT_NOT_FOUND");

    const candidates = await listShadowInvoices(supabase, input.workspaceId, {
      currency,
      clientIds: [candidateClientId],
      limit: 100,
    });
    const candidateIds = new Set(candidates.map((c) => c.id));
    for (const alloc of input.invoiceAllocations) {
      if (!candidateIds.has(alloc.invoiceId)) {
        return fail("INVOICE_NOT_IN_EVIDENCE");
      }
    }
  }

  const rpcArgs: Record<string, unknown> = {
    p_workspace_id: input.workspaceId,
    p_movement_id: input.expectedMovementId,
    p_receipt_id: receiptId,
    p_suggestion_id: input.suggestionId,
    p_allocations: input.invoiceAllocations.length > 0 ? input.invoiceAllocations.map((a) => ({ invoice_id: a.invoiceId, amount: a.amount })) : null,
    p_applied_amount: null,
    p_created_by: input.actorUserId,
  };
  // Solo se agrega p_metadata en modo manual_reviewed — el modo "suggested" mantiene
  // la MISMA forma de llamada que antes de esta fase (funciona contra la v2 ya en
  // producción). manual_reviewed requiere la migración v3 (no aplicada) aplicada.
  if (input.mode === "manual_reviewed") {
    rpcArgs.p_metadata = {
      mode: "manual_reviewed",
      selectedClientId: candidateClientId,
      selectedReceiptId: receiptId,
      proposedClientId: suggestion.proposedClientId,
      proposedReceiptId: suggestion.proposedReceiptId,
      reason: input.manualReason,
    };
  }

  const { data, error } = await supabase.rpc("confirm_bank_reconciliation_v1", rpcArgs);

  if (error) {
    const code = extractCanonicalRpcErrorCode(error);
    return fail(code);
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const status = typeof row.status === "string" ? row.status : null;
  return {
    ok: true,
    data: {
      linkId: String(row.linkId ?? row.link_id ?? ""),
      idempotent: Boolean(row.idempotent) || isIdempotentSuccessStatus(status),
      status,
      appliedAmount: typeof row.appliedAmount === "number" ? row.appliedAmount : null,
      allocatedAmount: typeof row.allocatedAmount === "number" ? row.allocatedAmount : null,
      unappliedAmount: typeof row.unappliedAmount === "number" ? row.unappliedAmount : null,
    },
  };
}
