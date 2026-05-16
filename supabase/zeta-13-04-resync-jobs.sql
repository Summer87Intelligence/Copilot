-- ZETA-13-04: Re-sync Jobs
-- Cola de trabajos de re-sincronización inteligente
-- Soporta: por entidad, por período, por cliente, por RegistroId — con dry-run

CREATE TABLE IF NOT EXISTS zeta_resync_jobs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity                text        NOT NULL CHECK (entity IN ('invoices', 'receipts', 'installments', 'contacts', 'saldos')),
  scope                 text        NOT NULL,   -- 'period:2026-05' | 'client:CLI001' | 'registro_id:12345' | 'full'
  status                text        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  triggered_by          text        NOT NULL DEFAULT 'manual'
                        CHECK (triggered_by IN ('manual', 'completeness_audit', 'integrity_check', 'divergence_detection')),
  dry_run               boolean     NOT NULL DEFAULT false,
  rows_fetched          integer,
  rows_synced           integer,
  rows_skipped          integer,
  error_summary         text,
  metadata              jsonb,                 -- Parámetros adicionales del job
  created_at            timestamptz NOT NULL DEFAULT now(),
  started_at            timestamptz,
  completed_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_zeta_resync_jobs_workspace_status
  ON zeta_resync_jobs (workspace_company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_zeta_resync_jobs_pending
  ON zeta_resync_jobs (created_at ASC)
  WHERE status = 'pending';

ALTER TABLE zeta_resync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_can_select_resync_jobs" ON zeta_resync_jobs;
CREATE POLICY "authenticated_can_select_resync_jobs"
  ON zeta_resync_jobs FOR SELECT TO authenticated USING (true);
