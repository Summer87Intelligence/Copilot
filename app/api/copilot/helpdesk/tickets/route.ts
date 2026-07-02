import { NextRequest, NextResponse } from "next/server";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { isSuperAdmin } from "@/lib/auth/permissions";
import {
  isValidTicketType,
  isValidPriority,
  isValidModuleKey,
  type HelpdeskTicket,
} from "@/lib/helpdesk-types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "helpdesk");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const params = request.nextUrl.searchParams;
  const isAdmin = isSuperAdmin(appUser.role);

  let query = supabase
    .from("helpdesk_tickets")
    .select("*, created_by_user:app_users!helpdesk_tickets_created_by_fkey(full_name), assigned_to_user:app_users!helpdesk_tickets_assigned_to_fkey(full_name)")
    .eq("workspace_company_id", tenantCompanyId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!isAdmin) {
    query = query.eq("created_by", appUser.id);
  }

  const status = params.get("status");
  if (status && status !== "all") query = query.eq("status", status);
  const priority = params.get("priority");
  if (priority && priority !== "all") query = query.eq("priority", priority);
  const type = params.get("type");
  if (type && type !== "all") query = query.eq("type", type);
  const module_key = params.get("module_key");
  if (module_key && module_key !== "all") query = query.eq("module_key", module_key);
  if (isAdmin) {
    const user_id = params.get("user_id");
    if (user_id) query = query.eq("created_by", user_id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  const tickets: HelpdeskTicket[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const createdUser = row["created_by_user"] as { full_name?: string } | null;
    const assignedUser = row["assigned_to_user"] as { full_name?: string } | null;
    return {
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
  });

  return NextResponse.json({ ok: true, tickets, total: tickets.length, is_admin: isAdmin });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Cuerpo inválido." }, { status: 400 });
  }

  const auth = await requireCopilotModuleAccess(request, "helpdesk", body, { minAccess: "write" });
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const b = body as Record<string, unknown>;

  const title = typeof b["title"] === "string" ? b["title"].trim() : "";
  const description = typeof b["description"] === "string" ? b["description"].trim() : "";
  const type = b["type"];
  const priority = b["priority"] ?? "medium";

  if (!title) {
    return NextResponse.json({ ok: false, message: "El título es obligatorio." }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ ok: false, message: "La descripción es obligatoria." }, { status: 400 });
  }
  if (!isValidTicketType(type)) {
    return NextResponse.json({ ok: false, message: "Tipo de ticket inválido." }, { status: 400 });
  }
  if (!isValidPriority(priority)) {
    return NextResponse.json({ ok: false, message: "Prioridad inválida." }, { status: 400 });
  }

  const module_key = b["module_key"];
  const resolvedModuleKey =
    module_key == null || module_key === "" ? null
    : isValidModuleKey(module_key) ? module_key
    : null;

  const { data, error } = await supabase
    .from("helpdesk_tickets")
    .insert({
      workspace_company_id: tenantCompanyId,
      created_by: appUser.id,
      title,
      description,
      type,
      module_key: resolvedModuleKey,
      priority,
      status: "new",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ticket: data }, { status: 201 });
}
