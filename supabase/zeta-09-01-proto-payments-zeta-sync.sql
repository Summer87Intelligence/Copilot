-- =============================================================================
-- ZETA-09-01 — `proto_payments` soporte sync Zeta recibos de pago a proveedores
-- =============================================================================
-- Propósito:
--   - Permitir pagos Zeta sin cliente local (`company_id` NULL), porque Zeta
--     informa proveedores y este proyecto todavía no crea `proto_vendors`.
--   - Agregar moneda normalizada, fuente y metadata de auditoría Zeta.
--
-- Idempotente y no destructiva. No ejecuta sync, no toca facturas, recibos,
-- saldos, cuotas, cartera ni reconciliación.
-- =============================================================================

do $zeta0901$
begin
  if to_regclass('public.proto_payments') is null then
    raise notice 'zeta-09-01: public.proto_payments no existe; omitido';
    return;
  end if;

  -- Recibos de pago Zeta se emiten a proveedores; por ahora quedan unlinked
  -- respecto de `proto_companies` (clientes).
  alter table public.proto_payments
    alter column company_id drop not null;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'proto_payments'
      and column_name = 'currency_code'
  ) then
    alter table public.proto_payments
      add column currency_code text null;

    comment on column public.proto_payments.currency_code is
      'Moneda normalizada (USD | UYU) para pagos Zeta; NULL si Zeta no informa moneda reconocible.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'proto_payments'
      and column_name = 'source'
  ) then
    alter table public.proto_payments
      add column source text null default 'manual';

    comment on column public.proto_payments.source is
      'Origen del pago operativo: manual o zeta.';
  end if;

  update public.proto_payments
  set source = 'manual'
  where source is null;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'proto_payments'
      and column_name = 'zeta_metadata'
  ) then
    alter table public.proto_payments
      add column zeta_metadata jsonb null;

    comment on column public.proto_payments.zeta_metadata is
      'Metadata normalizada de Zeta para recibos de pago a proveedores (ids, códigos, caja, moneda).';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'proto_payments'
      and c.conname = 'proto_payments_source_check'
  ) then
    alter table public.proto_payments
      add constraint proto_payments_source_check
      check (source is null or source in ('manual', 'zeta'));
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'proto_payments'
      and c.conname = 'proto_payments_currency_code_check'
  ) then
    alter table public.proto_payments
      add constraint proto_payments_currency_code_check
      check (currency_code is null or currency_code in ('USD', 'UYU'));
  end if;
end;
$zeta0901$;

create index if not exists idx_proto_payments_workspace_payment_number
  on public.proto_payments (workspace_company_id, payment_number);

create index if not exists idx_proto_payments_workspace_source
  on public.proto_payments (workspace_company_id, source);

create index if not exists idx_proto_payments_workspace_zeta_registro_id
  on public.proto_payments (workspace_company_id, ((zeta_metadata ->> 'zeta_registro_id')))
  where source = 'zeta';
