import { NextRequest, NextResponse } from "next/server";

import {
  loadEffectiveModulePermissionsForAppUser,
  requireCopilotModuleAccess,
} from "@/lib/auth/copilot-module-api-auth";
import { canReadModule, isValidModuleKey } from "@/lib/auth/module-permissions";
import {
  isValidDailyTaskPriority,
  isValidDailyTaskStatus,
  type DailyTask,
} from "@/lib/daily-tasks/daily-tasks-types";

export const dynamic = "force-dynamic";

const TABLE_MISSING_CODE = "42P01";

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "daily_tasks");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const params = request.nextUrl.searchParams;

  let query = supabase
    .from("daily_tasks")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(300);

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
  if (params.get("mine") === "true") {
    query = query.eq("assigned_to_user_id", appUser.id);
  }

  const { data, error } = await query;

  if (error) {
    if (error.code === TABLE_MISSING_CODE) {
      return NextResponse.json({
        ok: true as const,
        data: [] as DailyTask[],
        meta: { total: 0, migration_pending: true },
      });
    }
    return NextResponse.json(
      { ok: false as const, message: "No se pudieron cargar las tareas." },
      { status: 500 }
    );
  }

  // Cada usuario solo ve tareas de módulos que puede leer según sus permisos.
  const effective = await loadEffectiveModulePermissionsForAppUser(supabase, appUser);
  const role = String(appUser.role ?? "");
  const rows = ((data ?? []) as DailyTask[]).filter((task) => {
    if (!isValidModuleKey(task.module_key)) return true;
    return canReadModule(role, effective, task.module_key);
  });

  return NextResponse.json({
    ok: true as const,
    data: rows,
    meta: { total: rows.length, migration_pending: false },
  });
}
