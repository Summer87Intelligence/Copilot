/**
 * GET /api/admin/zeta/resync-jobs/[id]
 *
 * Returns a single resync job with full payload and logs.
 * Auth: superadmin only. Read-only.
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";

function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCopilotTenantContext(request);
  if (!auth.ok) return auth.response;
  if (auth.ctx.appUser.role?.trim() !== "superadmin") {
    return NextResponse.json({ message: "Acceso restringido a superadmin." }, { status: 403 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ message: "Job id requerido." }, { status: 400 });

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ message: "CONFIG_ERROR" }, { status: 500 });

  const { data: job, error } = await supabase
    .from("zeta_resync_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ message: "Error al obtener job." }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ message: "Job no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ job });
}
