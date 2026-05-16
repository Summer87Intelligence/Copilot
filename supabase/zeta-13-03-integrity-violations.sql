-- ZETA-13-03: Integrity Violations
-- Registra violaciones de integridad detectadas por checks internos de BD
-- Checks incluyen: imposibles contables, orphans, duplicados, nulos críticos

CREATE TABLE IF NOT EXISTS zeta_integrity_violations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  check_name            text        NOT NULL,   -- 'invoice_balance_exceeds_total' | 'receipt_null_currency' | etc.
  entity                text        NOT NULL CHECK (entity IN ('invoices', 'receipts', 'installments', 'contacts', 'cross')),
  record_id             uuid,                   -- ID del registro afectado (si aplica)
  record_key            text,                   -- Clave natural (invoice_number, receipt_number)
  description           text        NOT NULL,
  severity              text        NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  status                text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'suppressed')),
  detected_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  metadata              jsonb
);

-- Único por check + registro para evitar duplicados entre runs
CREATE UNIQUE INDEX IF NOT EXISTS idx_zeta_integrity_unique_violation
  ON zeta_integrity_violations (workspace_company_id, check_name, entity, COALESCE(record_id::text, record_key, 'NULL'))
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_zeta_integrity_workspace_status
  ON zeta_integrity_violations (workspace_company_id, status, severity, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_zeta_integrity_open_critical
  ON zeta_integrity_violations (workspace_company_id, detected_at DESC)
  WHERE status = 'open' AND severity = 'critical';

ALTER TABLE zeta_integrity_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_can_select_integrity_violations" ON zeta_integrity_violations;
CREATE POLICY "authenticated_can_select_integrity_violations"
  ON zeta_integrity_violations FOR SELECT TO authenticated USING (true);
