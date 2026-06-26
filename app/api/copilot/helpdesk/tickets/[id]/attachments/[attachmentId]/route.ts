import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { isSuperAdmin } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type RouteParams = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id, attachmentId } = await params;
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

  const { data: attachment } = await supabase
    .from("helpdesk_attachments")
    .select("file_path, file_name")
    .eq("id", attachmentId)
    .eq("ticket_id", id)
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();

  if (!attachment) {
    return NextResponse.json({ ok: false, message: "Adjunto no encontrado." }, { status: 404 });
  }

  const a = attachment as { file_path: string; file_name: string };
  const admin = serviceClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Error de configuración del servidor." }, { status: 500 });
  }

  const { data: signedUrl, error } = await admin.storage
    .from("helpdesk-attachments")
    .createSignedUrl(a.file_path, 3600);

  if (error || !signedUrl?.signedUrl) {
    return NextResponse.json({ ok: false, message: "No se pudo generar el enlace." }, { status: 500 });
  }

  return NextResponse.redirect(signedUrl.signedUrl);
}
