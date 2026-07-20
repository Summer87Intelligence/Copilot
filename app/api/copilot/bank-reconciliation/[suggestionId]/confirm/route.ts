import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { confirmCanonicalSuggestionBodySchema } from "@/lib/bank/canonical/canonical-confirm-reject-api";
import { confirmCanonicalSuggestion } from "@/lib/bank/canonical/confirm-canonical-suggestion.server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_STATUS: Record<string, number> = {
  SUGGESTION_NOT_FOUND: 404,
  MOVEMENT_NOT_FOUND: 404,
  RECEIPT_NOT_FOUND: 404,
  INVOICE_NOT_FOUND: 404,
  MOVEMENT_MISMATCH: 409,
  RECEIPT_MISMATCH: 409,
  INVOICE_NOT_IN_EVIDENCE: 409,
  SUGGESTION_NOT_CONFIRMABLE: 409,
  IDEMPOTENCY_CONFLICT: 409,
  WORKSPACE_MISMATCH: 403,
  INVALID_ACTOR: 403,
  NO_WORKSPACE: 400,
  INVALID_AMOUNT: 422,
  INVALID_ALLOCATION: 422,
  CURRENCY_MISMATCH: 422,
  ALLOCATIONS_EXCEED_LINK: 422,
  OVER_APPLIED_MOVEMENT: 422,
  OVER_APPLIED_RECEIPT: 422,
  OVER_APPLIED_INVOICE: 422,
  INVOICE_FULLY_PAID: 422,
  NON_COMMERCIAL: 422,
  MOVEMENT_NOT_RECONCILABLE: 422,
};

/**
 * ÚNICO camino autorizado para confirmar una conciliación bancaria propuesta
 * por el motor canónico (D). Nunca escribe directo — siempre delega en
 * `confirm_bank_reconciliation_v1` vía `confirmCanonicalSuggestion`. Workspace
 * y actor se derivan del contexto de sesión server-side; nunca del body.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ suggestionId: string }> }
) {
  const { suggestionId } = await params;
  if (!UUID_RE.test(suggestionId)) {
    return NextResponse.json(
      { ok: false as const, error: "Identificador de sugerencia inválido." },
      { status: 400 }
    );
  }

  const parsed = await parseAndValidateJsonBody(request, confirmCanonicalSuggestionBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(request, "bank_movements", parsed.data as Record<string, unknown>);
  if (!auth.ok) return auth.response;

  const result = await confirmCanonicalSuggestion(auth.ctx.supabase, {
    workspaceId: auth.ctx.tenantCompanyId,
    actorUserId: auth.ctx.appUser.id,
    suggestionId,
    expectedMovementId: parsed.data.expectedMovementId,
    expectedReceiptId: parsed.data.expectedReceiptId ?? null,
    invoiceAllocations: parsed.data.invoiceAllocations ?? [],
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false as const, code: result.code, error: result.message },
      { status: ERROR_STATUS[result.code] ?? 500 }
    );
  }

  return NextResponse.json({ ok: true as const, data: result.data });
}
