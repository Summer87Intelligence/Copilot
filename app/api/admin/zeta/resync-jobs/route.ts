/**
 * GET /api/admin/zeta/resync-jobs
 *
 * Lists resync jobs with optional filters.
 * Query params:
 *   - workspace_id (optional)
 *   - status: pending|running|failed|dead_letter|completed (optional)
 *   - limit: number (default 50, max 200)
 *
 * Auth: superadmin only.
 * Read-only. No mutations.
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

const ALLOWED_STATUSES = new Set(["pending", "running", "completed", "failed", "skipped", "dead_letter"]);

export async function GET(request: NextRequest) {
  const auth = await requireCopilotTenantContext(request);
  if (!auth.ok) return auth.response;
  if (auth.ctx.appUser.role?.trim() !== "superadmin") {
    return NextResponse.json({ message: "Acceso restringido a superadmin." }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ message: "CONFIG_ERROR" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspace_id");
  const status = searchParams.get("status");
  const rawLimit = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);

  let query = supabase
    .from("zeta_resync_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (workspaceId) query = query.eq("workspace_company_id", workspaceId);
  if (status && ALLOWED_STATUSES.has(status)) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error(JSON.stringify({ source: "admin-resync-jobs-api", kind: "list_error", error: error.message }));
    return NextResponse.json({ message: "Error al listar jobs." }, { status: 500 });
  }

  return NextResponse.json({ jobs: data ?? [], total: (data ?? []).length });
}
