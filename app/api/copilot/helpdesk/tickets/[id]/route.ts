import { NextRequest, NextResponse } from "next/server";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { isValidStatus, isValidPriority, type HelpdeskTicket } from "@/lib/helpdesk-types";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const auth = await requireCopilotModuleAccess(request, "helpdesk");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const isAdmin = isSuperAdmin(appUser.role);

  const { data, error } = await supabase
    .from("helpdesk_tickets")
    .select("*, created_by_user:app_users!helpdesk_tickets_created_by_fkey(full_name), assigned_to_user:app_users!helpdesk_tickets_assigned_to_fkey(full_name)")
    .eq("id", id)
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, message: "Ticket no encontrado." }, { status: 404 });
  }

  const row = data as Record<string, unknown>;
  if (!isAdmin && String(row["created_by"]) !== appUser.id) {
    return NextResponse.json({ ok: false, message: "Sin acceso a este ticket." }, { status: 403 });
  }

  const createdUser = row["created_by_user"] as { full_name?: string } | null;
  const assignedUser = row["assigned_to_user"] as { full_name?: string } | null;

  const ticket: HelpdeskTicket = {
    id: String(row["id"]),
    workspace_company_id: String(row["workspace_company_id"]),
    created_by: String(row["created_by"]),
    assigned_to: row["assigned_to"] ? String(row["assigned_to"]) : null,
    title: String(row["title"]),
    description: String(row["description"]),
    type: row["type"] as HelpdeskTicket["type"],
    module_key: row["module_key"] ? (row["module_key"] as HelpdeskTicket["module_key"]) : null,
    priority: row["priority"] as HelpdeskTicket["priority"],
    status: row["status"] as HelpdeskTicket["status"],
    resolution_note: row["resolution_note"] ? String(row["resolution_note"]) : null,
    created_at: String(row["created_at"]),
    updated_at: String(row["updated_at"]),
    resolved_at: row["resolved_at"] ? String(row["resolved_at"]) : null,
    created_by_name: createdUser?.full_name ?? undefined,
    assigned_to_name: assignedUser?.full_name ?? undefined,
  };

  return NextResponse.json({ ok: true, ticket });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Cuerpo inválido." }, { status: 400 });
  }

  const auth = await requireCopilotModuleAccess(request, "helpdesk", body, { minAccess: "write" });
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const isAdmin = isSuperAdmin(appUser.role);

  if (!isAdmin) {
    return NextResponse.json(
      { ok: false, message: "Solo administradores pueden actualizar tickets." },
      { status: 403 }
    );
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("helpdesk_tickets")
    .select("id, status")
    .eq("id", id)
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ ok: false, message: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, message: "Ticket no encontrado." }, { status: 404 });
  }

  const b = body as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("status" in b) {
    if (!isValidStatus(b["status"])) {
      return NextResponse.json({ ok: false, message: "Estado inválido." }, { status: 400 });
    }
    patch["status"] = b["status"];
    if (b["status"] === "resolved" || b["status"] === "rejected" || b["status"] === "published") {
      patch["resolved_at"] = new Date().toISOString();
    }
  }

  if ("priority" in b) {
    if (!isValidPriority(b["priority"])) {
      return NextResponse.json({ ok: false, message: "Prioridad inválida." }, { status: 400 });
    }
    patch["priority"] = b["priority"];
  }

  if ("assigned_to" in b) {
    patch["assigned_to"] = b["assigned_to"] ?? null;
  }

  if ("resolution_note" in b) {
    const note = b["resolution_note"];
    if (note === null || note === undefined) {
      patch["resolution_note"] = null;
    } else if (typeof note === "string") {
      const trimmed = note.trim().slice(0, 2000);
      patch["resolution_note"] = trimmed || null;
    }
  }

  const { data, error } = await supabase
    .from("helpdesk_tickets")
    .update(patch)
    .eq("id", id)
    .eq("workspace_company_id", tenantCompanyId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ticket: data });
}
