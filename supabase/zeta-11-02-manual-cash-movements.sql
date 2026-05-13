-- =============================================================================
-- ZETA-11 — `manual_cash_movements`
-- =============================================================================
-- Movimientos manuales reales (ingreso/egreso/ajuste/transferencia).
-- Prerrequisitos: zeta-11-00, zeta-11-01.
-- Idempotente. No destructivo.
-- =============================================================================

create table if not exists public.manual_cash_movements (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid not null references public.companies (id) on delete restrict,
  company_id              text,
  account_id              uuid references public.treasury_accounts (id) on delete restrict,
  ledger_type             text not null
    check (ledger_type in ('cash', 'bank', 'virtual_wallet', 'credit_card')),
  movement_type           text not null
    check (movement_type in ('income', 'expense', 'adjustment', 'transfer')),
  source                  text not null default 'manual'
    check (source in ('cash', 'bank', 'santander', 'manual')),
  concept                 text not null,
  category                text,
  amount                  numeric(14, 2) not null check (amount > 0),
  currency_code           text not null check (currency_code in ('UYU', 'USD')),
  movement_date           date not null,
  payment_method          text,
  counterparty            text,
  reference               text,
  notes                   text,
  affects_cashflow        boolean not null default true,
  reconciled              boolean not null default false,
  bank_reconciliation_id  uuid,
  status                  text not null default 'active'
    check (status in ('active', 'archived')),
  created_by              uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  raw_payload             jsonb,
  metadata                jsonb,
  constraint manual_cash_movements_concept_not_blank check (char_length(trim(concept)) > 0)
);

comment on table public.manual_cash_movements is
  'ZETA-11: movimientos de caja/ledger manuales. amount siempre positivo; signo en aplicación.';

comment on column public.manual_cash_movements.workspace_id is
  'Tenant SaaS. Distinto de company_id (ERP/Zeta).';

comment on column public.manual_cash_movements.account_id is
  'Cuenta treasury asociada. Debe pertenecer al mismo workspace (validación app).';

create index if not exists idx_manual_cash_movements_workspace
  on public.manual_cash_movements (workspace_id);

create index if not exists idx_manual_cash_movements_workspace_date
  on public.manual_cash_movements (workspace_id, movement_date);

create index if not exists idx_manual_cash_movements_workspace_status
  on public.manual_cash_movements (workspace_id, status);

create index if not exists idx_manual_cash_movements_workspace_currency
  on public.manual_cash_movements (workspace_id, currency_code);

create index if not exists idx_manual_cash_movements_workspace_type
  on public.manual_cash_movements (workspace_id, movement_type);

create index if not exists idx_manual_cash_movements_account
  on public.manual_cash_movements (workspace_id, account_id)
  where account_id is not null;

drop trigger if exists trg_manual_cash_movements_force_workspace on public.manual_cash_movements;
create trigger trg_manual_cash_movements_force_workspace
  before insert or update on public.manual_cash_movements
  for each row
  execute function public.copilot_treasury_row_force_workspace();

drop trigger if exists trg_manual_cash_movements_updated_at on public.manual_cash_movements;
create trigger trg_manual_cash_movements_updated_at
  before update on public.manual_cash_movements
  for each row
  execute function public.copilot_set_updated_at();

alter table public.manual_cash_movements enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'manual_cash_movements'
  loop
    execute format('drop policy if exists %I on public.manual_cash_movements', pol.policyname);
  end loop;
end;
$$;

create policy manual_cash_movements_tenant_select on public.manual_cash_movements
  for select to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());

create policy manual_cash_movements_tenant_insert on public.manual_cash_movements
  for insert to authenticated
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy manual_cash_movements_tenant_update on public.manual_cash_movements
  for update to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id())
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy manual_cash_movements_tenant_delete on public.manual_cash_movements
  for delete to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());
