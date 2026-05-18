-- =============================================================================
-- ZETA-09-02 — Idempotencia DB: pagos Zeta por (workspace, payment_number)
-- =============================================================================
-- Segunda línea de defensa contra duplicados / race conditions en sync.
-- Solo aplica a payment_number con prefijo ZETA:PAG: (integración Zeta).
-- Pagos manuales (OP-*, etc.) no se ven afectados.
--
-- Pre-requisito: sin duplicados activos en (workspace_company_id, payment_number)
-- para filas ZETA:PAG:% con is_active = true.
--
-- Idempotente. No destructiva. No modifica RLS.
-- =============================================================================

do $zeta0902$
begin
  if to_regclass('public.proto_payments') is null then
    raise notice 'zeta-09-02: public.proto_payments no existe; omitido';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'proto_payments'
      and column_name = 'is_active'
  ) then
    raise notice 'zeta-09-02: columna is_active ausente; omitido';
    return;
  end if;
end;
$zeta0902$;

create unique index if not exists uniq_proto_payments_workspace_zeta_payment_number
  on public.proto_payments (workspace_company_id, payment_number)
  where payment_number like 'ZETA:PAG:%'
    and is_active is true;

comment on index public.uniq_proto_payments_workspace_zeta_payment_number is
  'Idempotencia Zeta vendor payments: un solo pago activo por workspace + ZETA:PAG:{registroId}.';
