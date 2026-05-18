-- =============================================================================
-- DE-08: Operational Automation (Phase 4C)
-- decision_automation_runs + decision_automation_actions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.decision_automation_runs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  rules_evaluated       INTEGER     NOT NULL DEFAULT 0,
  actions_generated     INTEGER     NOT NULL DEFAULT 0,
  actions_executed      INTEGER     NOT NULL DEFAULT 0,
  actions_deduped       INTEGER     NOT NULL DEFAULT 0,
  dry_run               BOOLEAN     NOT NULL DEFAULT false,
  status                TEXT        NOT NULL DEFAULT 'running'
                                    CHECK (status IN ('running', 'completed', 'failed')),
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.decision_automation_runs IS
  'Corridas del motor de automatización operacional (Phase 4C).';

CREATE INDEX IF NOT EXISTS idx_dar_workspace_started
  ON public.decision_automation_runs (workspace_company_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_dar_workspace_status
  ON public.decision_automation_runs (workspace_company_id, status);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.decision_automation_actions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  automation_run_id     UUID        NOT NULL REFERENCES public.decision_automation_runs(id) ON DELETE CASCADE,
  customer_id           UUID        NOT NULL,
  rule_key              TEXT        NOT NULL,
  action_type           TEXT        NOT NULL,
  action_payload        JSONB       NOT NULL DEFAULT '{}',
  executed              BOOLEAN     NOT NULL DEFAULT false,
  executed_at           TIMESTAMPTZ,
  execution_result      JSONB,
  dedupe_key            TEXT        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.decision_automation_actions IS
  'Acciones generadas/ejecutadas por reglas de automatización. dedupe_key evita loops.';

CREATE INDEX IF NOT EXISTS idx_daa_workspace_customer
  ON public.decision_automation_actions (workspace_company_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_daa_rule_key
  ON public.decision_automation_actions (workspace_company_id, rule_key);

CREATE INDEX IF NOT EXISTS idx_daa_dedupe_key
  ON public.decision_automation_actions (workspace_company_id, dedupe_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daa_run_id
  ON public.decision_automation_actions (automation_run_id);

CREATE INDEX IF NOT EXISTS idx_daa_created_at
  ON public.decision_automation_actions (workspace_company_id, created_at DESC);

ALTER TABLE public.decision_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_automation_actions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_automation_runs'
      AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.decision_automation_runs
      FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_automation_actions'
      AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.decision_automation_actions
      FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_automation_runs'
      AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.decision_automation_runs
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_automation_actions' AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.decision_automation_actions
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;
