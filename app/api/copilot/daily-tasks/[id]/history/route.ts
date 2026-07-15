import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { hydrateTaskRow, isMissingTableError } from "@/lib/tasks/task-row";
import { buildTaskViewer } from "@/lib/tasks/task-viewer.server";
import { canViewTask } from "@/lib/tasks/task-visibility";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = { params: Promise<{ id: string }> };

export type TaskHistoryRow = {
  id: string;
  task_id: string;
  actor_user_id: string | null;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false as const, error: "Identificador inválido." }, { status: 400 });
  }

  const auth = await requireCopilotModuleAccess(request, "daily_tasks");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const viewer = await buildTaskViewer(supabase, appUser);

  const taskRes = await supabase
    .from("daily_tasks")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .maybeSingle();
  if (taskRes.error || !taskRes.data) {
    return NextResponse.json({ ok: false as const, error: "Tarea no encontrada." }, { status: 404 });
  }
  const task = hydrateTaskRow(taskRes.data as Record<string, unknown>);
  if (!canViewTask(task, viewer)) {
    return NextResponse.json({ ok: false as const, error: "Tarea no encontrada." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("task_history")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .eq("task_id", id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ ok: true as const, data: [] as TaskHistoryRow[], meta: { migration_pending: true } });
    }
    return NextResponse.json(
      { ok: false as const, error: "No se pudo cargar el historial." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true as const, data: (data ?? []) as TaskHistoryRow[] });
}
