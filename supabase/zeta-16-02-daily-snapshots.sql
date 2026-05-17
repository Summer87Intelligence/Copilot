-- ZETA-16-02: Daily operational snapshots per workspace.
--
-- One row per (workspace_company_id, snapshot_date).
-- Populated by /api/cron/zeta-daily-snapshot (02:00 UTC daily).
-- Used for: silent loss detection, historical audit, trend analysis.
--
-- Idempotente: UNIQUE on (workspace_company_id, snapshot_date).
-- ON CONFLICT DO UPDATE allows re-run idempotency.

CREATE TABLE IF NOT EXISTS zeta_daily_snapshots (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id       uuid        NOT NULL,
  snapshot_date              date        NOT NULL,

  -- Entity counts at snapshot time
  invoices_count             integer,
  receipts_count             integer,
  contacts_count             integer,
  cuotas_count               integer,
  open_invoices_count        integer,
  total_balance_pending      numeric,

  -- Operational metrics for the day
  sync_runs_today            integer     NOT NULL DEFAULT 0,
  sync_errors_today          integer     NOT NULL DEFAULT 0,
  integrity_violations_open  integer     NOT NULL DEFAULT 0,
  critical_violations_open   integer     NOT NULL DEFAULT 0,
  resync_jobs_completed      integer     NOT NULL DEFAULT 0,
  resync_jobs_failed         integer     NOT NULL DEFAULT 0,
  dead_letter_jobs           integer     NOT NULL DEFAULT 0,

  metadata                   jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT zeta_daily_snapshots_ws_date_unique
    UNIQUE (workspace_company_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_zeta_daily_snapshots_workspace_date
  ON zeta_daily_snapshots (workspace_company_id, snapshot_date DESC);

ALTER TABLE zeta_daily_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'zeta_daily_snapshots' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON zeta_daily_snapshots FOR ALL USING (true);
  END IF;
END $$;
