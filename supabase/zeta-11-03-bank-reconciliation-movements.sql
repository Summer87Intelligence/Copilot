-- =============================================================================
-- ZETA-11 — `bank_reconciliation_movements`
-- =============================================================================
-- Movimientos bancarios importados o cargados a mano (sin hardcodear banco).
-- Prerrequisitos: zeta-11-00, zeta-11-01.
-- Idempotente. No destructivo.
-- =============================================================================

create table if not exists public.bank_reconciliation_movements (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.companies (id) on delete restrict,
  company_id          text,
  account_id          uuid references public.treasury_accounts (id) on delete restrict,
  bank_name           text,
  account_number      text,
  account_name        text,
  movement_date       date not null,
  description         text not null,
  amount              numeric(14, 2) not null check (amount > 0),
  currency_code       text not null check (currency_code in ('UYU', 'USD')),
  movement_type       text not null check (movement_type in ('credit', 'debit')),
  external_id         text,
  document_number     text,
  balance_after       numeric(14, 2),
  matched             boolean not null default false,
  match_status        text not null default 'unmatched'
    check (match_status in ('unmatched', 'matched', 'partial', 'ignored')),
  matched_source      text not null default 'none'
    check (matched_source in ('zeta', 'manual_cash', 'planned_obligation', 'none')),
  matched_record_id   uuid,
  confidence          numeric(5, 2),
  imported_from       text not null default 'manual'
    check (imported_from in ('manual', 'csv', 'api', 'zeta')),
  imported_at         timestamptz not null default now(),
  raw_payload         jsonb,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint bank_reconciliation_movements_description_not_blank
    check (char_length(trim(description)) > 0)
);

comment on table public.bank_reconciliation_movements is
  'ZETA-11: extracto bancario por cuenta. bank_name opcional; cuenta canónica en account_id.';

create index if not exists idx_bank_reconciliation_movements_workspace
  on public.bank_reconciliation_movements (workspace_id);

create index if not exists idx_bank_reconciliation_movements_workspace_date
  on public.bank_reconciliation_movements (workspace_id, movement_date);

create index if not exists idx_bank_reconciliation_movements_workspace_match
  on public.bank_reconciliation_movements (workspace_id, match_status);

create index if not exists idx_bank_reconciliation_movements_workspace_currency
  on public.bank_reconciliation_movements (workspace_id, currency_code);

create index if not exists idx_bank_reconciliation_movements_workspace_type
  on public.bank_reconciliation_movements (workspace_id, movement_type);

create index if not exists idx_bank_reconciliation_movements_account
  on public.bank_reconciliation_movements (workspace_id, account_id)
  where account_id is not null;

create index if not exists idx_bank_reconciliation_movements_external
  on public.bank_reconciliation_movements (workspace_id, external_id)
  where external_id is not null;

drop trigger if exists trg_bank_reconciliation_movements_force_workspace on public.bank_reconciliation_movements;
create trigger trg_bank_reconciliation_movements_force_workspace
  before insert or update on public.bank_reconciliation_movements
  for each row
  execute function public.copilot_treasury_row_force_workspace();

drop trigger if exists trg_bank_reconciliation_movements_updated_at on public.bank_reconciliation_movements;
create trigger trg_bank_reconciliation_movements_updated_at
  before update on public.bank_reconciliation_movements
  for each row
  execute function public.copilot_set_updated_at();

alter table public.bank_reconciliation_movements enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'bank_reconciliation_movements'
  loop
    execute format('drop policy if exists %I on public.bank_reconciliation_movements', pol.policyname);
  end loop;
end;
$$;

create policy bank_reconciliation_movements_tenant_select on public.bank_reconciliation_movements
  for select to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());

create policy bank_reconciliation_movements_tenant_insert on public.bank_reconciliation_movements
  for insert to authenticated
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy bank_reconciliation_movements_tenant_update on public.bank_reconciliation_movements
  for update to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id())
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy bank_reconciliation_movements_tenant_delete on public.bank_reconciliation_movements
  for delete to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());
