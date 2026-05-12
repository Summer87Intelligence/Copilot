-- =============================================================================
-- ZETA-08-02 — `proto_invoices.due_date_source` + soporte due_date real
-- =============================================================================
-- Propósito:
--   - Agregar `due_date_source text` que rastrea de dónde viene el `due_date`
--     persistido en `proto_invoices`:
--       'synthetic_30d'   → mapper de vouchers (issue_date + 30 días).
--       'zeta_cuotas_v1'  → cuota real desde `proto_invoice_installments.cuota_vencimiento`.
--   - Backfill defensivo: filas existentes quedan marcadas como 'synthetic_30d'
--     (eran lo que escribía el mapper).
--   - Trigger que NUNCA overwriteea `due_date` con NULL desde el pipeline de
--     cuotas. Solo escribe valores reales, dejando intacto el sintético si no
--     hay cuota.
--
-- IMPORTANTE: NO actualiza `due_date` aún. La migración del sintético al real
-- la hace el pipeline en código, cuota por cuota (`updateInvoiceDueDateFromInstallments`).
--
-- Idempotente.
--
-- NO toca:
--   - sync existente (mapper voucher sigue escribiendo synthetic_30d por defecto).
--   - cron actual.
--   - reconciliación financiera.
-- =============================================================================

do $zeta0802$
begin
  if to_regclass('public.proto_invoices') is null then
    raise notice 'zeta-08-02: public.proto_invoices no existe; omitido';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'proto_invoices'
      and column_name = 'due_date_source'
  ) then
    alter table public.proto_invoices
      add column due_date_source text null
        check (
          due_date_source in ('synthetic_30d', 'zeta_cuotas_v1')
          or due_date_source is null
        );

    -- Backfill defensivo: filas con due_date no nulo provenían del mapper
    -- voucher (= synthetic +30d). Se etiquetan como tales para distinguirlas
    -- de futuras escrituras reales.
    update public.proto_invoices
       set due_date_source = 'synthetic_30d'
     where due_date is not null
       and due_date_source is null;

    comment on column public.proto_invoices.due_date_source is
      'Procedencia del due_date: synthetic_30d (mapper voucher = issue_date+30d, DIV-CONT-001) o zeta_cuotas_v1 (cuota real desde proto_invoice_installments).';
  else
    raise notice 'zeta-08-02: proto_invoices.due_date_source ya existe; sin cambios';
  end if;

  -- Índice parcial: facturas con due_date real (para queries de aging).
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'proto_invoices'
      and indexname = 'idx_proto_invoices_due_date_source_real'
  ) then
    create index idx_proto_invoices_due_date_source_real
      on public.proto_invoices (workspace_company_id, due_date)
      where due_date_source = 'zeta_cuotas_v1';
  end if;
end;
$zeta0802$;
