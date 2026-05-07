-- =============================================================================
-- ZETA-05-01 — `proto_receipts` soporte sync Zeta recibos de cobranza
-- =============================================================================
-- Propósito:
--   - Agregar `currency_code` normalizada ('USD' | 'UYU') para recibos.
--   - Permitir recibos Zeta sin cliente resuelto (`company_id` NULL) sin crear
--     `proto_companies` sintéticos. La seguridad tenant se mantiene por
--     `workspace_company_id`.
--
-- Idempotente: si la columna ya existe no hace nada; si `company_id` ya permite
-- NULL, el ALTER no modifica datos.
--
-- NO toca:
--   - proto_invoices
--   - balances
--   - enrichment de facturas
--   - RLS/policies
-- =============================================================================

do $zeta0501$
begin
  if to_regclass('public.proto_receipts') is null then
    raise notice 'zeta-05-01: public.proto_receipts no existe; omitido';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'proto_receipts'
      and column_name  = 'currency_code'
  ) then
    alter table public.proto_receipts
      add column currency_code text null;

    comment on column public.proto_receipts.currency_code is
      'Moneda normalizada (USD | UYU) para recibos Zeta; NULL si Zeta no informa moneda reconocible.';
  else
    raise notice 'zeta-05-01: proto_receipts.currency_code ya existe; sin cambios';
  end if;

  -- Recibos del endpoint Zeta pueden venir con cliente no resoluble en
  -- proto_companies (ej. Consumidor Final). Se persisten como unlinked con
  -- workspace_company_id obligatorio y company_id NULL.
  alter table public.proto_receipts
    alter column company_id drop not null;
end;
$zeta0501$;
