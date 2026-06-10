export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { listProtoCompanies } from "@/lib/data/proto-operational-read-repository";

export type AccountStatementClientItem = {
  id: string;
  name: string;
  code?: string;
  rut?: string;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleAccess(request, "reportes");
    if (!auth.ok) return auth.response;

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json({ ok: false, error: "Sin workspace válido." }, { status: 403 });
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const companies = await listProtoCompanies(supabase, "active", tenantCompanyId);

    const clients: AccountStatementClientItem[] = companies
      .filter((c) => {
        const cid = String(c.id ?? "");
        return cid && cid !== tenantCompanyId;
      })
      .map((c) => ({
        id: String(c.id ?? ""),
        name:
          String(c.name ?? c.company_name ?? (c as Record<string, unknown>).zeta_client_name ?? "").trim() ||
          "Cliente",
        code: String((c as Record<string, unknown>).external_id ?? "").trim() || undefined,
        rut: String(c.rut ?? "").trim() || undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    return NextResponse.json({ ok: true, clients });
  } catch (err) {
    console.error("[account-statement-clients] error:", err);
    return NextResponse.json({ ok: false, error: "Error al cargar clientes." }, { status: 500 });
  }
}
