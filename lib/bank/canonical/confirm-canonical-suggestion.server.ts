/**
 * FASE BANK-CANONICAL-CONFIRM-UI-001 — capa server-side que confirma una
 * sugerencia operacional del motor canónico (D). ÚNICA escritura permitida:
 * `confirm_bank_reconciliation_v1` vía RPC.
 *
 * FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001 — siempre envía
 * `p_metadata` (v3 ya en producción) con mode + selección y, cuando hay
 * señal durable, `payer` para el aprendizaje atómico de la v4 (local, no aplicada).
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
import { buildPayerLearningPayload } from "@/lib/bank/canonical/payer-identity";

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
  selectedClientId: string | null;
  selectedReceiptId: string | null;
  invoiceAllocations: ConfirmCanonicalSuggestionInvoiceAllocation[];
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

async function loadMovementForPayerLearning(
  supabase: SupabaseClient,
  workspaceId: string,
  movementId: string
): Promise<{
  description: string | null;
  bankReference: string | null;
  bankName: string | null;
  metadata: Record<string, unknown> | null;
} | null> {
  const { data, error } = await supabase
    .from("bank_movements")
    .select("description, bank_reference, bank_name, metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", movementId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    description: data.description != null ? String(data.description) : null,
    bankReference: data.bank_reference != null ? String(data.bank_reference) : null,
    bankName: data.bank_name != null ? String(data.bank_name) : null,
    metadata:
      data.metadata && typeof data.metadata === "object"
        ? (data.metadata as Record<string, unknown>)
        : null,
  };
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
    if (receiptId == null) {
      return fail("RECEIPT_NOT_FOUND");
    }
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

    if (input.selectedReceiptId == null) {
      return fail("RECEIPT_NOT_FOUND");
    }
    const receipt = await getShadowReceiptById(supabase, input.workspaceId, input.selectedReceiptId);
    if (!receipt) return fail("RECEIPT_NOT_FOUND");
    if (receipt.companyId !== input.selectedClientId) return fail("RECEIPT_CLIENT_MISMATCH");
    receiptId = input.selectedReceiptId;
    candidateClientId = input.selectedClientId;
  }

  if (input.invoiceAllocations.length > 0) {
    if (!receiptId || !candidateClientId) {
      return fail("INVOICE_NOT_IN_EVIDENCE");
    }
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

  const movement = await loadMovementForPayerLearning(
    supabase,
    input.workspaceId,
    input.expectedMovementId
  );
  const payer = movement
    ? buildPayerLearningPayload({
        description: movement.description,
        bankReference: movement.bankReference,
        bankName: movement.bankName,
        metadata: movement.metadata,
        clientCompanyId: candidateClientId,
      })
    : null;

  const metadata: Record<string, unknown> = {
    mode: input.mode,
    selectedClientId: candidateClientId,
    selectedReceiptId: receiptId,
    proposedClientId: suggestion.proposedClientId,
    proposedReceiptId: suggestion.proposedReceiptId,
  };
  if (input.mode === "manual_reviewed") {
    metadata.reason = input.manualReason;
  }
  if (payer) {
    metadata.payer = payer;
  }

  const rpcArgs: Record<string, unknown> = {
    p_workspace_id: input.workspaceId,
    p_movement_id: input.expectedMovementId,
    p_receipt_id: receiptId,
    p_suggestion_id: input.suggestionId,
    p_allocations:
      input.invoiceAllocations.length > 0
        ? input.invoiceAllocations.map((a) => ({ invoice_id: a.invoiceId, amount: a.amount }))
        : null,
    p_applied_amount: null,
    p_created_by: input.actorUserId,
    p_metadata: metadata,
  };

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
