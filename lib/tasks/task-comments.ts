/**
 * FASE 7 — Notas/comentarios de tarea (contrato). Append-only, sin HTML inseguro
 * (se renderiza como texto plano preservando saltos de línea en la UI).
 */
import { z } from "zod";

export const taskCommentBodySchema = z
  .object({
    workspace_id: z.never().optional(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

export type TaskCommentBody = z.infer<typeof taskCommentBodySchema>;

export type TaskComment = {
  id: string;
  workspace_id: string;
  task_id: string;
  author_user_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};
