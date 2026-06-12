-- =============================================================================
-- proto_invoices — cleanup histórico abril/mayo 2026 (continuación de
-- `20260612000000_fix_zeta_invoice_shadow_duplicates_june_2026`).
--
-- Contexto:
--   Tras reconciliar junio (commit 7f0cf6b), quedó pendiente el cleanup de los
--   meses previos. El audit READ-ONLY en `proto_invoices` arrojó:
--
--     - 9 sombras `ZETA:{RegistroId}` activas en abril 2026 con par CCV1
--       activo equivalente (mismo company_id, moneda, fecha, total ±0.20).
--     - 2 sombras `ZETA:{RegistroId}` activas en mayo 2026 con par CCV1
--       activo equivalente (ZETA:2674 matchea a 2 CCV1 del mismo cliente/día/
--       total — es ambiguo pero la sombra es la duplicación; preservamos
--       las CCV1, descartamos la sombra).
--     - 1 sombra huérfana `ZETA:2627` (Ubal Dalmu Maria Patricia, UYU 39.949,
--       2026-05-04) con `Emitido=N` en Zeta — reemplazada por una CFE
--       definitiva que actualmente no está en `proto_invoices` (issue_date
--       Ubal Dalmu mayo solo tiene CCV1 32.629). Se desactiva por id explícito.
--     - 1 caso REVIEW_REQUIRED: Prestis NOSER UYU 9.760 marzo 2026
--       (`ZETA:CCV1:NOSER:185:0:701:70f8a5d071f3482201e4094eed54`,
--       2026-03-04, CFETipo=0). NO desactivar — solo flaggear en
--       zeta_metadata.cleanup_audit.review_required = true.
--
-- Estrategia:
--   Igual que la migración de junio: NO borrar físicamente, marcar
--   `is_active = false` + trazabilidad completa en `zeta_metadata.cleanup_audit`.
--   El motor de reconciliación financiera ya ignora filas con `is_active=false`.
--
-- Idempotente:
--   - Paso 1 y 2: el predicado exige `is_active=true` y `cleanup_batch <> tag`.
--   - Paso 3 (Ubal Dalmu por id): mismo predicado de batch.
--   - Paso 4 (Prestis REVIEW): no toca is_active; merge en metadata; reaplicar
--     reescribe el mismo flag, no-op semántico.
--
-- AUDIT previo (read-only, ejecutar antes de aplicar):
--
--   SELECT to_char(date_trunc('month', pi.issue_date), 'YYYY-MM') AS ym,
--          COUNT(*) AS shadow_count
--   FROM public.proto_invoices pi
--   JOIN public.proto_invoices ccv1
--     ON ccv1.workspace_company_id = pi.workspace_company_id
--    AND ccv1.company_id = pi.company_id
--    AND ccv1.currency_code = pi.currency_code
--    AND ccv1.issue_date = pi.issue_date
--    AND ABS(ccv1.total_amount - pi.total_amount) <= 0.20
--    AND ccv1.invoice_number LIKE 'ZETA:CCV1:%'
--    AND ccv1.is_active = true
--   WHERE pi.issue_date BETWEEN '2026-04-01' AND '2026-05-31'
--     AND pi.is_active = true
--     AND pi.invoice_number LIKE 'ZETA:%'
--     AND pi.invoice_number NOT LIKE 'ZETA:CCV1:%'
--     AND pi.category = 'Zeta / saldos pendientes'
--     AND pi.currency_code IN ('UYU','USD')
--   GROUP BY 1 ORDER BY 1;
--
-- =============================================================================

DO $$
DECLARE
  shadow_deactivated  integer := 0;
  orphan_deactivated  integer := 0;
  review_flagged      integer := 0;
  cleanup_batch_tag   CONSTANT text := 'zeta_shadow_cleanup_history_apr_may_2026';
  deactivation_ts     CONSTANT timestamptz := now();

  -- IDs explícitos confirmados por audit (read-only) sobre el snapshot actual.
  ubal_dalmu_orphan_shadow_id   CONSTANT uuid := '77411fbf-be73-476d-b62f-2bc249937052';
  prestis_march_review_id       CONSTANT uuid := 'd923bfdb-e523-45fc-8930-ccb2125c7d89';
