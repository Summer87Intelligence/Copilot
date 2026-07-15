/**
 * FASE 7 — Tolerancia de esquema para daily_tasks.
 *
 * Las columnas created_by_user_id / visibility se agregan en la migración
 * 20260715130000, que NO se aplica automáticamente. Para no romper producción
 * antes de aplicarla, el app-layer:
 *   - ESCRIBE los valores en columnas reales Y los espeja en metadata;
 *   - si el INSERT/UPDATE falla por columna inexistente (42703), reintenta sin
 *     las columnas nuevas (los valores sobreviven en metadata);
 *   - LEE resolviendo columna real ?? metadata ?? default.
 * Una vez aplicada la migración, las columnas reales mandan y el espejo es inocuo.
 */

import {
  taskVisibility,
  type DailyTask,
  type DailyTaskVisibility,
} from "@/lib/daily-tasks/daily-tasks-types";

export const PG_UNDEFINED_COLUMN = "42703";
export const PG_UNDEFINED_TABLE = "42P01";

export function isUndefinedColumnError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === PG_UNDEFINED_COLUMN;
}

export function isMissingTableError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === PG_UNDEFINED_TABLE;
}

export const FASE7_TASK_COLUMNS = ["created_by_user_id", "visibility"] as const;

/** Resuelve created_by_user_id / visibility desde columna o metadata. */
export function hydrateTaskRow(row: Record<string, unknown>): DailyTask {
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<
    string,
    unknown
  >;
  const createdBy = (row.created_by_user_id ?? meta.created_by_user_id ?? null) as string | null;
  const vis = (row.visibility ?? meta.visibility ?? null) as DailyTaskVisibility | null;
  return {
    ...(row as unknown as DailyTask),
    created_by_user_id: createdBy,
    visibility: taskVisibility({ visibility: vis }),
  };
}

export function hydrateTaskRows(rows: readonly Record<string, unknown>[]): DailyTask[] {
  return rows.map(hydrateTaskRow);
}

/**
 * Agrega los campos FASE 7 a una fila de escritura, con espejo en metadata.
 * Solo mira los campos presentes en `fields` (patch parcial).
 */
export function augmentWriteWithFase7(
  row: Record<string, unknown>,
  fields: { createdByUserId?: string | null; visibility?: DailyTaskVisibility }
): Record<string, unknown> {
  const out = { ...row };
  const meta = { ...((out.metadata as Record<string, unknown>) ?? {}) };

  if ("createdByUserId" in fields) {
    out.created_by_user_id = fields.createdByUserId ?? null;
    meta.created_by_user_id = fields.createdByUserId ?? null;
  }
  if ("visibility" in fields && fields.visibility) {
    out.visibility = fields.visibility;
    meta.visibility = fields.visibility;
  }
  out.metadata = meta;
  return out;
}

/** Quita las columnas FASE 7 de una fila (fallback cuando aún no existen). */
export function stripFase7Columns(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  for (const key of FASE7_TASK_COLUMNS) delete copy[key];
  return copy;
}
