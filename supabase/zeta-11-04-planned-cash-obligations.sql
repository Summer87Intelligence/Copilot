-- =============================================================================
-- ZETA-11 — `planned_cash_obligations`
-- =============================================================================
-- Compromisos futuros / obligaciones proyectadas (cashflow y alertas).
-- Prerrequisitos: zeta-11-00, zeta-11-01.
-- Idempotente. No destructivo.
-- =============================================================================

create table if not exists public.planned_cash_obligations (
  id                          uuid primary key default gen_random_uuid(),
  workspace_id                uuid not null references public.companies (id) on delete restrict,
  company_id                  text,
  title                       text not null,
  description                 text,
  obligation_type             text not null
    check (obligation_type in (
      'tax', 'bps', 'dgi', 'iva', 'salary', 'bonus', 'vacation',
      'supplier', 'rent', 'loan', 'travel', 'service', 'other'
    )),
  direction                   text not null default 'outflow'
    check (direction in ('outflow', 'inflow')),
  amount_estimated            numeric(14, 2) not null check (amount_estimated > 0),
  amount_final                numeric(14, 2) check (amount_final is null or amount_final > 0),
  currency_code               text not null check (currency_code in ('UYU', 'USD')),
  due_date                    date not null,
  expected_payment_date       date,
  expected_source             text not null default 'unknown'
    check (expected_source in ('cash', 'bank', 'santander', 'future_income', 'unknown')),
  expected_account_id         uuid references public.treasury_accounts (id) on delete set null,
  recurrence                  text not null default 'none'
    check (recurrence in ('none', 'weekly', 'monthly', 'quarterly', 'yearly')),
  status                      text not null default 'planned'
    check (status in ('planned', 'confirmed', 'paid', 'cancelled', 'overdue')),
  priority                    text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  affects_cashflow            boolean not null default true,
  reminder_days_before        integer[] not null default array[7, 3, 1],
  source                      text not null default 'manual'
    check (source in ('manual', 'zeta', 'recurring_rule', 'copilot')),
  related_manual_movement_id  uuid references public.manual_cash_movements (id) on delete set null,
  related_bank_movement_id      uuid references public.bank_reconciliation_movements (id) on delete set null,
  related_zeta_record_id      text,
  notes                       text,
  created_by                  uuid,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  metadata                    jsonb,
  constraint planned_cash_obligations_title_not_blank check (char_length(trim(title)) > 0)
);

comment on table public.planned_cash_obligations is
  'ZETA-11: obligaciones futuras manuales. overdue se deriva en lectura si due_date < hoy.';

create index if not exists idx_planned_cash_obligations_workspace
  on public.planned_cash_obligations (workspace_id);

create index if not exists idx_planned_cash_obligations_workspace_due
  on public.planned_cash_obligations (workspace_id, due_date);

create index if not exists idx_planned_cash_obligations_workspace_status
  on public.planned_cash_obligations (workspace_id, status);

create index if not exists idx_planned_cash_obligations_workspace_currency
  on public.planned_cash_obligations (workspace_id, currency_code);

create index if not exists idx_planned_cash_obligations_workspace_type
  on public.planned_cash_obligations (workspace_id, obligation_type);

create index if not exists idx_planned_cash_obligations_workspace_priority
  on public.planned_cash_obligations (workspace_id, priority);

create index if not exists idx_planned_cash_obligations_expected_account
  on public.planned_cash_obligations (workspace_id, expected_account_id)
  where expected_account_id is not null;

drop trigger if exists trg_planned_cash_obligations_force_workspace on public.planned_cash_obligations;
create trigger trg_planned_cash_obligations_force_workspace
  before insert or update on public.planned_cash_obligations
  for each row
  execute function public.copilot_treasury_row_force_workspace();

drop trigger if exists trg_planned_cash_obligations_updated_at on public.planned_cash_obligations;
create trigger trg_planned_cash_obligations_updated_at
  before update on public.planned_cash_obligations
  for each row
  execute function public.copilot_set_updated_at();

alter table public.planned_cash_obligations enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'planned_cash_obligations'
  loop
    execute format('drop policy if exists %I on public.planned_cash_obligations', pol.policyname);
  end loop;
end;
$$;

create policy planned_cash_obligations_tenant_select on public.planned_cash_obligations
  for select to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());

create policy planned_cash_obligations_tenant_insert on public.planned_cash_obligations
  for insert to authenticated
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy planned_cash_obligations_tenant_update on public.planned_cash_obligations
  for update to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id())
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy planned_cash_obligations_tenant_delete on public.planned_cash_obligations
  for delete to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());
