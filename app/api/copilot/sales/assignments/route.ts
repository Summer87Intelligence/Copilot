import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { assignmentSchema } from "@/lib/sales/sales-salesperson-write";
import { assignDocumentSeller } from "@/lib/sales/sales-document-seller-repository";

/**
 * REACTIVADO (FASE SALES-DOCUMENT-SELLER-CORRECTION-001) — Asignación de
 * VENDEDOR por documento. Estuvo deshabilitado (410 Gone) desde FASE 9E porque
 * en ese momento la atribución comercial canónica era 100% por cliente
 * (`sales_client_salespersons`) y esta tabla quedaba huérfana.
 *
 * El modelo actual separa Ejecutivo (cartera, por cliente, sin cambios) de
 * Vendedor (operación puntual, manual, por documento) — `sales_document_salespersons`
 * es ahora la fuente real de vendedor y SÍ participa de analytics (Detalle,
 * tab Vendedores). Contrato equivalente al nuevo endpoint canónico
 * `PUT /api/copilot/sales/documents/[documentId]/seller`; se mantiene este
 * path por compatibilidad con integraciones existentes.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, assignmentSchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(request, "ventas", parsed.data);
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId, appUser } = auth.ctx;

  const result = await assignDocumentSeller(supabase, tenantCompanyId, appUser.id ?? null, {
    documentId: parsed.data.documentId,
    sellerId: parsed.data.salespersonId,
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
    {
      ok: true as const,
      data: { documentId: parsed.data.documentId, salespersonId: result.sellerId, changed: result.changed },
    },
    { status: 200 }
  );
}
