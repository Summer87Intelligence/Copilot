/**
 * FASE BANK-CANONICAL-CONFIRM-UI-001 — capa server-side que confirma una
 * sugerencia operacional del motor canónico (D). ÚNICA escritura permitida:
 * `confirm_bank_reconciliation_v1` vía RPC. Nunca escribe
 * `bank_movement_reconciliation_links` / `payment_allocations` /
 * `bank_movements` directamente, nunca usa Motor C.
 *
 * Antes de invocar la RPC, revalida que lo que el cliente envía (`expectedMovementId`,
 * `expectedReceiptId`, `invoiceAllocations[].invoiceId`) coincide con la evidencia
 * server-side de la sugerencia — nunca confía en que el cliente "vio bien" la UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getShadowSuggestionById } from "@/lib/bank/intelligence/server/repositories";
import { listShadowInvoices } from "@/lib/bank/intelligence/server/repositories";
import {
  canonicalRpcErrorMessage,
  extractCanonicalRpcErrorCode,
  isIdempotentSuccessStatus,
} from "@/lib/bank/canonical/canonical-rpc-error-messages";

export type ConfirmCanonicalSuggestionInvoiceAllocation = {
  invoiceId: string;
  amount: number;
};

export type ConfirmCanonicalSuggestionInput = {
  workspaceId: string;
  actorUserId: string;
  suggestionId: string;
  expectedMovementId: string;
  expectedReceiptId: string | null;
  invoiceAllocations: ConfirmCanonicalSuggestionInvoiceAllocation[];
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
  if (input.expectedReceiptId != null && suggestion.proposedReceiptId !== input.expectedReceiptId) {
    return fail("RECEIPT_MISMATCH");
  }

  const receiptId = input.expectedReceiptId ?? suggestion.proposedReceiptId ?? null;

  if (input.invoiceAllocations.length > 0) {
    if (!receiptId || !suggestion.proposedClientId) {
      return fail("INVOICE_NOT_IN_EVIDENCE");
    }
    // Misma fuente de verdad que la evidencia mostrada en el drawer (candidateInvoices):
    // recalculamos las facturas candidatas del cliente/moneda propuestos y validamos
    // que cada factura seleccionada por el usuario pertenezca a ese conjunto.
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
      clientIds: [suggestion.proposedClientId],
      limit: 100,
    });
    const candidateIds = new Set(candidates.map((c) => c.id));
    for (const alloc of input.invoiceAllocations) {
      if (!candidateIds.has(alloc.invoiceId)) {
        return fail("INVOICE_NOT_IN_EVIDENCE");
      }
    }
  }

  const { data, error } = await supabase.rpc("confirm_bank_reconciliation_v1", {
    p_workspace_id: input.workspaceId,
    p_movement_id: input.expectedMovementId,
    p_receipt_id: receiptId,
    p_suggestion_id: input.suggestionId,
    p_allocations: input.invoiceAllocations.length > 0 ? input.invoiceAllocations.map((a) => ({ invoice_id: a.invoiceId, amount: a.amount })) : null,
    p_applied_amount: null,
    p_created_by: input.actorUserId,
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
      linkId: String(row.linkId ?? row.link_id ?? ""),
      idempotent: Boolean(row.idempotent) || isIdempotentSuccessStatus(status),
      status,
      appliedAmount: typeof row.appliedAmount === "number" ? row.appliedAmount : null,
      allocatedAmount: typeof row.allocatedAmount === "number" ? row.allocatedAmount : null,
      unappliedAmount: typeof row.unappliedAmount === "number" ? row.unappliedAmount : null,
    },
  };
}
