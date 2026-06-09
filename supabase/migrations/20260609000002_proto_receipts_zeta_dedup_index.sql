-- =============================================================================
-- proto_receipts — índice único parcial para recibos Zeta (ZETA:COB:*)
-- Previene duplicados de sincronización a nivel de base de datos.
-- Idempotente: seguro si ya fue aplicada.
-- =============================================================================
-- AUDIT previo — ejecutar manualmente para revisar duplicados antes de migrar:
--
--   SELECT workspace_company_id, receipt_number, COUNT(*) AS dupes
--   FROM public.proto_receipts
--   WHERE is_active = true
--     AND receipt_number LIKE 'ZETA:COB:%'
--   GROUP BY workspace_company_id, receipt_number
--   HAVING COUNT(*) > 1
--   ORDER BY dupes DESC;
--
-- =============================================================================

-- Paso 1: Soft-delete de recibos duplicados (conserva el más reciente por id UUID).
-- Sólo afecta filas activas con número ZETA:COB:* que tengan duplicados exactos.
DO $$
DECLARE
  deleted_count integer;
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY workspace_company_id, receipt_number
        ORDER BY id DESC
      ) AS rn
    FROM public.proto_receipts
    WHERE is_active = true
      AND receipt_number LIKE 'ZETA:COB:%'
  ),
  to_deactivate AS (
    SELECT id FROM ranked WHERE rn > 1
  )
  UPDATE public.proto_receipts
  SET is_active = false
  WHERE id IN (SELECT id FROM to_deactivate);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count > 0 THEN
    RAISE NOTICE '[proto_receipts_dedup] Soft-deleted % recibo(s) duplicado(s).', deleted_count;
  ELSE
    RAISE NOTICE '[proto_receipts_dedup] Sin duplicados encontrados.';
  END IF;
END $$;

-- Paso 2: Índice único parcial — sólo recibos activos con receipt_number ZETA:COB:*
CREATE UNIQUE INDEX IF NOT EXISTS uq_proto_receipts_zeta_cob_active
  ON public.proto_receipts (workspace_company_id, receipt_number)
  WHERE is_active = true
    AND receipt_number LIKE 'ZETA:COB:%';

COMMENT ON INDEX public.uq_proto_receipts_zeta_cob_active IS
  'Previene duplicados de sincronización Zeta: un recibo ZETA:COB activo por workspace+receipt_number.';
