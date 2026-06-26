import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { isSuperAdmin } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

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
    .from("helpdesk_attachments")
    .select("*")
    .eq("ticket_id", id)
    .eq("workspace_company_id", tenantCompanyId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, attachments: data ?? [] });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const auth = await requireCopilotModuleAccess(request, "helpdesk", undefined, { minAccess: "write" });
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Form data inválido." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "No se encontró archivo." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { ok: false, message: "Tipo de archivo no permitido. Solo PNG, JPG, WebP o PDF." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { ok: false, message: "El archivo supera el límite de 10 MB." },
      { status: 400 }
    );
  }

  const admin = serviceClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Error de configuración del servidor." }, { status: 500 });
  }

  const attachmentId = crypto.randomUUID();
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `${tenantCompanyId}/${id}/${attachmentId}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { error: uploadErr } = await admin.storage
    .from("helpdesk-attachments")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ ok: false, message: `Error al subir archivo: ${uploadErr.message}` }, { status: 500 });
  }

  void ext;

  const { data: attachment, error: dbErr } = await admin
    .from("helpdesk_attachments")
    .insert({
      id: attachmentId,
      ticket_id: id,
      workspace_company_id: tenantCompanyId,
      uploaded_by: appUser.id,
      file_name: file.name,
      file_path: storagePath,
      file_type: file.type,
      file_size_bytes: file.size,
    })
    .select()
    .single();

  if (dbErr) {
    await admin.storage.from("helpdesk-attachments").remove([storagePath]);
    return NextResponse.json({ ok: false, message: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, attachment }, { status: 201 });
}
