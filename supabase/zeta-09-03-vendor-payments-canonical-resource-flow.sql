-- =============================================================================
-- ZETA-09-03 — Unificar resource_flow vendor payments → zeta-sync-vendor-payments
-- =============================================================================
-- Problema: pipeline cron usa `zeta-sync-vendor-payments` (zeta_pipeline_runs)
-- pero sync state/runs usaban `zeta_vendor_payments_v1` → UI inconsistente.
--
-- Esta migración renombra filas legacy sin borrar historial de corridas.
-- Idempotente. No toca proto_payments ni datos financieros.
-- =============================================================================

do $zeta0903$
declare
  v_canonical constant text := 'zeta-sync-vendor-payments';
  v_legacy    constant text := 'zeta_vendor_payments_v1';
begin
  if to_regclass('public.zeta_sync_state') is null then
    raise notice 'zeta-09-03: zeta_sync_state no existe; omitido';
    return;
  end if;

  -- Merge: si ya existe fila canónica, fusionar métricas y eliminar legacy.
  update public.zeta_sync_state c
  set
    last_success_at = greatest(c.last_success_at, l.last_success_at),
    bootstrap_completed = c.bootstrap_completed or l.bootstrap_completed,
    last_success_run_id = coalesce(c.last_success_run_id, l.last_success_run_id),
    last_run_id = coalesce(c.last_run_id, l.last_run_id),
    watermark = case
      when c.watermark is null or c.watermark = '' then l.watermark
      else c.watermark
    end,
    updated_at = greatest(c.updated_at, l.updated_at)
  from public.zeta_sync_state l
  where l.resource_flow = v_legacy
    and c.company_id = l.company_id
    and c.resource_flow = v_canonical;

  delete from public.zeta_sync_state l
  using public.zeta_sync_state c
  where l.resource_flow = v_legacy
    and c.company_id = l.company_id
    and c.resource_flow = v_canonical;

  update public.zeta_sync_state
  set resource_flow = v_canonical
  where resource_flow = v_legacy;
end;
$zeta0903$;

do $zeta0903runs$
begin
  if to_regclass('public.zeta_sync_runs') is null then
    raise notice 'zeta-09-03: zeta_sync_runs no existe; omitido';
    return;
  end if;

  update public.zeta_sync_runs
  set resource_flow = 'zeta-sync-vendor-payments'
  where resource_flow = 'zeta_vendor_payments_v1';
end;
$zeta0903runs$;
