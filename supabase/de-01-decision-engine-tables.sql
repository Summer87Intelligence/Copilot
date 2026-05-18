-- =============================================================================
-- DE-01: Decision Engine Tables
-- decision_snapshots  — caché de briefings (TTL 60 min, UPSERT idempotente)
-- portfolio_score_history — historial diario del score de cartera
--
-- NOTA: collection_actions ya existe en collection-operations.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. decision_snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.decision_snapshots (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_type         TEXT        NOT NULL,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at            TIMESTAMPTZ NOT NULL,
  payload               JSONB       NOT NULL,
  generation_ms         INTEGER,

  CONSTRAINT decision_snapshots_ws_type_unique
    UNIQUE (workspace_company_id, snapshot_type)
);

COMMENT ON TABLE public.decision_snapshots IS
  'Caché de decisiones computadas (briefing, ranking). '
  'Una fila por (workspace, tipo). UPSERT con ON CONFLICT para refresh. '
  'Expiración manejada por expires_at en aplicación.';

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_workspace_type
  ON public.decision_snapshots (workspace_company_id, snapshot_type);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_expires_at
  ON public.decision_snapshots (expires_at);

ALTER TABLE public.decision_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_snapshots' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.decision_snapshots FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_snapshots' AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.decision_snapshots
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. portfolio_score_history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.portfolio_score_history (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scored_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  score                 INTEGER     NOT NULL CHECK (score BETWEEN 0 AND 100),
  band                  TEXT        NOT NULL CHECK (band IN ('saludable','atencion','riesgo_moderado','critico')),

  effectiveness_score   INTEGER,
  aging_score           INTEGER,
  concentration_score   INTEGER,

  total_pending_uyu     NUMERIC(14,2),
  total_pending_usd     NUMERIC(14,2),
  active_debtors_count  INTEGER,

  metadata              JSONB
);

COMMENT ON TABLE public.portfolio_score_history IS
  'Un registro por (workspace, día UTC) con el score de salud de cartera. '
  'Permite graficar evolución semanal/mensual. Unicidad por día via índice funcional.';

-- 1 fila por (workspace, día UTC). Expresión funcional requiere índice separado —
-- Postgres no admite expresiones en UNIQUE constraint inline de CREATE TABLE.
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_score_history_workspace_day_uidx
  ON public.portfolio_score_history (
    workspace_company_id,
    ((scored_at AT TIME ZONE 'UTC')::date)
  );

CREATE INDEX IF NOT EXISTS idx_portfolio_score_history_workspace_scored
  ON public.portfolio_score_history (workspace_company_id, scored_at DESC);

ALTER TABLE public.portfolio_score_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portfolio_score_history' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.portfolio_score_history FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portfolio_score_history' AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.portfolio_score_history
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;
