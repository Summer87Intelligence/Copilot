-- =============================================================================
-- ZETA-12 — `planned_cash_obligation_templates`
-- =============================================================================
-- Plantillas de obligaciones recurrentes para generación incremental.
-- Prerrequisitos: zeta-11-00.
-- Idempotente. No destructivo.
-- =============================================================================

create table if not exists public.planned_cash_obligation_templates (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.companies (id) on delete restrict,
  title                 text not null,
  category              text not null,
  currency              text not null check (currency in ('UYU', 'USD')),
  amount                numeric(14, 2) not null check (amount > 0),
  recurrence_type       text not null
    check (recurrence_type in ('monthly', 'quarterly', 'yearly', 'custom')),
  recurrence_interval   integer not null default 1 check (recurrence_interval > 0),
  next_occurrence_date  date not null,
  auto_generate         boolean not null default true,
  active                boolean not null default true,
  metadata              jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint planned_cash_obligation_templates_title_not_blank
    check (char_length(trim(title)) > 0),
  constraint planned_cash_obligation_templates_category_not_blank
    check (char_length(trim(category)) > 0)
);

comment on table public.planned_cash_obligation_templates is
  'ZETA-12: plantillas de obligaciones recurrentes para tesorería manual.';

create index if not exists idx_planned_cash_obligation_templates_workspace
  on public.planned_cash_obligation_templates (workspace_id);

create index if not exists idx_planned_cash_obligation_templates_workspace_active
  on public.planned_cash_obligation_templates (workspace_id, active)
  where active = true;

create index if not exists idx_planned_cash_obligation_templates_next_occurrence
  on public.planned_cash_obligation_templates (workspace_id, next_occurrence_date);

drop trigger if exists trg_planned_cash_obligation_templates_force_workspace
  on public.planned_cash_obligation_templates;
create trigger trg_planned_cash_obligation_templates_force_workspace
  before insert or update on public.planned_cash_obligation_templates
  for each row
  execute function public.copilot_treasury_row_force_workspace();

drop trigger if exists trg_planned_cash_obligation_templates_updated_at
  on public.planned_cash_obligation_templates;
create trigger trg_planned_cash_obligation_templates_updated_at
  before update on public.planned_cash_obligation_templates
  for each row
  execute function public.copilot_set_updated_at();

alter table public.planned_cash_obligation_templates enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'planned_cash_obligation_templates'
  loop
    execute format(
      'drop policy if exists %I on public.planned_cash_obligation_templates',
      pol.policyname
    );
  end loop;
end;
$$;

create policy planned_cash_obligation_templates_tenant_select
  on public.planned_cash_obligation_templates
  for select to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());

create policy planned_cash_obligation_templates_tenant_insert
  on public.planned_cash_obligation_templates
  for insert to authenticated
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy planned_cash_obligation_templates_tenant_update
  on public.planned_cash_obligation_templates
  for update to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id())
  with check (workspace_id = public.copilot_current_workspace_company_id());

create policy planned_cash_obligation_templates_tenant_delete
  on public.planned_cash_obligation_templates
  for delete to authenticated
  using (workspace_id = public.copilot_current_workspace_company_id());
