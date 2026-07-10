import { NextRequest, NextResponse } from "next/server";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import { requireCopilotModuleWriteAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  buildInteractionInsert,
  buildInteractionPatch,
  dailyTaskInteractionBodySchema,
} from "@/lib/daily-tasks/daily-tasks-interactions";
import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";

export const dynamic = "force-dynamic";

/**
 * Upsert de una interacción sobre una tarea automática, por (workspace_id, task_key).
 * No se materializan tareas automáticas: solo su estado (completada / ignorada hoy /
 * pospuesta / reabierta). Una fila por task_key gracias al índice único parcial.
 */
export async function POST(request: NextRequest) {
  const parsed = await parseAndValidateJsonBody(request, dailyTaskInteractionBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(
    request,
    "daily_tasks",
    parsed.data as Record<string, unknown>
  );
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId, appUser } = auth.ctx;

  // ¿Ya existe una fila de interacción para esta clave?
  const { data: existing, error: findError } = await supabase
    .from("daily_tasks")
    .select("id")
    .eq("workspace_id", tenantCompanyId)
    .eq("task_key", parsed.data.task_key)
    .maybeSingle();

  if (findError) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo guardar la acción." },
      { status: 500 }
    );
  }

  if (existing?.id) {
    const patch = buildInteractionPatch(parsed.data, { userId: appUser.id });
    const { data, error } = await supabase
      .from("daily_tasks")
      .update(patch)
      .eq("workspace_id", tenantCompanyId)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json(
        { ok: false as const, error: "No se pudo actualizar la acción." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true as const, data: data as DailyTask });
  }

  const insert = buildInteractionInsert(parsed.data, {
    workspaceId: tenantCompanyId,
    userId: appUser.id,
  });
  const { data, error } = await supabase
    .from("daily_tasks")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudo guardar la acción." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true as const, data: data as DailyTask }, { status: 201 });
}
