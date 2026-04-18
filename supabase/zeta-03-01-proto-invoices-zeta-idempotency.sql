-- =============================================================================
-- ZETA-03 — Idempotencia facturas importadas desde Zeta (clave estable por fila)
-- Staging raw / PII: ver política en `buildStagingPayloadJson` (zeta-saldos-pipeline.ts).
-- =============================================================================
-- Convención aplicación: `invoice_number = 'ZETA:' || RegistroId` (ver pipeline).
-- Índice único parcial: evita duplicados activos por tenant workspace + cliente.
-- Prerrequisitos: `proto_invoices` con `workspace_company_id`, `company_id`,
-- `invoice_number`, `is_active` (patrón proto_* del proyecto).
-- Ejecutar después de sec02-03 / TEN donde existan esas columnas.
-- =============================================================================

do $zeta03inv$
begin
  if to_regclass('public.proto_invoices') is null then
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proto_invoices' and column_name = 'workspace_company_id'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proto_invoices' and column_name = 'company_id'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proto_invoices' and column_name = 'invoice_number'
  )
  or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proto_invoices' and column_name = 'is_active'
  ) then
    raise notice 'zeta-03-01: proto_invoices sin columnas esperadas; omitido';
    return;
  end if;

  create unique index if not exists idx_proto_invoices_zeta_registro_unique
    on public.proto_invoices (workspace_company_id, company_id, invoice_number)
    where is_active = true and invoice_number like 'ZETA:%';
exception
  when duplicate_object then
    raise notice 'zeta-03-01: índice idx_proto_invoices_zeta_registro_unique ya existía';
end;
$zeta03inv$;

comment on index public.idx_proto_invoices_zeta_registro_unique is
  'ZETA-03: una factura Zeta activa por (workspace, cliente proto, número ZETA:RegistroId).';
