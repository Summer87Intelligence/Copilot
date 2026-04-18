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

/** Slug: minúsculas, espacios → guión, sin guiones duplicados ni extremos. */
function normalizeSlugFromString(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/\s+/g, "-");
  s = s.replace(/-+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  return s;
}

/**
 * POST /api/admin/companies/create
 * Alta de workspace en `public.companies`; solo `superadmin`.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: "El cuerpo debe ser JSON válido." },
        { status: 400 }
      );
    }

    const auth = await requireCopilotTenantContext(request, body);
    if (!auth.ok) {
      return auth.response;
    }

    if (auth.ctx.appUser.role?.trim() !== "superadmin") {
      return NextResponse.json(
        { message: "Solo los superadministradores pueden crear empresas." },
        { status: 403 }
      );
    }

    if (body == null || typeof body !== "object") {
      return NextResponse.json(
        { message: "Solicitud inválida." },
        { status: 400 }
      );
    }

    const o = body as Record<string, unknown>;
    const nameRaw = o.name;
    if (typeof nameRaw !== "string") {
      return NextResponse.json(
        { message: "El nombre es obligatorio." },
        { status: 400 }
      );
    }

    const name = nameRaw.trim();
    if (!name) {
      return NextResponse.json(
        { message: "El nombre es obligatorio." },
        { status: 400 }
      );
    }

    const slugSource =
      typeof o.slug === "string" && o.slug.trim() !== ""
        ? o.slug
        : name;

    const slug = normalizeSlugFromString(slugSource);
    if (!slug) {
      return NextResponse.json(
        { message: "El slug resultante no es válido." },
        { status: 400 }
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
      .insert({ name, slug })
      .select("id, name, slug, created_at")
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { message: "No se pudo crear la empresa." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true as const,
      company: {
        id: data.id,
        name: data.name,
        slug: data.slug,
        created_at: data.created_at,
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Ocurrió un error inesperado." },
      { status: 500 }
    );
  }
}
