/**
 * POST /api/admin/zeta/resync-jobs/[id]/retry
 *
 * Manually retries a dead_letter or failed job.
 * Resets status to pending, clears errors, keeps retry_count.
 *
 * Auth: superadmin only.
 * Safe: never deletes data or force-overwrites records.
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

const RETRYABLE_STATUSES = new Set(["dead_letter", "failed"]);

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

  // Fetch current state
  const { data: job, error: fetchErr } = await supabase
    .from("zeta_resync_jobs")
    .select("id,status,retry_count,max_retries")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !job) {
    return NextResponse.json({ message: "Job no encontrado." }, { status: 404 });
  }

  if (!RETRYABLE_STATUSES.has(job.status as string)) {
    return NextResponse.json(
      { message: `Solo se pueden reintentar jobs en estado failed o dead_letter. Estado actual: ${job.status}` },
      { status: 409 }
    );
  }

  const { error: updateErr } = await supabase
    .from("zeta_resync_jobs")
    .update({
      status: "pending",
      started_at: null,
      completed_at: null,
      error_summary: null,
      retry_after: null,
    })
    .eq("id", id)
    .in("status", ["dead_letter", "failed"]); // concurrency guard

  if (updateErr) {
    console.error(JSON.stringify({ source: "admin-resync-retry", kind: "update_error", id, error: updateErr.message }));
    return NextResponse.json({ message: "Error al reintentar job." }, { status: 500 });
  }

  console.info(
    JSON.stringify({
      source: "admin-resync-retry",
      kind: "job_reset_to_pending",
      id,
      triggered_by: auth.ctx.appUser.id,
    })
  );

  return NextResponse.json({ ok: true, id, new_status: "pending" });
}
