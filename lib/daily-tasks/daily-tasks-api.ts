/**
 * Contratos de escritura del módulo Tareas diarias (Sprint B).
 * Schemas Zod + builders puros para insert/patch. El workspace_id nunca viene
 * del cliente; lo fija el servidor. Completar/reabrir sella completed_at/by.
 */
import { z } from "zod";

import { MODULE_KEYS } from "@/lib/auth/module-permissions";
import {
  DAILY_TASK_PRIORITIES,
  DAILY_TASK_STATUSES,
  DAILY_TASK_VISIBILITIES,
} from "@/lib/daily-tasks/daily-tasks-types";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD).");
const optionalNullableString = z.union([z.string(), z.null()]).optional();
const optionalNullableUuid = z.union([z.string().uuid(), z.null()]).optional();
const optionalNullableYmd = z.union([ymd, z.null()]).optional();
const optionalMetadata = z.record(z.string(), z.unknown()).nullable().optional();
const rejectWorkspaceId = z.never().optional();

export const dailyTaskCreateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    assigned_to_user_id: optionalNullableUuid,
    title: z.string().trim().min(1).max(200),
    description: optionalNullableString,
    module_key: z.enum(MODULE_KEYS),
    source_type: optionalNullableString,
    source_id: optionalNullableUuid,
    priority: z.enum(DAILY_TASK_PRIORITIES).optional(),
    status: z.enum(DAILY_TASK_STATUSES).optional(),
    visibility: z.enum(DAILY_TASK_VISIBILITIES).optional(),
    due_date: optionalNullableYmd,
    action_url: optionalNullableString,
    metadata: optionalMetadata,
  })
  .strict();

export const dailyTaskUpdateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    assigned_to_user_id: optionalNullableUuid,
    title: z.string().trim().min(1).max(200).optional(),
    description: optionalNullableString,
    module_key: z.enum(MODULE_KEYS).optional(),
    priority: z.enum(DAILY_TASK_PRIORITIES).optional(),
    status: z.enum(DAILY_TASK_STATUSES).optional(),
    visibility: z.enum(DAILY_TASK_VISIBILITIES).optional(),
    due_date: optionalNullableYmd,
    action_url: optionalNullableString,
    metadata: optionalMetadata,
  })
  .strict()
  .refine((o) => Object.keys(o).some((k) => k !== "workspace_id"), {
    message: "Enviá al menos un campo para actualizar.",
  });

export type DailyTaskCreateBody = z.infer<typeof dailyTaskCreateBodySchema>;
export type DailyTaskUpdateBody = z.infer<typeof dailyTaskUpdateBodySchema>;

/** Fila lista para insertar. workspace_id lo impone el servidor. */
export function buildDailyTaskInsert(
  body: DailyTaskCreateBody,
  workspaceId: string
): Record<string, unknown> {
  return {
    workspace_id: workspaceId,
    assigned_to_user_id: body.assigned_to_user_id ?? null,
    title: body.title.trim(),
    description: body.description?.trim() || null,
    module_key: body.module_key,
    source_type: body.source_type ?? null,
    source_id: body.source_id ?? null,
    priority: body.priority ?? "medium",
    status: body.status ?? "pending",
    due_date: body.due_date ?? null,
    action_url: body.action_url ?? null,
    metadata: body.metadata ?? {},
  };
}

/**
 * Patch parcial. Completar (status='done') sella completed_at/completed_by;
 * reabrir (pending/in_progress) los limpia.
 */
export function buildDailyTaskPatch(
  body: DailyTaskUpdateBody,
  opts: { userId: string; now?: Date }
): Record<string, unknown> {
  const now = (opts.now ?? new Date()).toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  if ("assigned_to_user_id" in body) patch.assigned_to_user_id = body.assigned_to_user_id ?? null;
  if (body.title !== undefined) patch.title = body.title.trim();
  if ("description" in body) patch.description = body.description?.trim() || null;
  if (body.module_key !== undefined) patch.module_key = body.module_key;
  if (body.priority !== undefined) patch.priority = body.priority;
  if (body.visibility !== undefined) patch.visibility = body.visibility;
  if ("due_date" in body) patch.due_date = body.due_date ?? null;
  if ("action_url" in body) patch.action_url = body.action_url ?? null;
  if ("metadata" in body && body.metadata !== undefined) patch.metadata = body.metadata ?? {};

  if (body.status !== undefined) {
    patch.status = body.status;
    if (body.status === "done") {
      patch.completed_at = now;
      patch.completed_by = opts.userId;
    } else if (body.status === "pending" || body.status === "in_progress") {
      patch.completed_at = null;
      patch.completed_by = null;
    }
  }

  return patch;
}
