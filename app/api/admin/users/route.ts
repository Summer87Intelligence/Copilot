import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";

function createServiceRoleSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

type AppUserRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  company_id: string;
  created_at: string;
  companies: { name: string } | { name: string }[] | null;
};

function companyNameFromRow(row: AppUserRow): string {
  const c = row.companies;
  if (!c) return "";
  if (Array.isArray(c)) {
    return typeof c[0]?.name === "string" ? c[0].name : "";
  }
  return typeof c.name === "string" ? c.name : "";
}

/**
 * GET /api/admin/users
 * Lista usuarios de negocio con empresa; solo `superadmin`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      return auth.response;
    }

    if (auth.ctx.appUser.role?.trim() !== "superadmin") {
      return NextResponse.json(
        { message: "Solo los superadministradores pueden listar usuarios." },
        { status: 403 }
      );
    }

    const admin = createServiceRoleSupabaseClient();
    if (!admin) {
      return NextResponse.json(
        { message: "Configuración del servidor incompleta." },
        { status: 500 }
      );
    }

    const { data, error } = await admin
      .from("app_users")
      .select(
        `
        id,
        full_name,
        email,
        role,
        company_id,
        created_at,
        companies (
          name
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as AppUserRow[];
    const users = rows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      role: r.role,
      company_id: r.company_id,
      company_name: companyNameFromRow(r),
      created_at: r.created_at,
    }));

    return NextResponse.json({ users });
  } catch {
    return NextResponse.json(
      { message: "Ocurrió un error inesperado." },
      { status: 500 }
    );
  }
}
