/**
 * Interacciones del usuario sobre tareas AUTOMÁTICAS del cuaderno.
 *
 * Las tareas automáticas se calculan en tiempo real (no viven en DB). Lo único
 * que se persiste es la interacción del usuario, como una fila daily_tasks con
 * source_type = 'auto' y un task_key estable. Se upsertea por (workspace_id,
 * task_key) para no duplicar filas.
 */
import { z } from "zod";

import { MODULE_KEYS } from "@/lib/auth/module-permissions";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD).");
const rejectWorkspaceId = z.never().optional();

export const DAILY_TASK_INTERACTION_ACTIONS = [
  "complete",
  "reopen",
  "ignore_today",
  "snooze",
] as const;
export type DailyTaskInteractionAction = (typeof DAILY_TASK_INTERACTION_ACTIONS)[number];

export const dailyTaskInteractionBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    task_key: z.string().trim().min(1).max(120),
    action: z.enum(DAILY_TASK_INTERACTION_ACTIONS),
    module_key: z.enum(MODULE_KEYS),
    title: z.string().trim().min(1).max(200),
    origin: z.string().trim().max(40).optional(),
    snoozed_until: z.union([ymd, z.null()]).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.action === "snooze" && !body.snoozed_until) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["snoozed_until"],
        message: "snooze requiere snoozed_until.",
      });
    }
  });

export type DailyTaskInteractionBody = z.infer<typeof dailyTaskInteractionBodySchema>;

type InteractionRow = Record<string, unknown>;

/** Campos de estado según la acción (compartidos por insert y patch). */
export function interactionStateFields(
  body: DailyTaskInteractionBody,
  opts: { userId: string; now?: Date }
): InteractionRow {
  const now = (opts.now ?? new Date()).toISOString();
  const today = now.slice(0, 10);

  switch (body.action) {
    case "complete":
      return {
        status: "done",
        completed_at: now,
        completed_by: opts.userId,
        due_date: today,
        snoozed_until: null,
      };
    case "reopen":
      return {
        status: "pending",
        completed_at: null,
        completed_by: null,
        snoozed_until: null,
      };
    case "ignore_today":
      return {
        status: "cancelled",
        completed_at: null,
        completed_by: null,
        due_date: today,
        snoozed_until: null,
      };
    case "snooze":
      return {
        status: "postponed",
        completed_at: null,
        completed_by: null,
        snoozed_until: body.snoozed_until ?? null,
      };
    default:
      return {};
  }
}

/** Fila nueva a insertar. workspace_id lo impone el servidor/trigger. */
export function buildInteractionInsert(
  body: DailyTaskInteractionBody,
  opts: { workspaceId: string; userId: string; now?: Date }
): InteractionRow {
  return {
    workspace_id: opts.workspaceId,
    task_key: body.task_key,
    module_key: body.module_key,
    title: body.title.trim(),
    source_type: "auto",
    priority: "medium",
    action_url: null,
    metadata: body.origin ? { origin: body.origin } : {},
    ...interactionStateFields(body, opts),
  };
}

/** Patch sobre una fila de interacción existente (mismo task_key). */
export function buildInteractionPatch(
  body: DailyTaskInteractionBody,
  opts: { userId: string; now?: Date }
): InteractionRow {
  const now = (opts.now ?? new Date()).toISOString();
  return {
    updated_at: now,
    title: body.title.trim(),
    module_key: body.module_key,
    ...interactionStateFields(body, opts),
  };
}
