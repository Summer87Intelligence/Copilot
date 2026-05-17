-- ZETA-16-04: Historical sync metrics per pipeline run.
--
-- Persists per-run metrics for trend analysis, dashboards, and alerting.
-- Written once per pipeline run (or batch) — no updates, only appends.
-- Idempotent: IF NOT EXISTS throughout.
--
-- Retention: kept indefinitely; archive strategy TBD.
-- Index on (workspace_company_id, pipeline_name, recorded_at DESC)
-- to support time-range queries per tenant and pipeline.

CREATE TABLE IF NOT EXISTS zeta_sync_metrics_history (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id uuid        NOT NULL,
  pipeline_name        text        NOT NULL CHECK (pipeline_name <> ''),
  pipeline_run_id      uuid,
  recorded_at          timestamptz NOT NULL DEFAULT now(),

  -- Duration
  duration_ms          integer,

  -- Volume
  rows_fetched         integer     NOT NULL DEFAULT 0,
  rows_upserted        integer     NOT NULL DEFAULT 0,
  rows_inserted        integer     NOT NULL DEFAULT 0,
  rows_updated         integer     NOT NULL DEFAULT 0,
  rows_skipped         integer     NOT NULL DEFAULT 0,
  rows_failed          integer     NOT NULL DEFAULT 0,

  -- Reliability
  retry_count          integer     NOT NULL DEFAULT 0,
  error_count          integer     NOT NULL DEFAULT 0,

  -- Outcome
  status               text        NOT NULL DEFAULT 'succeeded',

  -- Drift trend (optional — set when audit is co-located with sync)
  drift_count          integer,
  drift_pct            numeric,

  -- API latency (ms, round-trip to Zeta)
  api_latency_ms       integer,

  metadata             jsonb,

  CONSTRAINT zeta_sync_metrics_history_status_v2_check
    CHECK (status IN ('succeeded', 'partial', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_zeta_sync_metrics_ws_pipeline_time
  ON zeta_sync_metrics_history (workspace_company_id, pipeline_name, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_zeta_sync_metrics_pipeline_time
  ON zeta_sync_metrics_history (pipeline_name, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_zeta_sync_metrics_run_id
  ON zeta_sync_metrics_history (pipeline_run_id)
  WHERE pipeline_run_id IS NOT NULL;

ALTER TABLE zeta_sync_metrics_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'zeta_sync_metrics_history' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON zeta_sync_metrics_history FOR ALL USING (true);
  END IF;
END $$;
