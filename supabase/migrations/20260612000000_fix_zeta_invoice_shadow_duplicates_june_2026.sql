-- =============================================================================
-- proto_invoices — desactivar sombras `ZETA:{RegistroId}` duplicadas de junio 2026
-- + duplicado interno PRESTIS/CFETipo=0 (NOSER) Aldiesan.
--
-- Contexto:
--   `zeta-saldos-pipeline` insertó 39 filas sombra `ZETA:{RegistroId}` con
--   `category = 'Zeta / saldos pendientes'` que duplican facturas CCV1 reales
--   ya persistidas por el pipeline de comprobantes/ventas detalladas. Estas
--   sombras inflaron `salesPeriodUYU / salesPeriodUSD` de junio 2026 en
--   Copilot:
--     UYU: 1.371.367,50 mostrado vs 695.307,50 real (excedente +676.060 ≈
--          607.740 sombras + 68.320 duplicado interno Aldiesan − 1.830 NC neta)
--     USD: 10.031,46 mostrado vs 6.092,38 real (excedente +3.939,08 sombras)
--
-- Estrategia:
--   - NO borrar físicamente: marcar `is_active = false` para que cualquier
--     query con `applyProtoActiveListFilter('active')` o filtro explícito
--     `is_active = true` (motor de reconciliación financiera) deje de
--     incluirlas en `totalInvoiced` / `issuedInPeriod`.
--   - Anexar trazabilidad en `zeta_metadata.cleanup_audit` para que el
--     script `scripts/audit-zeta-june-2026-sales.mjs` pueda contar y
--     reportar la desactivación.
--
-- Idempotente:
--   - El predicado de match exige que la fila objetivo tenga `is_active = true`
--     y NO tenga ya `zeta_metadata.cleanup_audit.cleanup_batch` con el batch
--     actual; reaplicar la migración es no-op.
--
-- AUDIT previo (ejecutar antes de aplicar para confirmar los matches):
--
--   SELECT
--     pi.invoice_number AS shadow,
--     ccv1.invoice_number AS matched_ccv1,
--     pi.currency_code,
--     pi.total_amount,
--     pi.issue_date,
--     pc.name AS cliente
--   FROM public.proto_invoices pi
--   JOIN public.proto_invoices ccv1
--     ON ccv1.workspace_company_id = pi.workspace_company_id
--    AND ccv1.company_id = pi.company_id
--    AND ccv1.currency_code = pi.currency_code
--    AND ccv1.issue_date = pi.issue_date
--    AND ABS(ccv1.total_amount - pi.total_amount) <= 0.20
--    AND ccv1.invoice_number LIKE 'ZETA:CCV1:%'
--    AND ccv1.is_active = true
--   LEFT JOIN public.proto_companies pc ON pc.id = pi.company_id
--   WHERE pi.issue_date BETWEEN '2026-06-01' AND '2026-06-12'
--     AND pi.is_active = true
--     AND pi.invoice_number LIKE 'ZETA:%'
--     AND pi.invoice_number NOT LIKE 'ZETA:CCV1:%'
--     AND pi.category = 'Zeta / saldos pendientes'
--     AND pi.currency_code IN ('UYU','USD')
--   ORDER BY pi.currency_code, pi.total_amount DESC;
--
-- =============================================================================

DO $$
DECLARE
  shadow_deactivated integer := 0;
  prestis_deactivated integer := 0;
  cleanup_batch_tag CONSTANT text := 'fix_zeta_invoice_shadow_duplicates_june_2026';
  deactivation_ts CONSTANT timestamptz := now();
