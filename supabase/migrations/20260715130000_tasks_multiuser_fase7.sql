-- FASE-7-TASKS-MULTIUSER-001
-- Sistema de tareas multiusuario sobre public.daily_tasks (creada en
-- 20260709120938_bank_movements_daily_tasks y extendida en 20260710120000).
--
-- Aditivo, idempotente y NO destructivo:
--   1) daily_tasks.created_by_user_id → autor de la tarea (visibilidad + auditoría).
--   2) daily_tasks.visibility         → private | team | workspace.
--      Default 'workspace' → las filas actuales quedan visibles como hasta hoy.
--   3) priority CHECK extendido con 'critical' (drop+add del constraint auto-nombrado).
--   4) task_comments → notas append-only por tarea.
--   5) task_history  → auditoría de cambios (asignación, estado, prioridad, fecha…).
--   6) índices de apoyo.
--
-- RLS: mantiene el aislamiento por workspace (frontera dura, ya probada en
-- daily_tasks). La visibilidad fina por usuario/rol se resuelve server-side en la
-- API (no existe helper SQL de "app_user id" en este esquema). Ver
-- lib/tasks/task-visibility.ts y app/api/copilot/tasks/*.
--
-- NO se aplica automáticamente (FASE 7 · autorización pendiente). El código nuevo
-- es tolerante a columnas/tablas ausentes para no romper build/tests antes de aplicar.
-- Prerrequisitos: public.companies, public.app_users, public.daily_tasks,
--   public.copilot_set_updated_at(), public.copilot_treasury_row_force_workspace().

-- ─── daily_tasks: columnas multiusuario ──────────────────────────────────────

ALTER TABLE public.daily_tasks
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID NULL
    REFERENCES public.app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace';

COMMENT ON COLUMN public.daily_tasks.created_by_user_id IS
  'Autor de la tarea. NULL en tareas del sistema/importadas. Base de la visibilidad "creada por mí".';
COMMENT ON COLUMN public.daily_tasks.visibility IS
  'private: solo asignado/creador · team: equipo del workspace · workspace: todos con acceso al módulo de origen.';

-- CHECK de visibility (idempotente: drop + add).
ALTER TABLE public.daily_tasks DROP CONSTRAINT IF EXISTS daily_tasks_visibility_check;
ALTER TABLE public.daily_tasks
  ADD CONSTRAINT daily_tasks_visibility_check
  CHECK (visibility IN ('private', 'team', 'workspace'));

-- priority: agrega 'critical' preservando los valores existentes.
-- El constraint inline original se llama daily_tasks_priority_check.
ALTER TABLE public.daily_tasks DROP CONSTRAINT IF EXISTS daily_tasks_priority_check;
ALTER TABLE public.daily_tasks
  ADD CONSTRAINT daily_tasks_priority_check
  CHECK (priority IN ('critical', 'high', 'medium', 'low'));

CREATE INDEX IF NOT EXISTS daily_tasks_ws_creator_idx
  ON public.daily_tasks (workspace_id, created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS daily_tasks_ws_visibility_idx
  ON public.daily_tasks (workspace_id, visibility);

-- ─── task_comments ───────────────────────────────────────────────────────────
-- Notas append-only por tarea. La visibilidad de una nota sigue la de su tarea
-- (se filtra en la API); RLS aquí garantiza el aislamiento por workspace.

CREATE TABLE IF NOT EXISTS public.task_comments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  task_id        UUID        NOT NULL REFERENCES public.daily_tasks(id) ON DELETE CASCADE,
  author_user_id UUID        NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  body           TEXT        NOT NULL CHECK (trim(body) <> '' AND length(body) <= 4000),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_comments IS
  'FASE 7: notas append-only de una tarea. Visibilidad heredada de la tarea (filtrada en API).';

CREATE INDEX IF NOT EXISTS task_comments_task_idx
  ON public.task_comments (task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS task_comments_ws_idx
  ON public.task_comments (workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_task_comments_updated_at ON public.task_comments;
CREATE TRIGGER trg_task_comments_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_task_comments_force_workspace ON public.task_comments;
CREATE TRIGGER trg_task_comments_force_workspace
  BEFORE INSERT OR UPDATE ON public.task_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_comments_select" ON public.task_comments;
CREATE POLICY "task_comments_select"
  ON public.task_comments
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "task_comments_insert" ON public.task_comments;
CREATE POLICY "task_comments_insert"
  ON public.task_comments
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());

-- ─── task_history ────────────────────────────────────────────────────────────
-- Auditoría append-only de cambios relevantes de una tarea. No guarda payloads
-- completos ni secretos: solo actor, acción y valores anterior/nuevo (texto corto).

CREATE TABLE IF NOT EXISTS public.task_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  task_id       UUID        NOT NULL REFERENCES public.daily_tasks(id) ON DELETE CASCADE,
  actor_user_id UUID        NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL CHECK (trim(action) <> ''),
  field         TEXT        NULL,
  old_value     TEXT        NULL,
  new_value     TEXT        NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_history IS
  'FASE 7: auditoría append-only de cambios de tarea (created/assigned/status/priority/due/comment…).';

CREATE INDEX IF NOT EXISTS task_history_task_idx
  ON public.task_history (task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS task_history_ws_idx
  ON public.task_history (workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_task_history_force_workspace ON public.task_history;
CREATE TRIGGER trg_task_history_force_workspace
  BEFORE INSERT OR UPDATE ON public.task_history
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_history_select" ON public.task_history;
CREATE POLICY "task_history_select"
  ON public.task_history
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "task_history_insert" ON public.task_history;
CREATE POLICY "task_history_insert"
  ON public.task_history
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
