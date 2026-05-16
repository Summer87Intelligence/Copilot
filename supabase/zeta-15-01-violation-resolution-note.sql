-- ZETA-15-01: Adds resolution_note to zeta_integrity_violations.
-- Required by auto-resolve lifecycle: records why a violation was resolved.
-- Idempotente: IF NOT EXISTS.

ALTER TABLE zeta_integrity_violations
  ADD COLUMN IF NOT EXISTS resolution_note text;
