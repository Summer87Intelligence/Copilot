-- ZETA-16-03: Contract snapshots — sanitized payload samples from Zeta.
--
-- Stores a representative row sample per endpoint to detect shape changes.
-- Used by the contract guard to compare runtime shapes against known baseline.
-- Rows are write-once: new shapes append, they don't replace.
-- Sanitized: no PII — only field names and structural metadata.
--
-- Idempotente: IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS zeta_contract_snapshots (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sampled_at           timestamptz NOT NULL DEFAULT now(),
  endpoint             text        NOT NULL CHECK (endpoint <> ''),
  workspace_company_id uuid,
  schema_version       text        NOT NULL DEFAULT 'v1',
  field_names          text[]      NOT NULL DEFAULT '{}',
  unknown_fields       text[]      NOT NULL DEFAULT '{}',
  validation_errors    text[]      NOT NULL DEFAULT '{}',
  is_valid             boolean     NOT NULL DEFAULT true,
  row_count_in_batch   integer     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_zeta_contract_snapshots_endpoint_time
  ON zeta_contract_snapshots (endpoint, sampled_at DESC);

CREATE INDEX IF NOT EXISTS idx_zeta_contract_snapshots_unknown_fields
  ON zeta_contract_snapshots (sampled_at DESC)
  WHERE array_length(unknown_fields, 1) > 0;

ALTER TABLE zeta_contract_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'zeta_contract_snapshots' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON zeta_contract_snapshots FOR ALL USING (true);
  END IF;
END $$;
