import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  buildDailyTaskPatch,
  dailyTaskUpdateBodySchema,
} from "@/lib/daily-tasks/daily-tasks-api";
import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = { params: Promise<{ id: string }> };

function invalidId() {
  return NextResponse.json(
    { ok: false as const, error: "Identificador de tarea inválido." },
    { status: 400 }
  );
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
  const patch = buildDailyTaskPatch(parsed.data, { userId: appUser.id });

  const { data, error } = await supabase
    .from("daily_tasks")
    .update(patch)
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo actualizar la tarea." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false as const, error: "Tarea no encontrada." },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true as const, data: data as DailyTask });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return invalidId();

  const auth = await requireCopilotModuleWriteAccess(request, "daily_tasks");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const { data, error } = await supabase
    .from("daily_tasks")
    .delete()
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo eliminar la tarea." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false as const, error: "Tarea no encontrada." },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true as const, data: { id } });
}
