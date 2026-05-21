-- =============================================================================
-- ZETA-11 — `treasury_cash_opening_balances`
-- =============================================================================
-- Saldo inicial de caja por moneda (UYU/USD) para calcular caja actual.
-- Prerrequisitos: zeta-11-00.
-- Idempotente. No destructivo.
-- =============================================================================

create table if not exists public.treasury_cash_opening_balances (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.companies (id) on delete restrict,
  currency_code   text not null check (currency_code in ('UYU', 'USD')),
  amount          numeric(14, 2) not null check (amount >= 0),
  effective_date  date not null default (current_date),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint treasury_cash_opening_balances_workspace_currency_unique
    unique (workspace_id, currency_code)
);

comment on table public.treasury_cash_opening_balances is
  'ZETA-11: saldo inicial de caja manual por moneda. Sin conversión entre UYU y USD.';

create index if not exists idx_treasury_cash_opening_balances_workspace
  on public.treasury_cash_opening_balances (workspace_id);

drop trigger if exists trg_treasury_cash_opening_balances_force_workspace
  on public.treasury_cash_opening_balances;
create trigger trg_treasury_cash_opening_balances_force_workspace
  before insert or update on public.treasury_cash_opening_balances
  for each row
  execute function public.copilot_treasury_row_force_workspace();

drop trigger if exists trg_treasury_cash_opening_balances_updated_at
  on public.treasury_cash_opening_balances;
create trigger trg_treasury_cash_opening_balances_updated_at
  before update on public.treasury_cash_opening_balances
  for each row
  execute function public.copilot_set_updated_at();

alter table public.treasury_cash_opening_balances enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'treasury_cash_opening_balances'
  loop
    execute format(
      'drop policy if exists %I on public.treasury_cash_opening_balances',
      pol.policyname
    );
  end loop;
end;
$$;

create policy treasury_cash_opening_balances_tenant_select
  on public.treasury_cash_opening_balances
  for select to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());

create policy treasury_cash_opening_balances_tenant_insert
  on public.treasury_cash_opening_balances
  for insert to authenticated
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy treasury_cash_opening_balances_tenant_update
  on public.treasury_cash_opening_balances
  for update to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id())
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy treasury_cash_opening_balances_tenant_delete
  on public.treasury_cash_opening_balances
  for delete to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());
