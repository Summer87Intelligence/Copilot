import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { documentSellerSchema } from "@/lib/sales/sales-salesperson-write";
import { assignDocumentSeller } from "@/lib/sales/sales-document-seller-repository";

export const dynamic = "force-dynamic";

const DOCUMENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — asigna/reasigna/desasigna el
 * VENDEDOR de un documento de venta puntual. Nunca toca el ejecutivo del
 * cliente (`sales_client_salespersons`), montos, ni el comprobante en Zeta.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  if (!DOCUMENT_ID_RE.test(documentId)) {
    return NextResponse.json(
      { ok: false as const, code: "INVALID_DOCUMENT_ID", message: "documentId inválido." },
      { status: 422 }
    );
  }

  const parsed = await parseAndValidateJsonBody(request, documentSellerSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(request, "ventas", parsed.data);
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId, appUser } = auth.ctx;

  const result = await assignDocumentSeller(supabase, tenantCompanyId, appUser.id ?? null, {
    documentId,
    sellerId: parsed.data.sellerId,
  });

  if (!result.ok) {
    const status =
      result.code === "MIGRATION_PENDING"
        ? 503
        : result.code === "CREDIT_NOTE_NOT_ALLOWED" || result.code === "INACTIVE_SELLER"
          ? 422
          : result.code === "NOT_FOUND"
            ? 404
            : 500;
    return NextResponse.json(
      { ok: false as const, code: result.code, message: result.message },
      { status }
    );
  }

  return NextResponse.json(
    { ok: true as const, data: { documentId, sellerId: result.sellerId, changed: result.changed } },
    { status: 200 }
  );
}
