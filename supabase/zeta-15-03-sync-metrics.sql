-- ZETA-15-03: Operational sync metrics table.
--
-- Lightweight append-only log for drift trends, sync durations, and anomaly tracking.
-- Used by lib/observability/zeta-sync-metrics.ts.
-- Idempotente: IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS zeta_sync_metrics (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  pipeline_name        text        NOT NULL,
  workspace_company_id uuid,
  metric_name          text        NOT NULL,
  metric_value         numeric,
  tags                 jsonb,
  CONSTRAINT zeta_sync_metrics_names_nonempty
    CHECK (pipeline_name <> '' AND metric_name <> '')
);

CREATE INDEX IF NOT EXISTS idx_zeta_sync_metrics_pipeline_time
  ON zeta_sync_metrics (pipeline_name, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_zeta_sync_metrics_workspace_metric_time
  ON zeta_sync_metrics (workspace_company_id, metric_name, recorded_at DESC)
  WHERE workspace_company_id IS NOT NULL;

ALTER TABLE zeta_sync_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'zeta_sync_metrics' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON zeta_sync_metrics FOR ALL USING (true);
  END IF;
END $$;
