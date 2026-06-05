import { NextRequest, NextResponse } from "next/server";

import { requireCopilotWriteContext } from "@/lib/copilot-api-auth";

type RouteContext = { params: Promise<{ id: string; aliasId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireCopilotWriteContext(request);
    if (!auth.ok) return auth.response;
    const { supabase, tenantCompanyId } = auth.ctx;

    const { id: companyId, aliasId } = await context.params;
    if (!companyId?.trim() || !aliasId?.trim()) {
      return NextResponse.json({ ok: false, error: "Parámetros requeridos." }, { status: 400 });
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
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if ("label" in o) {
      const rawLabel = typeof o.label === "string" ? o.label.trim() : "";
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
      updates.label = rawLabel;
    }

    if ("notes" in o) {
      const rawNotes =
        typeof o.notes === "string" && o.notes.trim() ? o.notes.trim() : null;
      if (rawNotes && rawNotes.length > 500) {
        return NextResponse.json(
          { ok: false, error: "Las notas no pueden superar 500 caracteres." },
          { status: 400 }
        );
      }
      updates.notes = rawNotes;
    }

    const { data: updated, error: updateErr } = await supabase
      .from("client_transfer_aliases")
      .update(updates)
      .eq("id", aliasId.trim())
      .eq("workspace_id", tenantCompanyId)
      .eq("company_id", companyId.trim())
      .select("id, label, notes, is_active, created_at, updated_at")
      .maybeSingle();

    if (updateErr) {
      if (updateErr.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "Ya existe una forma de transferencia con ese texto para este cliente." },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: "Error al actualizar el alias." }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Alias no encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, alias: updated });
  } catch {
    return NextResponse.json({ ok: false, error: "Error interno." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireCopilotWriteContext(request);
    if (!auth.ok) return auth.response;
    const { supabase, tenantCompanyId } = auth.ctx;

    const { id: companyId, aliasId } = await context.params;
    if (!companyId?.trim() || !aliasId?.trim()) {
      return NextResponse.json({ ok: false, error: "Parámetros requeridos." }, { status: 400 });
    }

    const { data: deleted, error: deleteErr } = await supabase
      .from("client_transfer_aliases")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", aliasId.trim())
      .eq("workspace_id", tenantCompanyId)
      .eq("company_id", companyId.trim())
      .eq("is_active", true)
      .select("id")
      .maybeSingle();

    if (deleteErr) {
      return NextResponse.json({ ok: false, error: "Error al eliminar el alias." }, { status: 500 });
    }
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Alias no encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Error interno." }, { status: 500 });
  }
}
