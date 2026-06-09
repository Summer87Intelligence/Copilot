-- =============================================================================
-- treasury_movement_accounting_reconciliations
-- Conciliación contable de movimientos de tesorería contra asientos Zeta.
-- =============================================================================
-- Un registro por movimiento (1:1). Upsert por (workspace_id, movement_id).
-- Idempotente: seguro si ya fue aplicada.
-- =============================================================================

create table if not exists public.treasury_movement_accounting_reconciliations (
  id                              uuid primary key default gen_random_uuid(),
  workspace_id                    uuid not null references public.companies (id) on delete cascade,
  movement_id                     uuid not null references public.manual_cash_movements (id) on delete cascade,

  -- Estado de contabilización
  accounting_posted               boolean not null default false,
  accounting_checked              boolean not null default false,

  -- Asiento Zeta asociado (puede ser null si no está identificado)
  zeta_accounting_entry_id        text,
  zeta_accounting_entry_number    text,
  zeta_accounting_entry_date      date,
  zeta_accounting_entry_amount    numeric(14, 2),
  zeta_accounting_entry_currency  text,

  -- Estado del matching
  accounting_match_status         text not null default 'pending'
    check (accounting_match_status in (
      'pending',
      'matched',
      'amount_mismatch',
      'currency_mismatch',
      'date_mismatch',
      'missing_zeta_entry',
      'manually_confirmed'
    )),

  accounting_notes                text,
  accounting_checked_at           timestamptz,
  accounting_checked_by           uuid,

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  constraint tmac_uniq_movement unique (workspace_id, movement_id)
);

comment on table public.treasury_movement_accounting_reconciliations is
  'Conciliación contable: vincula movimientos de tesorería con asientos Zeta. 1:1 por movimiento.';
comment on column public.treasury_movement_accounting_reconciliations.accounting_posted is
  'True = el operador confirmó que este egreso ya fue registrado en el sistema contable.';
comment on column public.treasury_movement_accounting_reconciliations.accounting_checked is
  'True = el operador validó el asiento Zeta asociado contra este movimiento.';
comment on column public.treasury_movement_accounting_reconciliations.accounting_match_status is
  'pending=sin revisión; matched=asiento coincide; amount/currency/date_mismatch=diferencia; missing_zeta_entry=no hay asiento; manually_confirmed=confirmado manualmente con nota.';

create index if not exists idx_tmac_workspace_id
  on public.treasury_movement_accounting_reconciliations (workspace_id);

create index if not exists idx_tmac_movement_id
  on public.treasury_movement_accounting_reconciliations (movement_id);

create index if not exists idx_tmac_workspace_status
  on public.treasury_movement_accounting_reconciliations (workspace_id, accounting_match_status);

create or replace function public.tmac_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tmac_updated_at
  on public.treasury_movement_accounting_reconciliations;

create trigger trg_tmac_updated_at
  before update on public.treasury_movement_accounting_reconciliations
  for each row execute function public.tmac_set_updated_at();

alter table public.treasury_movement_accounting_reconciliations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'treasury_movement_accounting_reconciliations'
      and policyname = 'tmac_select_workspace'
  ) then
    execute $pol$
      create policy tmac_select_workspace
        on public.treasury_movement_accounting_reconciliations
        for select
        using (workspace_id = public.copilot_current_workspace_company_id())
    $pol$;
  end if;
end;
$$;
