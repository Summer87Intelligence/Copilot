/**
 * POST /api/admin/zeta/resync-jobs/[id]/cancel
 *
 * Cancels a pending or running job by marking it as failed.
 * Does NOT delete the job — record is preserved for audit.
 *
 * Only cancels pending/running jobs. Completed/dead_letter jobs
 * are final and cannot be cancelled.
 *
 * Auth: superadmin only.
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

const CANCELLABLE_STATUSES = new Set(["pending", "running"]);

export async function POST(
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

  const { data: job, error: fetchErr } = await supabase
    .from("zeta_resync_jobs")
    .select("id,status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !job) {
    return NextResponse.json({ message: "Job no encontrado." }, { status: 404 });
  }

  if (!CANCELLABLE_STATUSES.has(job.status as string)) {
    return NextResponse.json(
      { message: `Solo se pueden cancelar jobs en estado pending o running. Estado actual: ${job.status}` },
      { status: 409 }
    );
  }

  const cancelledBy = auth.ctx.appUser.id ?? "unknown";
  const { error: updateErr } = await supabase
    .from("zeta_resync_jobs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_summary: `Cancelled manually by ${cancelledBy}`,
    })
    .eq("id", id)
    .in("status", ["pending", "running"]); // concurrency guard

  if (updateErr) {
    console.error(JSON.stringify({ source: "admin-resync-cancel", kind: "update_error", id, error: updateErr.message }));
    return NextResponse.json({ message: "Error al cancelar job." }, { status: 500 });
  }

  console.info(
    JSON.stringify({
      source: "admin-resync-cancel",
      kind: "job_cancelled",
      id,
      cancelled_by: cancelledBy,
    })
  );

  return NextResponse.json({ ok: true, id, new_status: "failed" });
}
