-- notif-01 · Tabla de notificaciones operativas del Copilot
-- Idempotente: usa IF NOT EXISTS / DROP POLICY IF EXISTS

CREATE TABLE IF NOT EXISTS public.copilot_notifications (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID           NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type                  TEXT           NOT NULL,
  severity              TEXT           NOT NULL DEFAULT 'info'
                          CHECK (severity IN ('info', 'warning', 'critical')),
  title                 TEXT           NOT NULL,
  body                  TEXT,
  entity_type           TEXT,
  entity_id             TEXT,
  amount                NUMERIC(18,2),
  currency              TEXT,
  action_href           TEXT,
  dedup_key             TEXT,
  metadata              JSONB          NOT NULL DEFAULT '{}',
  read_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- Índice principal: listar por workspace + fecha desc
CREATE INDEX IF NOT EXISTS copilot_notifications_ws_created_idx
  ON public.copilot_notifications (workspace_company_id, created_at DESC);

-- Índice parcial para conteo de no leídas
CREATE INDEX IF NOT EXISTS copilot_notifications_ws_unread_idx
  ON public.copilot_notifications (workspace_company_id, created_at DESC)
  WHERE read_at IS NULL;

-- Índice por tipo para filtros futuros
CREATE INDEX IF NOT EXISTS copilot_notifications_ws_type_idx
  ON public.copilot_notifications (workspace_company_id, type);

-- Índice único para deduplicación (solo filas con dedup_key)
CREATE UNIQUE INDEX IF NOT EXISTS copilot_notifications_dedup_idx
  ON public.copilot_notifications (workspace_company_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

-- RLS
ALTER TABLE public.copilot_notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: usuario autenticado ve sus propias notificaciones
DROP POLICY IF EXISTS "notif_select_own" ON public.copilot_notifications;
CREATE POLICY "notif_select_own"
  ON public.copilot_notifications
  FOR SELECT TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());

-- UPDATE: usuario autenticado puede marcar read_at (y solo eso)
DROP POLICY IF EXISTS "notif_update_own" ON public.copilot_notifications;
CREATE POLICY "notif_update_own"
  ON public.copilot_notifications
  FOR UPDATE TO authenticated
  USING  (workspace_company_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());

-- INSERT: solo service_role (crons, pipelines, servicios internos)
DROP POLICY IF EXISTS "notif_insert_service_role" ON public.copilot_notifications;
CREATE POLICY "notif_insert_service_role"
  ON public.copilot_notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
