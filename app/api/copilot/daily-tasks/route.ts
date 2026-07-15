import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import {
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import {
  canReadModule,
  isValidModuleKey,
} from "@/lib/auth/module-permissions";
import {
  buildDailyTaskInsert,
  dailyTaskCreateBodySchema,
} from "@/lib/daily-tasks/daily-tasks-api";
import {
  isValidDailyTaskPriority,
  isValidDailyTaskStatus,
  type DailyTask,
} from "@/lib/daily-tasks/daily-tasks-types";
import { createdEntry, diffTaskChanges, recordTaskHistory } from "@/lib/tasks/task-history";
import {
  augmentWriteWithFase7,
  hydrateTaskRow,
  hydrateTaskRows,
  isMissingTableError,
  isUndefinedColumnError,
  stripFase7Columns,
} from "@/lib/tasks/task-row";
import { isTaskDueToday, isTaskOverdue } from "@/lib/tasks/task-status";
import { buildTaskViewer } from "@/lib/tasks/task-viewer.server";
import {
  canAssignToUser,
  filterVisibleTasks,
  isTaskAdmin,
  type TaskViewer,
} from "@/lib/tasks/task-visibility";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";

export const dynamic = "force-dynamic";

// ─── Filtros server-side (aplicados tras la visibilidad) ──────────────────────

function isAutomatic(task: DailyTask): boolean {
  return !!task.task_key || task.source_type === "auto";
}

function matchesAssignment(task: DailyTask, assignment: string, viewerId: string): boolean {
  switch (assignment) {
    case "mine":
      return task.assigned_to_user_id === viewerId;
    case "unassigned":
      return !task.assigned_to_user_id;
    default:
      return true;
  }
}

function applyListFilters(
  tasks: DailyTask[],
  params: URLSearchParams,
  viewer: TaskViewer,
  todayYmd: string
): DailyTask[] {
  const assignment = params.get("assignment") ?? "all";
  const overdueOnly = params.get("overdue") === "true";
  const dueToday = params.get("due") === "today";
  const source = params.get("source"); // manual | automatic
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const assignee = params.get("assignee"); // uuid explícito (admin)

  return tasks.filter((task) => {
    if (!matchesAssignment(task, assignment, viewer.userId)) return false;
    if (assignee && task.assigned_to_user_id !== assignee) return false;
    if (overdueOnly && !isTaskOverdue(task, todayYmd)) return false;
    if (dueToday && !isTaskDueToday(task, todayYmd)) return false;
    if (source === "manual" && isAutomatic(task)) return false;
    if (source === "automatic" && !isAutomatic(task)) return false;
    if (q) {
      const hay = `${task.title} ${task.description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "daily_tasks");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const params = request.nextUrl.searchParams;
  const viewer = await buildTaskViewer(supabase, appUser);

  let query = supabase
    .from("daily_tasks")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const status = params.get("status");
  if (status && status !== "all" && isValidDailyTaskStatus(status)) {
    query = query.eq("status", status);
  }
  const priority = params.get("priority");
  if (priority && priority !== "all" && isValidDailyTaskPriority(priority)) {
    query = query.eq("priority", priority);
  }
  const moduleKey = params.get("module_key");
  if (moduleKey && moduleKey !== "all") query = query.eq("module_key", moduleKey);

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({
        ok: true as const,
        data: [] as DailyTask[],
        meta: { total: 0, migration_pending: true, is_admin: isTaskAdmin(viewer), viewer_id: viewer.userId },
      });
    }
    return NextResponse.json(
      { ok: false as const, message: "No se pudieron cargar las tareas." },
      { status: 500 }
    );
  }

  const todayYmd = todayYmdMontevideo();
  const hydrated = hydrateTaskRows((data ?? []) as Record<string, unknown>[]);
  // Contrato de visibilidad FASE 7 (server-side): admin ve todo; el resto solo
  // lo permitido por módulo/asignación/creador/visibility.
  const visible = filterVisibleTasks(hydrated, viewer);
  const rows = applyListFilters(visible, params, viewer, todayYmd);

  return NextResponse.json({
    ok: true as const,
    data: rows,
    meta: {
      total: rows.length,
      migration_pending: false,
      is_admin: isTaskAdmin(viewer),
      viewer_id: viewer.userId,
    },
  });
}

export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, dailyTaskCreateBodySchema);
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
  const admin = isTaskAdmin(viewer);

  // Solo se puede crear una tarea en un módulo de origen que el creador pueda leer.
  if (isValidModuleKey(body.module_key) && !admin) {
    if (!canReadModule(viewer.role, viewer.permissions, body.module_key)) {
      return NextResponse.json(
        { ok: false as const, code: "FORBIDDEN_MODULE", message: "No tenés acceso a ese módulo." },
        { status: 403 }
      );
    }
  }

  const assignedTo = body.assigned_to_user_id ?? null;
  if (!canAssignToUser(viewer, assignedTo)) {
    return NextResponse.json(
      { ok: false as const, code: "FORBIDDEN_ASSIGN", message: "No podés asignar a otro usuario." },
      { status: 403 }
    );
  }

  if (body.priority === "critical" && !admin) {
    return NextResponse.json(
      {
        ok: false as const,
        code: "FORBIDDEN_PRIORITY",
        message: "Solo un administrador puede crear una tarea crítica.",
      },
      { status: 403 }
    );
  }

  const base = buildDailyTaskInsert(body, tenantCompanyId);
  const insert = augmentWriteWithFase7(base, {
    createdByUserId: appUser.id,
    visibility: body.visibility ?? "workspace",
  });

  let res = await supabase.from("daily_tasks").insert(insert).select("*").single();
  if (res.error && isUndefinedColumnError(res.error)) {
    // Migración FASE 7 aún no aplicada: reintentar sin columnas nuevas
    // (los valores sobreviven espejados en metadata).
    res = await supabase.from("daily_tasks").insert(stripFase7Columns(insert)).select("*").single();
  }
  if (res.error || !res.data) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo crear la tarea." },
      { status: 500 }
    );
  }

  const created = hydrateTaskRow(res.data as Record<string, unknown>);
  await recordTaskHistory(supabase, {
    workspaceId: tenantCompanyId,
    taskId: created.id,
    actorUserId: appUser.id,
    entries: [
      createdEntry(),
      ...diffTaskChanges({}, { assigned_to_user_id: created.assigned_to_user_id }),
    ],
  });

  return NextResponse.json({ ok: true as const, data: created }, { status: 201 });
}
