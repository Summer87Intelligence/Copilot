import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import { hydrateTaskRows, isMissingTableError } from "@/lib/tasks/task-row";
import { summarizeTasks, workloadByUser } from "@/lib/tasks/task-summary";
import { buildTaskViewer } from "@/lib/tasks/task-viewer.server";
import { filterVisibleTasks, isTaskAdmin } from "@/lib/tasks/task-visibility";

export const dynamic = "force-dynamic";

/** Inicio del período (mes en curso, Montevideo) para "completadas del período". */
function monthStart(todayYmd: string): string {
  return `${todayYmd.slice(0, 7)}-01`;
}

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "daily_tasks");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const viewer = await buildTaskViewer(supabase, appUser);
  const admin = isTaskAdmin(viewer);

  const { data, error } = await supabase
    .from("daily_tasks")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .limit(2000);

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({
        ok: true as const,
        summary: {
          pending: 0, inProgress: 0, overdue: 0, dueToday: 0,
          completedInPeriod: 0, unassigned: 0, total: 0,
        },
        workload: [],
        meta: { is_admin: admin, migration_pending: true },
      });
    }
    return NextResponse.json(
      { ok: false as const, message: "No se pudo cargar el resumen." },
      { status: 500 }
    );
  }

  const todayYmd = todayYmdMontevideo();
  const periodStartYmd = monthStart(todayYmd);
  const visible = filterVisibleTasks(
    hydrateTaskRows((data ?? []) as Record<string, unknown>[]),
    viewer
  );

  const summary = summarizeTasks(visible, { todayYmd, periodStartYmd });
  // La carga de trabajo por usuario es una vista administrativa (§21).
  const workload = admin ? workloadByUser(visible, { todayYmd, periodStartYmd }) : [];

  return NextResponse.json({
    ok: true as const,
    summary,
    workload,
    meta: { is_admin: admin, migration_pending: false },
  });
}
