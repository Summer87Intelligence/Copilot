import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { resolveAssigneeDisplayNames } from "@/lib/data/decision-operational-state-repository";
import { hydrateTaskRow, isMissingTableError } from "@/lib/tasks/task-row";
import { buildTaskViewer } from "@/lib/tasks/task-viewer.server";
import { canViewTask } from "@/lib/tasks/task-visibility";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELETED_USER_LABEL = "Usuario eliminado";
const UNASSIGNED_LABEL = "Sin asignar";

type RouteParams = { params: Promise<{ id: string }> };

export type TaskHistoryRow = {
  id: string;
  task_id: string;
  actor_user_id: string | null;
  actor_name: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

function collectHistoryUserIds(rows: TaskHistoryRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.actor_user_id) ids.add(row.actor_user_id);
    if (row.field === "assigned_to_user_id") {
      if (row.old_value && UUID_RE.test(row.old_value)) ids.add(row.old_value);
      if (row.new_value && UUID_RE.test(row.new_value)) ids.add(row.new_value);
    }
  }
  return [...ids];
}

function userLabel(id: string | null, names: Map<string, string>, emptyLabel: string): string {
  if (!id) return emptyLabel;
  return names.get(id) ?? DELETED_USER_LABEL;
}

function assignedValueLabel(value: string | null, names: Map<string, string>): string | null {
  if (!value) return UNASSIGNED_LABEL;
  if (!UUID_RE.test(value)) return value;
  return names.get(value) ?? DELETED_USER_LABEL;
}

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

  const rows = (data ?? []) as TaskHistoryRow[];
  const userNames = await resolveAssigneeDisplayNames(
    supabase,
    tenantCompanyId,
    collectHistoryUserIds(rows)
  );
  const hydrated = rows.map((row) => ({
    ...row,
    actor_name: userLabel(row.actor_user_id, userNames, DELETED_USER_LABEL),
    old_value: row.field === "assigned_to_user_id" ? assignedValueLabel(row.old_value, userNames) : row.old_value,
    new_value: row.field === "assigned_to_user_id" ? assignedValueLabel(row.new_value, userNames) : row.new_value,
  }));

  return NextResponse.json({ ok: true as const, data: hydrated });
}
