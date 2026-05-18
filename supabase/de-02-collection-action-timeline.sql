-- =============================================================================
-- DE-02: Collection Action Timeline
-- Registro estructurado de acciones de cobranza por cliente.
-- Complementa collection_actions con canal, resumen y resultado explícitos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.collection_action_timeline (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id             UUID        NOT NULL,
  action_type           TEXT        NOT NULL,
  channel               TEXT,
  summary               TEXT,
  outcome               TEXT,
  created_by            UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_follow_up_at     TIMESTAMPTZ
);

COMMENT ON TABLE public.collection_action_timeline IS
  'Historial estructurado de acciones de cobranza por cliente. '
  'Registra canal, resumen y resultado para trazabilidad ejecutiva.';

CREATE INDEX IF NOT EXISTS idx_cat_workspace_client_created
  ON public.collection_action_timeline (workspace_company_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cat_workspace_created
  ON public.collection_action_timeline (workspace_company_id, created_at DESC);

ALTER TABLE public.collection_action_timeline ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'collection_action_timeline'
      AND policyname  = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full"
      ON public.collection_action_timeline
      FOR ALL
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'collection_action_timeline'
      AND policyname  = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access"
      ON public.collection_action_timeline
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;
