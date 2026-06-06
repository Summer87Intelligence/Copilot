import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import {
  getDocumentById,
  getDocumentsByRelation,
  getDocumentsByRelatedTable,
  getDocumentsByType,
  listActiveProtoDocuments,
  type ProtoDocument,
} from "@/lib/data/proto-documents-repository";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

/**
 * GET /api/copilot/proto-documents
 * Lecturas de `proto_documents` con tenant obligatorio y filtro explícito `workspace_company_id`.
 *
 * Query (prioridad): `id` → documento único; `related_table`+`related_id` → por vínculo;
 * solo `related_table`; `document_type`; sin filtros → listado activo del tenant (cap en repo).
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", {
        phase: "require_copilot_tenant_proto_documents",
      });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json(
        { ok: false as const, code: "FORBIDDEN_TENANT", error: "Sin workspace válido." },
        { status: 403 }
      );
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: supabaseUserData, error: supabaseUserErr } =
      await supabaseFromCookies.auth.getUser();
    const supabaseForData =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    const sp = request.nextUrl.searchParams;
    const id = sp.get("id")?.trim() ?? "";
    const relatedTable = sp.get("related_table")?.trim() ?? "";
    const relatedId = sp.get("related_id")?.trim() ?? "";
    const documentType = sp.get("document_type")?.trim() ?? "";

    let documents: ProtoDocument[] = [];

    if (id) {
      const one = await getDocumentById(supabaseForData, id, tenantCompanyId);
      documents = one ? [one] : [];
    } else if (relatedTable && relatedId) {
      documents = await getDocumentsByRelation(
        supabaseForData,
        relatedTable,
        relatedId,
        tenantCompanyId
      );
    } else if (relatedTable) {
      documents = await getDocumentsByRelatedTable(
        supabaseForData,
        relatedTable,
        tenantCompanyId
      );
    } else if (documentType) {
      documents = await getDocumentsByType(
        supabaseForData,
        documentType,
        tenantCompanyId
      );
    } else {
      documents = await listActiveProtoDocuments(supabaseForData, tenantCompanyId);
    }

    return NextResponse.json({
      ok: true as const,
      data: { documents },
    });
  } catch (e) {
    log.error("copilot_proto_documents_failed", e, {
      route: "GET /api/copilot/proto-documents",
    });
    return copilotInternalErrorResponse({ ok: false as const, code: "UNEXPECTED" });
  }
}
