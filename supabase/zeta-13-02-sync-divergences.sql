-- ZETA-13-02: Sync Divergences
-- Registra divergencias campo a campo entre valores en Zeta y en local
-- Permite detectar registros donde el dato local no coincide con la fuente de verdad

CREATE TABLE IF NOT EXISTS zeta_sync_divergences (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity                text        NOT NULL CHECK (entity IN ('invoices', 'receipts', 'installments', 'contacts')),
  zeta_registro_id      text        NOT NULL,
  local_record_id       uuid,                          -- FK lógica (no enforced: entidad variable)
  field_name            text        NOT NULL,          -- 'balance_amount' | 'currency_code' | 'status' | etc.
  zeta_value            text,                          -- Valor reportado por Zeta (serializado)
  local_value           text,                          -- Valor en la BD local
  severity              text        NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  status                text        NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'resolved', 'auto_fixed', 'acknowledged')),
  detected_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  resolution_note       text
);

-- Una fila por campo divergente por registro: actualizar en re-scan si ya existe
CREATE UNIQUE INDEX IF NOT EXISTS idx_zeta_divergences_unique_field
  ON zeta_sync_divergences (workspace_company_id, entity, zeta_registro_id, field_name)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_zeta_divergences_workspace_entity
  ON zeta_sync_divergences (workspace_company_id, entity, status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_zeta_divergences_open_critical
  ON zeta_sync_divergences (workspace_company_id, detected_at DESC)
  WHERE status = 'open' AND severity = 'critical';

ALTER TABLE zeta_sync_divergences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_can_select_sync_divergences" ON zeta_sync_divergences;
CREATE POLICY "authenticated_can_select_sync_divergences"
  ON zeta_sync_divergences FOR SELECT TO authenticated USING (true);