BEGIN
  -- ---------------------------------------------------------------------------
  -- Paso 1: sombras ZETA:{RegistroId} de junio con par CCV1 activo equivalente.
  --
  -- Para cada sombra buscamos una factura CCV1 activa con mismo
  -- workspace_company_id, company_id, currency_code, issue_date y total_amount
  -- dentro de tolerancia 0.20 (Zeta a veces emite el saldo redondeado mientras
  -- el CCV1 trae centavos, ej. 96624.00 vs 96623.88 / 12493.00 vs 12492.80).
  --
  -- La sombra elegida pasa a:
  --   - is_active = false
  --   - zeta_metadata.cleanup_audit = {
  --       deactivated_reason, deactivated_at,
  --       matched_ccv1_invoice_id, matched_ccv1_invoice_number, cleanup_batch
  --     }
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
    WHERE pi.issue_date BETWEEN '2026-06-01' AND '2026-06-12'
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
  -- Si una sombra matchea con varios CCV1 (raro pero posible — p. ej. dos
  -- ventas idénticas a Consumidor Final el mismo día), elegimos el CCV1 con
  -- id menor para que la operación sea determinística entre corridas.
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

  RAISE NOTICE '[%] sombras desactivadas: %', cleanup_batch_tag, shadow_deactivated;

  -- ---------------------------------------------------------------------------
  -- Paso 2: duplicado interno PRESTIS/CFETipo=0 (invoice_number con `:NOSER:`)
  -- con par CCV1 DGI normal del mismo cliente, moneda, fecha y total.
  --
  -- Caso confirmado: Aldiesan SRL 2026-06-04 UYU 68.320 — coexisten:
  --   - ZETA:CCV1:0:144:A:2983                       (CFETipo=111 DGI, issued)
  --   - ZETA:CCV1:NOSER:144:0:701:96e3eed1…          (CFETipo=0   PRESTIS, paid)
  -- Ambos suman al `totalInvoiced` actual.
  -- ---------------------------------------------------------------------------
  WITH prestis_candidates AS (
    SELECT
      pi.id                AS prestis_id,
      pi.zeta_metadata     AS prestis_meta,
      ccv1.id              AS ccv1_id,
      ccv1.invoice_number  AS ccv1_invoice_number
    FROM public.proto_invoices pi
    JOIN public.proto_invoices ccv1
      ON ccv1.workspace_company_id = pi.workspace_company_id
     AND ccv1.company_id = pi.company_id
     AND ccv1.currency_code = pi.currency_code
     AND ccv1.issue_date = pi.issue_date
     AND ABS(ccv1.total_amount - pi.total_amount) <= 0.20
     AND ccv1.invoice_number LIKE 'ZETA:CCV1:%'
     AND ccv1.invoice_number NOT LIKE 'ZETA:CCV1:NOSER:%'
     AND ccv1.is_active = true
     AND COALESCE(
           (ccv1.zeta_metadata->'zeta_customer_voucher_v1'->>'cfe_tipo')::int,
           (ccv1.zeta_metadata->'zeta_customer_voucher_v1'->>'cfeTipo')::int,
           (ccv1.zeta_metadata->'zeta_customer_voucher_v1'->>'CFETipo')::int,
           -1
         ) <> 0
    WHERE pi.issue_date BETWEEN '2026-06-01' AND '2026-06-12'
      AND pi.is_active = true
      AND pi.invoice_number LIKE 'ZETA:CCV1:NOSER:%'
      AND pi.currency_code IN ('UYU', 'USD')
      AND COALESCE(
            (pi.zeta_metadata->'zeta_customer_voucher_v1'->>'cfe_tipo')::int,
            (pi.zeta_metadata->'zeta_customer_voucher_v1'->>'cfeTipo')::int,
            (pi.zeta_metadata->'zeta_customer_voucher_v1'->>'CFETipo')::int,
            -1
          ) = 0
      AND COALESCE(
            pi.zeta_metadata->'cleanup_audit'->>'cleanup_batch',
            ''
          ) <> cleanup_batch_tag
  ),
  prestis_dedup AS (
    SELECT
      prestis_id,
      prestis_meta,
      MIN(ccv1_id::text) AS ccv1_id_text,
      MIN(ccv1_invoice_number) AS ccv1_invoice_number
    FROM prestis_candidates
    GROUP BY prestis_id, prestis_meta
  ),
  updated_prestis AS (
    UPDATE public.proto_invoices pi
    SET
      is_active = false,
      zeta_metadata = COALESCE(pi.zeta_metadata, '{}'::jsonb)
        || jsonb_build_object(
             'cleanup_audit',
             jsonb_build_object(
               'deactivated_reason',         'duplicate_internal_prestis_invoice_matched_to_dgi_ccv1',
               'deactivated_at',             to_jsonb(deactivation_ts),
               'matched_ccv1_invoice_id',    pd.ccv1_id_text,
               'matched_ccv1_invoice_number', pd.ccv1_invoice_number,
               'cleanup_batch',              cleanup_batch_tag
             )
           )
    FROM prestis_dedup pd
    WHERE pi.id = pd.prestis_id
    RETURNING pi.id
  )
  SELECT COUNT(*) INTO prestis_deactivated FROM updated_prestis;

  RAISE NOTICE '[%] duplicados internos PRESTIS desactivados: %',
    cleanup_batch_tag, prestis_deactivated;

  RAISE NOTICE '[%] total: %', cleanup_batch_tag, shadow_deactivated + prestis_deactivated;
END $$;
