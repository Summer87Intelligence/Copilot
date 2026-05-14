-- OPS-06 — Workflows operativos persistidos (Ejecución guiada).
-- Ejecutar en el SQL Editor de Supabase después de revisar entorno.
-- Multi-tenant: workspace_company_id + RLS (patrón operational_actions).

create table if not exists public.copilot_operational_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_company_id uuid not null references public.companies (id) on delete restrict,
  dedupe_key text not null,
  workflow_type text not null,
  title text not null,
  status text not null check (status in ('active', 'blocked', 'completed', 'cancelled')),
  current_step_index integer not null default 0,
  assigned_to text,
  assigned_user_id text,
  source text,
  source_id text,
  context jsonb not null default '{}'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  progress integer not null default 0,
  due_at timestamptz,
  blocked_reason text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.copilot_operational_workflows is
  'Ejecución guiada Copilot: workflows determinísticos persistidos por workspace.';

create index if not exists idx_copilot_operational_workflows_workspace
  on public.copilot_operational_workflows (workspace_company_id);

create index if not exists idx_copilot_operational_workflows_workspace_status
  on public.copilot_operational_workflows (workspace_company_id, status);

create index if not exists idx_copilot_operational_workflows_workspace_dedupe
  on public.copilot_operational_workflows (workspace_company_id, dedupe_key);

create unique index if not exists copilot_operational_workflows_open_dedupe_uidx
  on public.copilot_operational_workflows (workspace_company_id, dedupe_key)
  where status in ('active', 'blocked');

drop trigger if exists trg_copilot_operational_workflows_force_workspace
  on public.copilot_operational_workflows;
create trigger trg_copilot_operational_workflows_force_workspace
  before insert or update on public.copilot_operational_workflows
  for each row
  execute function public.copilot_proto_row_force_workspace();

drop trigger if exists trg_copilot_operational_workflows_updated_at
  on public.copilot_operational_workflows;
create trigger trg_copilot_operational_workflows_updated_at
  before update on public.copilot_operational_workflows
  for each row
  execute function public.copilot_set_updated_at();

alter table public.copilot_operational_workflows enable row level security;

drop policy if exists copilot_operational_workflows_tenant_select
  on public.copilot_operational_workflows;
drop policy if exists copilot_operational_workflows_tenant_insert
  on public.copilot_operational_workflows;
drop policy if exists copilot_operational_workflows_tenant_update
  on public.copilot_operational_workflows;
drop policy if exists copilot_operational_workflows_tenant_delete
  on public.copilot_operational_workflows;

create policy copilot_operational_workflows_tenant_select on public.copilot_operational_workflows
  for select to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());

create policy copilot_operational_workflows_tenant_insert on public.copilot_operational_workflows
  for insert to authenticated
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy copilot_operational_workflows_tenant_update on public.copilot_operational_workflows
  for update to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id())
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy copilot_operational_workflows_tenant_delete on public.copilot_operational_workflows
  for delete to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());

grant select, insert, update, delete on public.copilot_operational_workflows to authenticated;
