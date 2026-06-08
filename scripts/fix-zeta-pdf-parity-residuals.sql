-- =============================================================================
-- Fix idempotente — 4 diferencias residuales audit:zeta-pdf-parity
-- Preferir: EXECUTE=true node --env-file=.env.local --import tsx scripts/fix-zeta-pdf-parity-residuals.ts
-- =============================================================================

-- 1) Trexys USD (cod 182) — reasignar ZETA:COB:2381 / A-614 / 690.47
/*
SELECT r.id, r.company_id, c."Codigo", r.reference, r.amount, r.receipt_date, r.is_active
FROM proto_receipts r
LEFT JOIN proto_companies c ON c.id = r.company_id
WHERE r.receipt_number = 'ZETA:COB:2381'
  AND r.workspace_company_id = :workspace_id;

UPDATE proto_receipts r
SET company_id = trexys.id,
    currency = 'USD',
    currency_code = 'USD',
    updated_at = now()
FROM proto_companies trexys
WHERE r.receipt_number = 'ZETA:COB:2381'
  AND r.workspace_company_id = :workspace_id
  AND trexys."Codigo" = '182'
  AND trexys.workspace_company_id = :workspace_id
  AND r.company_id IS DISTINCT FROM trexys.id
  AND NOT EXISTS (
    SELECT 1 FROM proto_receipts x
    WHERE x.company_id = trexys.id
      AND x.receipt_number = 'ZETA:COB:2381'
      AND x.is_active = true
  );
*/

-- 2) Nirmex UYU (cod 90) — archivar + reasignar ZETA:COB:2716 a sink VARIOS USD
--    (no usar cod 200 — está en PDF auditoría). ledgerMode incluye is_active=false.
/*
UPDATE proto_receipts r
SET company_id = sink.id,
    is_active = false,
    archived_at = COALESCE(r.archived_at, now()),
    updated_at = now()
FROM proto_companies sink
WHERE r.receipt_number = 'ZETA:COB:2716'
  AND r.workspace_company_id = :workspace_id
  AND sink."Codigo" = 'VARIOS USD'
  AND sink.workspace_company_id = :workspace_id
  AND (r.is_active = true OR r.company_id IS DISTINCT FROM sink.id);
*/

-- 3) PRESTIS — vía sync TS tras classifier (no SQL manual)
