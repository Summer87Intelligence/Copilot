-- =============================================================================
-- ZETA-04-01 — `proto_invoices.currency_code` (text, nullable)
-- =============================================================================
-- Propósito: columna normalizada 'USD' | 'UYU' que el pipeline de enriquecimiento
-- escribe desde RESTFacturaClienteV4VentasDetalladas (MonedaSimbolo/MonedaCodigo).
-- La ingesta de vouchers NO la escribe (queda NULL hasta que corra el enrichment).
--
-- Idempotente: si la columna ya existe no hace nada.
-- =============================================================================

do $zeta0401$
begin
  if to_regclass('public.proto_invoices') is null then
    raise notice 'zeta-04-01: public.proto_invoices no existe; omitido';
    return;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'proto_invoices'
      and column_name  = 'currency_code'
  ) then
    raise notice 'zeta-04-01: currency_code ya existe; sin cambios';
    return;
  end if;

  alter table public.proto_invoices
    add column currency_code text null;

  comment on column public.proto_invoices.currency_code is
    'Moneda normalizada (USD | UYU). Completa el pipeline zeta-currency-enrichment desde VentasDetalladas; NULL hasta que corra.';
end;
$zeta0401$;
