-- Q-01: Índice parcial para queries de prefijo LIKE 'ZETA:CCV1:%'
-- Cubre las 3 rutas de lookup en saldos pipeline (registro metadata, heurístico, zero-pass).
-- CONCURRENTLY: no bloquea escrituras en producción durante la creación.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proto_invoices_ccv1_wid_cid
  ON proto_invoices (workspace_company_id, company_id, invoice_number text_pattern_ops)
  WHERE invoice_number LIKE 'ZETA:CCV1:%';
