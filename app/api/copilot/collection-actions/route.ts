/**
 * GET /api/copilot/collection-actions
 *
 * Lista acciones de cobranza para el workspace autenticado.
 * Filtros opcionales: ?company_id=<uuid>&status=<status>&priority=<priority>
 *
 * Read-only. No modifica datos financieros.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import {
  collectionGetByCompany,
  collectionGetByWorkspace,
} from "@/lib/copilot-collection-service";
import {
  COLLECTION_STATUSES,
  COLLECTION_PRIORITIES,
  type CollectionAction,
} from "@/lib/copilot-collection-types";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotTenantContext(request);
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const params = request.nextUrl.searchParams;

  const companyId = params.get("company_id")?.trim() ?? "";
  const statusParam = params.get("status")?.trim() ?? "";
  const priorityParam = params.get("priority")?.trim() ?? "";

  const status =
    statusParam && (COLLECTION_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as CollectionAction["status"])
      : undefined;

  const priority =
    priorityParam && (COLLECTION_PRIORITIES as readonly string[]).includes(priorityParam)
      ? (priorityParam as CollectionAction["priority"])
      : undefined;

  let actions: CollectionAction[];

  if (companyId) {
    actions = await collectionGetByCompany(supabase, companyId, tenantCompanyId);
  } else {
    actions = await collectionGetByWorkspace(supabase, tenantCompanyId, {
      status,
      priority,
    });
  }

  return NextResponse.json({ ok: true, actions, count: actions.length });
}
