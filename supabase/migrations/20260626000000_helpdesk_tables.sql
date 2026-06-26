-- helpdesk-001 · Mesa de ayuda: tickets, comentarios, adjuntos
-- Idempotente: IF NOT EXISTS / DROP POLICY IF EXISTS
-- Bucket de Storage: helpdesk-attachments (privado) — crear manualmente o via Admin API

-- ─── helpdesk_tickets ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.helpdesk_tickets (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id UUID          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by           UUID          NOT NULL REFERENCES public.app_users(id),
  assigned_to          UUID          NULL       REFERENCES public.app_users(id),
  title                TEXT          NOT NULL   CHECK (trim(title) <> ''),
  description          TEXT          NOT NULL   CHECK (trim(description) <> ''),
  type                 TEXT          NOT NULL
    CHECK (type IN ('suggestion','bug','improvement','question','design_change','other')),
  module_key           TEXT          NULL,
  priority             TEXT          NOT NULL   DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high')),
  status               TEXT          NOT NULL   DEFAULT 'new'
    CHECK (status IN ('new','reviewing','approved','in_progress','resolved','rejected')),
  created_at           TIMESTAMPTZ   NOT NULL   DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL   DEFAULT now(),
  resolved_at          TIMESTAMPTZ   NULL
);

CREATE INDEX IF NOT EXISTS helpdesk_tickets_ws_idx
  ON public.helpdesk_tickets (workspace_company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS helpdesk_tickets_created_by_idx
  ON public.helpdesk_tickets (workspace_company_id, created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS helpdesk_tickets_status_idx
  ON public.helpdesk_tickets (workspace_company_id, status, priority, created_at DESC);

ALTER TABLE public.helpdesk_tickets ENABLE ROW LEVEL SECURITY;

-- SELECT: workspace scope (app-level filters created_by for non-admins)
DROP POLICY IF EXISTS "helpdesk_tickets_select" ON public.helpdesk_tickets;
CREATE POLICY "helpdesk_tickets_select"
  ON public.helpdesk_tickets
  FOR SELECT TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());

-- INSERT: authenticated users in their workspace
DROP POLICY IF EXISTS "helpdesk_tickets_insert" ON public.helpdesk_tickets;
CREATE POLICY "helpdesk_tickets_insert"
  ON public.helpdesk_tickets
  FOR INSERT TO authenticated
  WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());

-- UPDATE: service_role only (admin operations via API use service role)
DROP POLICY IF EXISTS "helpdesk_tickets_update_service" ON public.helpdesk_tickets;
CREATE POLICY "helpdesk_tickets_update_service"
  ON public.helpdesk_tickets
  FOR UPDATE
  WITH CHECK (auth.role() = 'service_role');

-- ─── helpdesk_comments ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.helpdesk_comments (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id            UUID          NOT NULL REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE,
  workspace_company_id UUID          NOT NULL,
  created_by           UUID          NOT NULL REFERENCES public.app_users(id),
  body                 TEXT          NOT NULL   CHECK (trim(body) <> ''),
  created_at           TIMESTAMPTZ   NOT NULL   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS helpdesk_comments_ticket_idx
  ON public.helpdesk_comments (ticket_id, created_at ASC);

ALTER TABLE public.helpdesk_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "helpdesk_comments_select" ON public.helpdesk_comments;
CREATE POLICY "helpdesk_comments_select"
  ON public.helpdesk_comments
  FOR SELECT TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "helpdesk_comments_insert" ON public.helpdesk_comments;
CREATE POLICY "helpdesk_comments_insert"
  ON public.helpdesk_comments
  FOR INSERT TO authenticated
  WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());

-- ─── helpdesk_attachments ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.helpdesk_attachments (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id            UUID          NOT NULL REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE,
  workspace_company_id UUID          NOT NULL,
  uploaded_by          UUID          NOT NULL REFERENCES public.app_users(id),
  file_name            TEXT          NOT NULL,
  file_path            TEXT          NOT NULL,
  file_type            TEXT          NOT NULL,
  file_size_bytes      INTEGER       NULL,
  created_at           TIMESTAMPTZ   NOT NULL   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS helpdesk_attachments_ticket_idx
  ON public.helpdesk_attachments (ticket_id, created_at ASC);

ALTER TABLE public.helpdesk_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "helpdesk_attachments_select" ON public.helpdesk_attachments;
CREATE POLICY "helpdesk_attachments_select"
  ON public.helpdesk_attachments
  FOR SELECT TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "helpdesk_attachments_insert" ON public.helpdesk_attachments;
CREATE POLICY "helpdesk_attachments_insert"
  ON public.helpdesk_attachments
  FOR INSERT TO authenticated
  WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());

-- ─── Storage bucket: helpdesk-attachments ────────────────────────────────────
-- Crear el bucket vía Supabase Dashboard > Storage > New bucket:
--   name: helpdesk-attachments
--   public: false (privado)
-- O via SQL (requiere acceso al schema storage):
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('helpdesk-attachments', 'helpdesk-attachments', false)
--   ON CONFLICT (id) DO NOTHING;
