import { NextRequest, NextResponse } from "next/server";

import {
  requireCopilotTenantContext,
  requireCopilotWriteContext,
} from "@/lib/copilot-api-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) return auth.response;
    const { supabase, tenantCompanyId } = auth.ctx;

    const { id: companyId } = await context.params;
    if (!companyId?.trim()) {
      return NextResponse.json({ ok: false, error: "ID de cliente requerido." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("client_transfer_aliases")
      .select("id, label, notes, is_active, created_at, updated_at")
      .eq("workspace_id", tenantCompanyId)
      .eq("company_id", companyId.trim())
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: "Error al obtener aliases." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, aliases: data ?? [] });
  } catch {
    return NextResponse.json({ ok: false, error: "Error interno." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireCopilotWriteContext(request);
    if (!auth.ok) return auth.response;
    const { supabase, tenantCompanyId } = auth.ctx;

    const { id: companyId } = await context.params;
    if (!companyId?.trim()) {
      return NextResponse.json({ ok: false, error: "ID de cliente requerido." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Body inválido." }, { status: 400 });
    }

    if (body == null || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Body inválido." }, { status: 400 });
    }

    const o = body as Record<string, unknown>;
    const rawLabel = typeof o.label === "string" ? o.label.trim() : "";
    const rawNotes =
      typeof o.notes === "string" && o.notes.trim() ? o.notes.trim() : null;

    if (rawLabel.length < 3) {
      return NextResponse.json(
        { ok: false, error: "El texto debe tener al menos 3 caracteres." },
        { status: 400 }
      );
    }
    if (rawLabel.length > 300) {
      return NextResponse.json(
        { ok: false, error: "El texto no puede superar 300 caracteres." },
        { status: 400 }
      );
    }
    if (rawNotes && rawNotes.length > 500) {
      return NextResponse.json(
        { ok: false, error: "Las notas no pueden superar 500 caracteres." },
        { status: 400 }
      );
    }

    // Verify company belongs to workspace
    const { data: company } = await supabase
      .from("proto_companies")
      .select("id")
      .eq("id", companyId.trim())
      .eq("workspace_company_id", tenantCompanyId)
      .eq("is_active", true)
      .maybeSingle();

    if (!company) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado." },
        { status: 404 }
      );
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("client_transfer_aliases")
      .insert({
        workspace_id: tenantCompanyId,
        company_id: companyId.trim(),
        label: rawLabel,
        notes: rawNotes,
        is_active: true,
      })
      .select("id, label, notes, is_active, created_at, updated_at")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "Ya existe una forma de transferencia con ese texto para este cliente." },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: "Error al guardar el alias." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, alias: inserted }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: "Error interno." }, { status: 500 });
  }
}
