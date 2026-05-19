-- =============================================================================
-- DE-12: Strategic Learning Layer (Phase 5D)
-- decision_learning_outcomes     — outcomes observados por tenant
-- decision_learning_snapshots    — snapshots de efectividad cacheados
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tabla: decision_learning_outcomes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.decision_learning_outcomes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id           TEXT        NOT NULL,
  source_type           TEXT        NOT NULL,
  source_id             TEXT        NOT NULL,
  outcome_type          TEXT        NOT NULL,
  outcome_amount        NUMERIC(18,2),
  currency_code         TEXT,
  observed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata              JSONB       NOT NULL DEFAULT '{}',
  dedupe_key            TEXT        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT decision_learning_outcomes_dedupe
    UNIQUE (workspace_company_id, dedupe_key)
);

COMMENT ON TABLE public.decision_learning_outcomes IS
  'Outcomes detectados por el motor de aprendizaje estratégico (Phase 5D). Inmutables una vez creados.';

COMMENT ON COLUMN public.decision_learning_outcomes.source_type IS
  'manual_action | automation_action | follow_up | forecast | executive_decision';
COMMENT ON COLUMN public.decision_learning_outcomes.outcome_type IS
  'payment_received | promise_kept | promise_broken | no_response | escalated | recovered | worsened | neutral';
COMMENT ON COLUMN public.decision_learning_outcomes.dedupe_key IS
  'Formato: source_type:source_id:outcome_type — evita outcomes duplicados.';

CREATE INDEX IF NOT EXISTS idx_dlo_workspace_customer
  ON public.decision_learning_outcomes (workspace_company_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_dlo_workspace_observed
  ON public.decision_learning_outcomes (workspace_company_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_dlo_workspace_source_type
  ON public.decision_learning_outcomes (workspace_company_id, source_type);

CREATE INDEX IF NOT EXISTS idx_dlo_workspace_outcome_type
  ON public.decision_learning_outcomes (workspace_company_id, outcome_type);

ALTER TABLE public.decision_learning_outcomes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_learning_outcomes' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.decision_learning_outcomes
      FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_learning_outcomes' AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.decision_learning_outcomes
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tabla: decision_learning_snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.decision_learning_snapshots (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_type         TEXT        NOT NULL,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at            TIMESTAMPTZ NOT NULL,
  payload               JSONB       NOT NULL,
  source_snapshot_ids   JSONB       NOT NULL DEFAULT '{}',
  generation_ms         INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT decision_learning_snapshots_ws_type_unique
    UNIQUE (workspace_company_id, snapshot_type)
);

COMMENT ON TABLE public.decision_learning_snapshots IS
  'Snapshots de efectividad estratégica cacheados (Phase 5D). TTL ~60 min.';

CREATE INDEX IF NOT EXISTS idx_dls_workspace_type
  ON public.decision_learning_snapshots (workspace_company_id, snapshot_type, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_dls_expires_at
  ON public.decision_learning_snapshots (expires_at);

ALTER TABLE public.decision_learning_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_learning_snapshots' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.decision_learning_snapshots
      FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decision_learning_snapshots' AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.decision_learning_snapshots
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;
