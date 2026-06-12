-- =============================================================================
-- proto_invoices — desactivar Prestis NOSER marzo 2026 (CFETipo=0, no venta DGI)
--
-- Regla de negocio:
--   Si un comprobante NO aparece en Zeta VentasDetalladas / no es CFE DGI emitido,
--   NO debe contar como venta en Copilot.
--
-- Caso:
--   ZETA:CCV1:NOSER:185:0:701:70f8a5d071f3482201e4094eed54
--   Prestis S.A.S. · UYU 9.760,00 · issue_date 2026-03-04 · CFETipo=0
--   ComprobanteCodigo=701 (interno). No figura en RESTFacturaClienteV4VentasDetalladas.
--
-- Contexto:
--   La migración `20260612010000` lo marcó REVIEW_REQUIRED sin desactivar.
--   Auditoría histórica 2026-01-01→2026-06-12 confirmó Δ UYU marzo = +9.760,00
--   (Copilot lo contaba, Zeta VentasDetalladas no).
--
-- Estrategia:
--   `is_active = false` + trazabilidad en `zeta_metadata.cleanup_audit`.
--   El motor financiero ya excluye filas inactivas.
--
-- Idempotente:
--   Solo aplica si `is_active = true` y `cleanup_batch` distinto del tag actual.
--
-- =============================================================================

DO $$
DECLARE
  deactivated         integer := 0;
  cleanup_batch_tag   CONSTANT text := 'deactivate_prestis_noser_march_2026';
  deactivation_ts     CONSTANT timestamptz := now();
  prestis_noser_id    CONSTANT uuid := 'd923bfdb-e523-45fc-8930-ccb2125c7d89';
BEGIN
  WITH updated AS (
    UPDATE public.proto_invoices pi
    SET
      is_active = false,
      zeta_metadata = COALESCE(pi.zeta_metadata, '{}'::jsonb)
        || jsonb_build_object(
             'cleanup_audit',
             jsonb_build_object(
               'deactivated_reason',  'noser_cfe0_not_present_in_zeta_sales',
               'deactivated_at',      to_jsonb(deactivation_ts),
               'cleanup_batch',       cleanup_batch_tag,
               'review_required',     false,
               'notes',               'CFETipo=0 ComprobanteCodigo=701. No aparece en Zeta VentasDetalladas — no es venta DGI emitida. Regla: no contar como venta en Copilot. invoice_number=ZETA:CCV1:NOSER:185:0:701:70f8a5d071f3482201e4094eed54 UYU 9760.00 2026-03-04.'
             )
           )
    WHERE pi.id = prestis_noser_id
      AND pi.is_active = true
      AND COALESCE(
            pi.zeta_metadata->'cleanup_audit'->>'cleanup_batch',
            ''
          ) <> cleanup_batch_tag
    RETURNING pi.id
  )
  SELECT COUNT(*) INTO deactivated FROM updated;

  RAISE NOTICE '[%] Prestis NOSER marzo desactivado (noser_cfe0_not_present_in_zeta_sales): %',
    cleanup_batch_tag, deactivated;
END $$;
