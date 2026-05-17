-- ZETA-16-01: Acknowledged drifts — historical drift suppression.
--
-- When a drift is acknowledged (e.g. known 9-invoice orphan from April 2026),
-- the health score treats it as informational, not operational failure.
-- Acknowledgements can expire (acknowledgement_expires_at) or be permanent (NULL).
--
-- A drift remains suppressed only if:
--   current_drift <= last_known_drift + DRIFT_TOLERANCE (drift hasn't grown)
--   AND NOT expired
--
-- Idempotente: UNIQUE on (workspace_company_id, entity, audit_scope).

CREATE TABLE IF NOT EXISTS zeta_acknowledged_drifts (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id       uuid        NOT NULL,
  entity                     text        NOT NULL CHECK (entity <> ''),
  audit_scope                text        NOT NULL CHECK (audit_scope <> ''),
  acknowledged_at            timestamptz NOT NULL DEFAULT now(),
  acknowledged_by            text        NOT NULL,
  acknowledgement_reason     text        NOT NULL,
  acknowledgement_expires_at timestamptz,
  last_known_drift           integer     NOT NULL DEFAULT 0,
  last_known_zeta_count      integer     NOT NULL DEFAULT 0,
  last_known_local_count     integer     NOT NULL DEFAULT 0,
  CONSTRAINT zeta_ack_drifts_ws_entity_scope_unique
    UNIQUE (workspace_company_id, entity, audit_scope)
);

CREATE INDEX IF NOT EXISTS idx_zeta_ack_drifts_workspace
  ON zeta_acknowledged_drifts (workspace_company_id);

ALTER TABLE zeta_acknowledged_drifts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'zeta_acknowledged_drifts' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON zeta_acknowledged_drifts FOR ALL USING (true);
  END IF;
END $$;
