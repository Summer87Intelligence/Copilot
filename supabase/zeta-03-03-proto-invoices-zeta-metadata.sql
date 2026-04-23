-- =============================================================================
-- ZETA-03-03 — `public.proto_invoices.zeta_metadata` (jsonb, nullable)
-- =============================================================================
-- Propósito: persistir bloques versionados Zeta (p. ej. `zeta_customer_voucher_v1`,
-- `zeta_comprobante_identity_v1`) y permitir lookups PostgREST (`zeta_metadata->…`)
-- en pipelines de vouchers y saldos pendientes.
--
-- Idempotente y conservador: no backfill; valores NULL hasta el próximo sync.
-- Prerrequisito: tabla `public.proto_invoices` existente.
-- =============================================================================

do $zeta0303$
begin
  if to_regclass('public.proto_invoices') is null then
    raise notice 'zeta-03-03: public.proto_invoices no existe; omitido';
    return;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'proto_invoices'
      and column_name = 'zeta_metadata'
  ) then
    raise notice 'zeta-03-03: columna zeta_metadata ya existe; sin cambios';
    return;
  end if;

  alter table public.proto_invoices
    add column zeta_metadata jsonb null;
end;
$zeta0303$;

comment on column public.proto_invoices.zeta_metadata is
  'JSON Zeta en factura: comprobante por cliente (voucher v1), identidad RegistroId, cruces con saldos pendientes.';
