-- =============================================================================
-- DE-11: Executive Briefings (Phase 5C)
-- decision_executive_briefings — brief ejecutivo cacheado (TTL 15 min)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.decision_executive_briefings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload               JSONB       NOT NULL,
  source_snapshot_ids   JSONB       NOT NULL DEFAULT '{}',
  expires_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT decision_executive_briefings_ws_unique
    UNIQUE (workspace_company_id)
);

COMMENT ON TABLE public.decision_executive_briefings IS
  'Brief ejecutivo de prioridades operacionales (Phase 5C). Generado determinísticamente, TTL ~15 min.';

CREATE INDEX IF NOT EXISTS idx_deb_workspace_generated
  ON public.decision_executive_briefings (workspace_company_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_deb_expires_at
  ON public.decision_executive_briefings (expires_at);

ALTER TABLE public.decision_executive_briefings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_executive_briefings' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.decision_executive_briefings
      FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_executive_briefings' AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.decision_executive_briefings
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;
