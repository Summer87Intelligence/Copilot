-- =============================================================================
-- DE-09: AI Operational Briefings (Phase 5A)
-- decision_ai_briefings — interpretación operacional cacheada (TTL 30 min)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.decision_ai_briefings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  briefing_type         TEXT        NOT NULL,
  payload               JSONB       NOT NULL,
  source_snapshot_ids   JSONB       NOT NULL DEFAULT '{}',
  expires_at            TIMESTAMPTZ NOT NULL,
  generation_ms         INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT decision_ai_briefings_ws_type_unique
    UNIQUE (workspace_company_id, briefing_type)
);

COMMENT ON TABLE public.decision_ai_briefings IS
  'Briefings de inteligencia operacional (Phase 5A). Capa interpretativa determinística, TTL ~30 min.';

CREATE INDEX IF NOT EXISTS idx_dab_workspace_type_generated
  ON public.decision_ai_briefings (workspace_company_id, briefing_type, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_dab_expires_at
  ON public.decision_ai_briefings (expires_at);

ALTER TABLE public.decision_ai_briefings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_ai_briefings' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.decision_ai_briefings
      FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_ai_briefings' AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.decision_ai_briefings
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;
