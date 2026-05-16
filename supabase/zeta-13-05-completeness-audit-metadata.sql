-- ZETA-13-05: Agrega columna metadata jsonb a zeta_completeness_audits.
--
-- Permite persistir métricas del classifier por audit de invoices:
--   zeta_raw_count, zeta_accepted_count, zeta_skipped_count,
--   skipped_classifier_counts, sample_skipped_classifier.
--
-- Separado de zeta-13-01 para no re-ejecutar una migración ya aplicada.
-- Es idempotente: IF NOT EXISTS en el ADD COLUMN.

ALTER TABLE zeta_completeness_audits
  ADD COLUMN IF NOT EXISTS metadata jsonb;
