import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProtoCountTable =
  | "proto_companies"
  | "proto_invoices"
  | "proto_receipts"
  | "proto_payments"
  | "proto_tax_obligations"
  | "proto_contacts";

async function countActiveWorkspaceRows(
  client: SupabaseClient,
  table: ProtoCountTable,
  workspaceCompanyId: string
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * GET /api/copilot/dev-dataset-summary
 * Solo `development`: conteos activos por tabla filtrados por `workspace_company_id` del tenant autenticado.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "require_copilot_tenant_dev_dataset" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const workspaceCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!workspaceCompanyId) {
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

    let activeCompanyName: string | null = null;
    const { data: compRow } = await supabaseForData
      .from("companies")
      .select("name")
      .eq("id", workspaceCompanyId)
      .maybeSingle();
    if (compRow && typeof (compRow as { name?: unknown }).name === "string") {
      const n = String((compRow as { name: string }).name).trim();
      activeCompanyName = n || null;
    }

    const [
      proto_companies,
      proto_invoices,
      proto_receipts,
      proto_payments,
      proto_tax_obligations,
      proto_contacts,
    ] = await Promise.all([
      countActiveWorkspaceRows(supabaseForData, "proto_companies", workspaceCompanyId),
      countActiveWorkspaceRows(supabaseForData, "proto_invoices", workspaceCompanyId),
      countActiveWorkspaceRows(supabaseForData, "proto_receipts", workspaceCompanyId),
      countActiveWorkspaceRows(supabaseForData, "proto_payments", workspaceCompanyId),
      countActiveWorkspaceRows(supabaseForData, "proto_tax_obligations", workspaceCompanyId),
      countActiveWorkspaceRows(supabaseForData, "proto_contacts", workspaceCompanyId),
    ]);

    return NextResponse.json({
      ok: true as const,
      active_company_name: activeCompanyName,
      workspace_company_id: workspaceCompanyId,
      counts: {
        proto_companies,
        proto_invoices,
        proto_receipts,
        proto_payments,
        proto_tax_obligations,
        proto_contacts,
      },
      computedAt: new Date().toISOString(),
    });
  } catch (e) {
    log.error("copilot_dev_dataset_summary_failed", e, {
      route: "GET /api/copilot/dev-dataset-summary",
    });
    const message = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json(
      { ok: false as const, error: message },
      { status: 500 }
    );
  }
}
