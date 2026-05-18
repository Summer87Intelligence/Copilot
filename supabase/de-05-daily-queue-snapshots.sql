-- =============================================================================
-- DE-05: Daily Operations Queue Snapshots (Phase 2B)
-- decision_daily_queue_snapshots — cola operacional priorizada cacheada
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.decision_daily_queue_snapshots (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at            TIMESTAMPTZ NOT NULL,
  payload               JSONB       NOT NULL,
  generation_ms         INTEGER,

  CONSTRAINT decision_daily_queue_snapshots_ws_unique
    UNIQUE (workspace_company_id)
);

COMMENT ON TABLE public.decision_daily_queue_snapshots IS
  'Snapshot de la cola operacional diaria (Phase 2B). '
  'Una fila por workspace. Invalidado tras acciones operativas o cambios SLA.';

CREATE INDEX IF NOT EXISTS idx_ddqs_workspace_generated
  ON public.decision_daily_queue_snapshots (workspace_company_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ddqs_expires_at
  ON public.decision_daily_queue_snapshots (expires_at);

ALTER TABLE public.decision_daily_queue_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_daily_queue_snapshots'
      AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.decision_daily_queue_snapshots
      FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_daily_queue_snapshots'
      AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.decision_daily_queue_snapshots
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;
