-- =============================================================================
-- ZETA-11 — Núcleo: `treasury_accounts`
-- =============================================================================
-- Cuentas financieras reales (caja, banco, wallet, tarjeta, inversión).
-- Prerrequisito: `supabase/zeta-11-00-treasury-workspace-trigger.sql`
-- Idempotente. No destructivo.
-- =============================================================================

create table if not exists public.treasury_accounts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.companies (id) on delete restrict,
  company_id      text,
  name            text not null,
  type            text not null
    check (type in ('cash', 'bank', 'wallet', 'credit_card', 'investment')),
  bank_name       text,
  account_number  text,
  currency_code   text not null check (currency_code in ('UYU', 'USD')),
  active          boolean not null default true,
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint treasury_accounts_name_not_blank check (char_length(trim(name)) > 0)
);

comment on table public.treasury_accounts is
  'ZETA-11: cuentas financieras del workspace. company_id (text) reservado para vínculo ERP/Zeta futuro.';

comment on column public.treasury_accounts.workspace_id is
  'Tenant SaaS (`public.companies.id`). Distinto de company_id ERP.';

comment on column public.treasury_accounts.company_id is
  'Identificador ERP/Zeta opcional (texto). No sustituye workspace_id.';

create index if not exists idx_treasury_accounts_workspace
  on public.treasury_accounts (workspace_id);

create index if not exists idx_treasury_accounts_workspace_active
  on public.treasury_accounts (workspace_id, active)
  where active = true;

create index if not exists idx_treasury_accounts_workspace_type
  on public.treasury_accounts (workspace_id, type);

create index if not exists idx_treasury_accounts_workspace_currency
  on public.treasury_accounts (workspace_id, currency_code);

drop trigger if exists trg_treasury_accounts_force_workspace on public.treasury_accounts;
create trigger trg_treasury_accounts_force_workspace
  before insert or update on public.treasury_accounts
  for each row
  execute function public.copilot_treasury_row_force_workspace();

drop trigger if exists trg_treasury_accounts_updated_at on public.treasury_accounts;
create trigger trg_treasury_accounts_updated_at
  before update on public.treasury_accounts
  for each row
  execute function public.copilot_set_updated_at();

alter table public.treasury_accounts enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'treasury_accounts'
  loop
    execute format('drop policy if exists %I on public.treasury_accounts', pol.policyname);
  end loop;
end;
$$;

create policy treasury_accounts_tenant_select on public.treasury_accounts
  for select to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());

create policy treasury_accounts_tenant_insert on public.treasury_accounts
  for insert to authenticated
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy treasury_accounts_tenant_update on public.treasury_accounts
  for update to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id())
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy treasury_accounts_tenant_delete on public.treasury_accounts
  for delete to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());
