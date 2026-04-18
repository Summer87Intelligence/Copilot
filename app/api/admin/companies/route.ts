import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";

/**
 * Cliente Supabase con service role: solo para uso server-side tras validar superadmin.
 * Bypass RLS; nunca exponer la clave al cliente (env sin prefijo NEXT_PUBLIC_*).
 */
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

/**
 * GET /api/admin/companies
 * Lista empresas (workspace SaaS) para panel admin; solo `role === 'superadmin'`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      return auth.response;
    }

    if (auth.ctx.appUser.role?.trim() !== "superadmin") {
      return NextResponse.json(
        { message: "Solo los superadministradores pueden listar empresas." },
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
      .from("companies")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ companies: data ?? [] });
  } catch {
    return NextResponse.json(
      { message: "Ocurrió un error inesperado." },
      { status: 500 }
    );
  }
}
