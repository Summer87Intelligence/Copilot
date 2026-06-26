import { NextRequest, NextResponse } from "next/server";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { isSuperAdmin } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const auth = await requireCopilotModuleAccess(request, "helpdesk");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const isAdmin = isSuperAdmin(appUser.role);

  const { data: ticket } = await supabase
    .from("helpdesk_tickets")
    .select("id, created_by")
    .eq("id", id)
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();

  if (!ticket) {
    return NextResponse.json({ ok: false, message: "Ticket no encontrado." }, { status: 404 });
  }
  const t = ticket as { id: string; created_by: string };
  if (!isAdmin && t.created_by !== appUser.id) {
    return NextResponse.json({ ok: false, message: "Sin acceso." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("helpdesk_comments")
    .select("*, created_by_user:app_users!helpdesk_comments_created_by_fkey(full_name)")
    .eq("ticket_id", id)
    .eq("workspace_company_id", tenantCompanyId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const comments = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const user = row["created_by_user"] as { full_name?: string } | null;
    return {
      id: String(row["id"]),
      ticket_id: String(row["ticket_id"]),
      workspace_company_id: String(row["workspace_company_id"]),
      created_by: String(row["created_by"]),
      body: String(row["body"]),
      created_at: String(row["created_at"]),
      created_by_name: user?.full_name ?? undefined,
    };
  });

  return NextResponse.json({ ok: true, comments });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
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
  const b = body as Record<string, unknown>;
  const bodyText = typeof b["body"] === "string" ? b["body"].trim() : "";

  if (!bodyText) {
    return NextResponse.json({ ok: false, message: "El comentario no puede estar vacío." }, { status: 400 });
  }

  const { data: ticket } = await supabase
    .from("helpdesk_tickets")
    .select("id, created_by")
    .eq("id", id)
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();

  if (!ticket) {
    return NextResponse.json({ ok: false, message: "Ticket no encontrado." }, { status: 404 });
  }
  const t = ticket as { id: string; created_by: string };
  if (!isAdmin && t.created_by !== appUser.id) {
    return NextResponse.json({ ok: false, message: "Sin acceso." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("helpdesk_comments")
    .insert({
      ticket_id: id,
      workspace_company_id: tenantCompanyId,
      created_by: appUser.id,
      body: bodyText,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, comment: data }, { status: 201 });
}
