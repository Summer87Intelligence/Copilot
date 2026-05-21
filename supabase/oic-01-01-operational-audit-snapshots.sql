-- OIC-01-01: Operational Intelligence Center — tabla de snapshots de auditoría
-- Almacena resultados computados (salud, reconciliación, actividad, drift) por workspace/día.
-- Una fila por workspace + tipo + fecha → snapshot idempotente.

CREATE TABLE IF NOT EXISTS operational_audit_snapshots (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_type         text        NOT NULL,
  snapshot_date         date        NOT NULL,
  score_value           numeric,
  severity              text,
  item_count            integer,
  issue_count           integer,
  payload               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  triggered_by          text        NOT NULL DEFAULT 'cron',
  pipeline_run_id       uuid,
  computed_duration_ms  integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_snapshot_type CHECK (snapshot_type IN (
    'health_score',
    'pipeline_activity',
    'reconciliation',
    'financial_health',
    'drift_summary',
    'completeness_audit'
  )),
  CONSTRAINT chk_severity CHECK (severity IN ('ok', 'warning', 'critical', 'degraded'))
);

-- Un snapshot por workspace + tipo + día
CREATE UNIQUE INDEX IF NOT EXISTS idx_oas_unique
  ON operational_audit_snapshots (workspace_company_id, snapshot_type, snapshot_date);

-- Lookups por workspace + fecha reciente
CREATE INDEX IF NOT EXISTS idx_oas_workspace_date
  ON operational_audit_snapshots (workspace_company_id, snapshot_date DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_operational_audit_snapshots_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oas_updated_at ON operational_audit_snapshots;
CREATE TRIGGER trg_oas_updated_at
  BEFORE UPDATE ON operational_audit_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_operational_audit_snapshots_updated_at();

-- RLS: solo acceso autenticado al workspace propio
ALTER TABLE operational_audit_snapshots ENABLE ROW LEVEL SECURITY;

-- Lectura: solo el workspace del usuario (usando helper de tenant)
CREATE POLICY "oas_select_own_workspace" ON operational_audit_snapshots
  FOR SELECT
  USING (workspace_company_id IN (
    SELECT company_id FROM app_users WHERE auth_user_id = auth.uid()
  ));

-- Insert/Update: solo service role (pipelines del servidor)
CREATE POLICY "oas_insert_service_role" ON operational_audit_snapshots
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "oas_update_service_role" ON operational_audit_snapshots
  FOR UPDATE
  USING (auth.role() = 'service_role');
