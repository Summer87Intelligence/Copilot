import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  buildDailyTaskPatch,
  dailyTaskUpdateBodySchema,
} from "@/lib/daily-tasks/daily-tasks-api";
import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";
import { diffTaskChanges, recordTaskHistory } from "@/lib/tasks/task-history";
import {
  hydrateTaskRow,
  isUndefinedColumnError,
  stripFase7Columns,
} from "@/lib/tasks/task-row";
import { canTransition } from "@/lib/tasks/task-status";
import { buildTaskViewer } from "@/lib/tasks/task-viewer.server";
import {
  canDeleteTask,
  canEditTask,
  canViewTask,
  guardNonAdminPatch,
} from "@/lib/tasks/task-visibility";

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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return invalidId();

  const parsed = await parseAndValidateJsonBody(request, dailyTaskUpdateBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(
    request,
    "daily_tasks",
    parsed.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const viewer = await buildTaskViewer(supabase, appUser);
  const body = parsed.data;

  // 1. Cargar la tarea existente para validar permisos, transición e historial.
  const existingRes = await supabase
    .from("daily_tasks")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .maybeSingle();

  if (existingRes.error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo cargar la tarea." },
      { status: 500 }
    );
  }
  if (!existingRes.data) return notFound();

  const existing = hydrateTaskRow(existingRes.data as Record<string, unknown>);

  // 2. Permisos de edición. 404 si ni siquiera la puede ver (no revelar existencia).
  if (!canEditTask(existing, viewer)) {
    if (canViewTask(existing, viewer)) {
      return NextResponse.json(
        { ok: false as const, code: "FORBIDDEN_TASK", error: "No podés modificar esta tarea." },
        { status: 403 }
      );
    }
    return notFound();
  }

  // 3. Guardas de campo para no-admin (campos permitidos, no critical, no reasignar).
  const fields = Object.keys(body).filter((k) => k !== "workspace_id");
  const guard = guardNonAdminPatch(viewer, {
    fields,
    priority: body.priority,
    hasAssignment: "assigned_to_user_id" in body,
    assignedToUserId: body.assigned_to_user_id ?? null,
  });
  if (!guard.ok) {
    return NextResponse.json(
      { ok: false as const, code: guard.code, error: guard.message },
      { status: 403 }
    );
  }

  // 4. Transición de estado válida.
  if (body.status !== undefined && !canTransition(existing.status, body.status)) {
    return NextResponse.json(
      {
        ok: false as const,
        code: "INVALID_TRANSITION",
        error: `No se puede pasar de "${existing.status}" a "${body.status}".`,
      },
      { status: 400 }
    );
  }

  const patch = buildDailyTaskPatch(body, { userId: appUser.id });

  let res = await supabase
    .from("daily_tasks")
    .update(patch)
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (res.error && isUndefinedColumnError(res.error)) {
    res = await supabase
      .from("daily_tasks")
      .update(stripFase7Columns(patch))
      .eq("workspace_id", tenantCompanyId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
  }

  if (res.error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo actualizar la tarea." },
      { status: 500 }
    );
  }
  if (!res.data) return notFound();

  const updated = hydrateTaskRow(res.data as Record<string, unknown>);
  await recordTaskHistory(supabase, {
    workspaceId: tenantCompanyId,
    taskId: id,
    actorUserId: appUser.id,
    entries: diffTaskChanges(existing as Partial<DailyTask>, updated as Partial<DailyTask>),
  });

  return NextResponse.json({ ok: true as const, data: updated });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return invalidId();

  const auth = await requireCopilotModuleWriteAccess(request, "daily_tasks");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const viewer = await buildTaskViewer(supabase, appUser);

  const existingRes = await supabase
    .from("daily_tasks")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .maybeSingle();

  if (existingRes.error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo cargar la tarea." },
      { status: 500 }
    );
  }
  if (!existingRes.data) return notFound();

  const existing = hydrateTaskRow(existingRes.data as Record<string, unknown>);
  if (!canDeleteTask(existing, viewer)) {
    if (canViewTask(existing, viewer)) {
      return NextResponse.json(
        { ok: false as const, code: "FORBIDDEN_TASK", error: "No podés eliminar esta tarea." },
        { status: 403 }
      );
    }
    return notFound();
  }

  const { error } = await supabase
    .from("daily_tasks")
    .delete()
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo eliminar la tarea." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true as const, data: { id } });
}
