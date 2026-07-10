-- DAILY-WORKBOOK-ACTION-CENTER-001
-- Convierte "Tareas diarias" en cuaderno de trabajo. Cambios NO destructivos
-- sobre public.daily_tasks (creada en 20260709120938_bank_movements_daily_tasks).
--
-- 1) task_key   → clave estable de una tarea automática (upsert por interacción).
-- 2) snoozed_until → fecha hasta la que una tarea automática queda pospuesta.
-- 3) índice único parcial (workspace_id, task_key) → una sola fila de interacción
--    por tarea automática; impide duplicación infinita.
-- 4) policy DELETE faltante → el CRUD manual borraba contra RLS sin policy de
--    delete (fallaba en silencio). Se agrega, acotada al workspace de la sesión.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS. No toca datos existentes ni otras tablas.

ALTER TABLE public.daily_tasks
  ADD COLUMN IF NOT EXISTS task_key      TEXT NULL,
  ADD COLUMN IF NOT EXISTS snoozed_until DATE NULL;

COMMENT ON COLUMN public.daily_tasks.task_key IS
  'Clave estable de tarea automática (ej. bank:reconciliation:with_suggestion). NULL en tareas manuales.';
COMMENT ON COLUMN public.daily_tasks.snoozed_until IS
  'Tarea automática pospuesta hasta esta fecha (inclusive reaparece ese día).';

-- Una interacción por tarea automática y workspace.
CREATE UNIQUE INDEX IF NOT EXISTS daily_tasks_ws_task_key_uidx
  ON public.daily_tasks (workspace_id, task_key)
  WHERE task_key IS NOT NULL;

-- Policy DELETE faltante (bug: manual delete quedaba bloqueado por RLS).
DROP POLICY IF EXISTS "daily_tasks_delete" ON public.daily_tasks;
CREATE POLICY "daily_tasks_delete"
  ON public.daily_tasks
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
