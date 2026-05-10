import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import type { CopilotDatasetPayload } from "@/lib/copilot-dataset-types";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import type { ProtoActiveListMode } from "@/lib/copilot-proto-active";
import {
  listProtoCompanies,
  listProtoContacts,
  listProtoInvoices,
  listProtoPayments,
  listProtoReceipts,
  listProtoRawImports,
  listProtoTaxObligations,
  listProtoTaxPayments,
} from "@/lib/data/proto-operational-read-repository";

function parseActiveMode(v: string | null): ProtoActiveListMode {
  if (v === "inactive" || v === "all") return v;
  return "active";
}

function activeModeToFilterLabel(active: ProtoActiveListMode): string {
  if (active === "active") return "is_active = true";
  if (active === "inactive") return "is_active = false";
  return "sin filtro is_active";
}

/**
 * GET /api/copilot/dataset?active=active|inactive|all
 * Lectura tenant-scoped: tablas operativas con cliente SSR (JWT) o service role según sesión.
 * `proto_raw_imports` se lee siempre con `auth.ctx.supabase` (service_role); no usa RLS tenant ni JWT.
 */
export async function GET(request: NextRequest) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant_dataset" });
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
    const supabase =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    const active = parseActiveMode(request.nextUrl.searchParams.get("active"));

    const [
      companies,
      contacts,
      invoices,
      receipts,
      payments,
      obligations,
      taxPayments,
    ] = await Promise.all([
      listProtoCompanies(supabase, active, tenantCompanyId),
      listProtoContacts(supabase, active, tenantCompanyId),
      listProtoInvoices(supabase, active, tenantCompanyId),
      listProtoReceipts(supabase, active, tenantCompanyId),
      listProtoPayments(supabase, active, tenantCompanyId),
      listProtoTaxObligations(supabase, active, tenantCompanyId),
      listProtoTaxPayments(supabase, active, tenantCompanyId),
    ]);

    const rawImports = await listProtoRawImports(
      auth.ctx.supabase,
      active,
      tenantCompanyId
    );

    const data: CopilotDatasetPayload = {
      companies,
      contacts,
      invoices,
      receipts,
      payments,
      obligations,
      taxPayments,
      rawImports,
    };

    const invoiceSample = invoices.slice(0, 3).map((r) => ({
      id: String(r.id ?? ""),
      invoice_number: String(r.invoice_number ?? ""),
      workspace_company_id: String(r.workspace_company_id ?? ""),
      company_id: String(r.company_id ?? ""),
      is_active: r.is_active ?? null,
      issue_date: String(r.issue_date ?? ""),
    }));
    log.debug("copilot_dataset_invoices_loaded", {
      table: "proto_invoices",
      active_mode: active,
      active_filter: activeModeToFilterLabel(active),
      invoices_count: invoices.length,
    });

    return NextResponse.json({ ok: true as const, data });
  } catch (e) {
    log.error("copilot_dataset_failed", e, { route: "GET /api/copilot/dataset" });
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, code: "UNEXPECTED", error: message },
      { status: 500 }
    );
  }
}
