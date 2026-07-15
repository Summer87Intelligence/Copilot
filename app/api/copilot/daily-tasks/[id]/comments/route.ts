import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import {
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import { taskCommentBodySchema, type TaskComment } from "@/lib/tasks/task-comments";
import { commentEntry, recordTaskHistory } from "@/lib/tasks/task-history";
import { hydrateTaskRow, isMissingTableError } from "@/lib/tasks/task-row";
import { buildTaskViewer } from "@/lib/tasks/task-viewer.server";
import { canViewTask } from "@/lib/tasks/task-visibility";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = { params: Promise<{ id: string }> };

function invalidId() {
  return NextResponse.json(
    { ok: false as const, error: "Identificador de tarea inválido." },
    { status: 400 }
  );
}
function notFound() {
  return NextResponse.json({ ok: false as const, error: "Tarea no encontrada." }, { status: 404 });
}

/** Carga la tarea y confirma que el viewer puede verla (visibilidad FASE 7). */
async function loadVisibleTask(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  workspaceId: string,
  id: string,
  viewer: Awaited<ReturnType<typeof buildTaskViewer>>
) {
  const res = await supabase
    .from("daily_tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (res.error || !res.data) return null;
  const task = hydrateTaskRow(res.data as Record<string, unknown>);
  return canViewTask(task, viewer) ? task : null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return invalidId();

  const auth = await requireCopilotModuleAccess(request, "daily_tasks");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const viewer = await buildTaskViewer(supabase, appUser);

  const task = await loadVisibleTask(supabase, tenantCompanyId, id, viewer);
  if (!task) return notFound();

  const { data, error } = await supabase
    .from("task_comments")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .eq("task_id", id)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ ok: true as const, data: [] as TaskComment[], meta: { migration_pending: true } });
    }
    return NextResponse.json(
      { ok: false as const, error: "No se pudieron cargar las notas." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true as const, data: (data ?? []) as TaskComment[] });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return invalidId();

  const parsed = await parseAndValidateJsonBody(request, taskCommentBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(
    request,
    "daily_tasks",
    parsed.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const viewer = await buildTaskViewer(supabase, appUser);

  const task = await loadVisibleTask(supabase, tenantCompanyId, id, viewer);
  if (!task) return notFound();

  const { data, error } = await supabase
    .from("task_comments")
    .insert({
      workspace_id: tenantCompanyId,
      task_id: id,
      author_user_id: appUser.id,
      body: parsed.data.body.trim(),
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { ok: false as const, code: "MIGRATION_PENDING", error: "Las notas requieren aplicar la migración FASE 7." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false as const, error: "No se pudo agregar la nota." },
      { status: 500 }
    );
  }

  await recordTaskHistory(supabase, {
    workspaceId: tenantCompanyId,
    taskId: id,
    actorUserId: appUser.id,
    entries: [commentEntry()],
  });

  return NextResponse.json({ ok: true as const, data: data as TaskComment }, { status: 201 });
}