BEGIN
  -- ---------------------------------------------------------------------------
  -- Paso 1: sombras `ZETA:{RegistroId}` de abril/mayo con par CCV1 equivalente.
  -- Mismo predicado de match que la migración de junio (tolerancia ±0.20).
  -- Si hay varios CCV1 candidatos para una sombra, elegimos el id menor para
  -- que la operación sea determinística entre corridas.
  -- ---------------------------------------------------------------------------
  WITH shadow_candidates AS (
    SELECT
      pi.id                                        AS shadow_id,
      pi.zeta_metadata                             AS shadow_meta,
      ccv1.id                                      AS ccv1_id,
      ccv1.invoice_number                          AS ccv1_invoice_number
    FROM public.proto_invoices pi
    JOIN public.proto_invoices ccv1
      ON ccv1.workspace_company_id = pi.workspace_company_id
     AND ccv1.company_id = pi.company_id
     AND ccv1.currency_code = pi.currency_code
     AND ccv1.issue_date = pi.issue_date
     AND ABS(ccv1.total_amount - pi.total_amount) <= 0.20
     AND ccv1.invoice_number LIKE 'ZETA:CCV1:%'
     AND ccv1.is_active = true
    WHERE pi.issue_date BETWEEN '2026-04-01' AND '2026-05-31'
      AND pi.is_active = true
      AND pi.invoice_number LIKE 'ZETA:%'
      AND pi.invoice_number NOT LIKE 'ZETA:CCV1:%'
      AND pi.category = 'Zeta / saldos pendientes'
      AND pi.currency_code IN ('UYU', 'USD')
      AND COALESCE(
            pi.zeta_metadata->'cleanup_audit'->>'cleanup_batch',
            ''
          ) <> cleanup_batch_tag
  ),
  shadow_dedup AS (
    SELECT
      shadow_id,
      shadow_meta,
      MIN(ccv1_id::text) AS ccv1_id_text,
      MIN(ccv1_invoice_number) AS ccv1_invoice_number
    FROM shadow_candidates
    GROUP BY shadow_id, shadow_meta
  ),
  updated_shadow AS (
    UPDATE public.proto_invoices pi
    SET
      is_active = false,
      zeta_metadata = COALESCE(pi.zeta_metadata, '{}'::jsonb)
        || jsonb_build_object(
             'cleanup_audit',
             jsonb_build_object(
               'deactivated_reason',         'duplicate_shadow_matched_to_ccv1',
               'deactivated_at',             to_jsonb(deactivation_ts),
               'matched_ccv1_invoice_id',    sd.ccv1_id_text,
               'matched_ccv1_invoice_number', sd.ccv1_invoice_number,
               'cleanup_batch',              cleanup_batch_tag
             )
           )
    FROM shadow_dedup sd
    WHERE pi.id = sd.shadow_id
    RETURNING pi.id
  )
  SELECT COUNT(*) INTO shadow_deactivated FROM updated_shadow;

  RAISE NOTICE '[%] sombras abril+mayo desactivadas: %', cleanup_batch_tag, shadow_deactivated;

  -- ---------------------------------------------------------------------------
  -- Paso 2: sombra huérfana Ubal Dalmu — `ZETA:2627`, UYU 39.949,00,
  -- 2026-05-04. Sin CCV1 par (la única CCV1 del cliente ese día es 32.629,
  -- distinto total). Causa raíz: Zeta emitió un comprobante `Emitido=N`
  -- (borrador/anulado) que el pipeline de saldos persistió como sombra; la
  -- CFE definitiva no está en `proto_invoices` (no llegó a llamarse).
  -- Desactivamos por id explícito.
  -- ---------------------------------------------------------------------------
  WITH updated_orphan AS (
    UPDATE public.proto_invoices pi
    SET
      is_active = false,
      zeta_metadata = COALESCE(pi.zeta_metadata, '{}'::jsonb)
        || jsonb_build_object(
             'cleanup_audit',
             jsonb_build_object(
               'deactivated_reason',  'orphan_shadow_emitido_n_replaced_by_definitive_cfe',
               'deactivated_at',      to_jsonb(deactivation_ts),
               'matched_ccv1_invoice_id',    NULL,
               'matched_ccv1_invoice_number', NULL,
               'cleanup_batch',       cleanup_batch_tag,
               'notes',               'Zeta emitió comprobante con Emitido=N reemplazado por CFE definitiva no presente en proto_invoices. Cliente: Ubal Dalmu Maria Patricia. UYU 39949.00 issue_date 2026-05-04.'
             )
           )
    WHERE pi.id = ubal_dalmu_orphan_shadow_id
      AND pi.is_active = true
      AND COALESCE(
            pi.zeta_metadata->'cleanup_audit'->>'cleanup_batch',
            ''
          ) <> cleanup_batch_tag
    RETURNING pi.id
  )
  SELECT COUNT(*) INTO orphan_deactivated FROM updated_orphan;

  RAISE NOTICE '[%] sombra huérfana Ubal Dalmu desactivada: %', cleanup_batch_tag, orphan_deactivated;

  -- ---------------------------------------------------------------------------
  -- Paso 3: REVIEW_REQUIRED Prestis NOSER UYU 9.760 marzo 2026.
  -- NO se desactiva — el usuario solicitó explícitamente dejarla marcada para
  -- revisión manual. Se guarda flag en `zeta_metadata.cleanup_audit` para que
  -- el detector de unicidad y los reportes operativos puedan filtrarla.
  -- ---------------------------------------------------------------------------
  WITH updated_review AS (
    UPDATE public.proto_invoices pi
    SET
      zeta_metadata = COALESCE(pi.zeta_metadata, '{}'::jsonb)
        || jsonb_build_object(
             'cleanup_audit',
             jsonb_build_object(
               'review_required',        true,
               'review_reason',          'prestis_noser_uyu_9760_march_2026_no_match_against_dgi_ccv1',
               'review_flagged_at',      to_jsonb(deactivation_ts),
               'cleanup_batch',          cleanup_batch_tag,
               'notes',                  'NO desactivar. Caso pendiente revisión manual: PRESTIS NOSER CFETipo=0 UYU 9760.00 2026-03-04 sin par CCV1 DGI definitiva identificable.'
             )
           )
    WHERE pi.id = prestis_march_review_id
      AND COALESCE(
            pi.zeta_metadata->'cleanup_audit'->>'cleanup_batch',
            ''
          ) <> cleanup_batch_tag
    RETURNING pi.id
  )
  SELECT COUNT(*) INTO review_flagged FROM updated_review;

  RAISE NOTICE '[%] Prestis NOSER marzo REVIEW_REQUIRED flagged: %', cleanup_batch_tag, review_flagged;

  RAISE NOTICE '[%] total: shadows=% orphan=% review=%',
    cleanup_batch_tag, shadow_deactivated, orphan_deactivated, review_flagged;
END $$;
