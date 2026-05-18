-- =============================================================================
-- DE-10: Predictive Snapshots (Phase 5B)
-- decision_predictive_snapshots — forecast operacional cacheado (TTL 30 min)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.decision_predictive_snapshots (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_type         TEXT        NOT NULL,
  payload               JSONB       NOT NULL,
  expires_at            TIMESTAMPTZ NOT NULL,
  generation_ms         INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT decision_predictive_snapshots_ws_type_unique
    UNIQUE (workspace_company_id, snapshot_type)
);

COMMENT ON TABLE public.decision_predictive_snapshots IS
  'Snapshots predictivos determinísticos (Phase 5B). TTL ~30 min.';

CREATE INDEX IF NOT EXISTS idx_dps_workspace_type_generated
  ON public.decision_predictive_snapshots (workspace_company_id, snapshot_type, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_dps_expires_at
  ON public.decision_predictive_snapshots (expires_at);

ALTER TABLE public.decision_predictive_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_predictive_snapshots' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.decision_predictive_snapshots
      FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_predictive_snapshots' AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.decision_predictive_snapshots
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;
