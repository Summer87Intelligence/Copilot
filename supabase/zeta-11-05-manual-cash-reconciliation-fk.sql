-- =============================================================================
-- ZETA-11 — FK manual_cash_movements.bank_reconciliation_id
-- =============================================================================
-- Ejecutar después de zeta-11-03. Idempotente.
-- =============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'bank_reconciliation_movements'
  ) and not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'manual_cash_movements'
      and constraint_name = 'manual_cash_movements_bank_reconciliation_id_fkey'
  ) then
    alter table public.manual_cash_movements
      add constraint manual_cash_movements_bank_reconciliation_id_fkey
      foreign key (bank_reconciliation_id)
      references public.bank_reconciliation_movements (id)
      on delete set null;
  end if;
end;
$$;
