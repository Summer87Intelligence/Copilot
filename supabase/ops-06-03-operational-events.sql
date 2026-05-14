-- OPS-06.3 — Timeline operacional unificada (workflows, acciones, snapshot).
-- Ejecutar en el SQL Editor de Supabase después de revisar entorno.

create table if not exists public.copilot_operational_events (
  id uuid primary key default gen_random_uuid(),
  workspace_company_id uuid not null references public.companies (id) on delete restrict,
  event_type text not null,
  entity_type text not null check (entity_type in ('workflow', 'workflow_step', 'action', 'snapshot')),
  entity_id text not null,
  workflow_id uuid,
  action_id uuid,
  actor_label text,
  actor_user_id text,
  title text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.copilot_operational_events is
  'Timeline operacional unificada Copilot (workflows, acciones, snapshot).';

create index if not exists idx_copilot_operational_events_workspace_occurred
  on public.copilot_operational_events (workspace_company_id, occurred_at desc);

create index if not exists idx_copilot_operational_events_workspace_entity
  on public.copilot_operational_events (workspace_company_id, entity_type, entity_id);

create index if not exists idx_copilot_operational_events_workflow
  on public.copilot_operational_events (workflow_id)
  where workflow_id is not null;

create index if not exists idx_copilot_operational_events_action
  on public.copilot_operational_events (action_id)
  where action_id is not null;

drop trigger if exists trg_copilot_operational_events_force_workspace
  on public.copilot_operational_events;
create trigger trg_copilot_operational_events_force_workspace
  before insert or update on public.copilot_operational_events
  for each row
  execute function public.copilot_proto_row_force_workspace();

alter table public.copilot_operational_events enable row level security;

drop policy if exists copilot_operational_events_tenant_select
  on public.copilot_operational_events;
drop policy if exists copilot_operational_events_tenant_insert
  on public.copilot_operational_events;
drop policy if exists copilot_operational_events_tenant_update
  on public.copilot_operational_events;
drop policy if exists copilot_operational_events_tenant_delete
  on public.copilot_operational_events;

create policy copilot_operational_events_tenant_select on public.copilot_operational_events
  for select to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());

create policy copilot_operational_events_tenant_insert on public.copilot_operational_events
  for insert to authenticated
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy copilot_operational_events_tenant_update on public.copilot_operational_events
  for update to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id())
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy copilot_operational_events_tenant_delete on public.copilot_operational_events
  for delete to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());

grant select, insert, update, delete on public.copilot_operational_events to authenticated;
