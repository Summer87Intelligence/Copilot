-- OPS-05 — Pipeline operacional (acciones persistidas + timeline).
-- Ejecutar en el SQL Editor de Supabase después de revisar entorno.
-- Multi-tenant: workspace_company_id + RLS (patrón collection_actions).

do $$ begin
  create type public.operational_action_status as enum (
    'pending',
    'in_progress',
    'blocked',
    'resolved',
    'dismissed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.operational_action_origin as enum (
    'alert',
    'treasury',
    'finance',
    'customer',
    'insight',
    'manual'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.operational_action_priority as enum (
    'critical',
    'high',
    'medium',
    'low'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.operational_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_company_id uuid not null references public.companies (id) on delete restrict,
  origin public.operational_action_origin not null,
  action_type text not null,
  priority public.operational_action_priority not null default 'medium',
  operational_status public.operational_action_status not null default 'pending',
  owner_id text,
  assigned_to text,
  created_by text,
  related_entity_type text,
  related_entity_id text,
  title text not null,
  summary text,
  context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.operational_actions is
  'Cola operativa Copilot: seguimiento persistido desde alertas, tesorería, finanzas, clientes, insights o manual.';

create index if not exists idx_operational_actions_workspace_status
  on public.operational_actions (workspace_company_id, operational_status);

create index if not exists idx_operational_actions_workspace_created
  on public.operational_actions (workspace_company_id, created_at desc);

create index if not exists idx_operational_actions_workspace_due
  on public.operational_actions (workspace_company_id, due_at)
  where due_at is not null;

create unique index if not exists operational_actions_open_origin_entity_uidx
  on public.operational_actions (workspace_company_id, origin, related_entity_id)
  where related_entity_id is not null
    and operational_status in ('pending', 'in_progress', 'blocked');

create table if not exists public.operational_action_events (
  id uuid primary key default gen_random_uuid(),
  workspace_company_id uuid not null references public.companies (id) on delete restrict,
  action_id uuid not null references public.operational_actions (id) on delete cascade,
  event_type text not null,
  actor_id text,
  actor_label text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.operational_action_events is
  'Timeline de eventos por acción operativa (creación, cambios de estado, reasignación, resolución).';

create index if not exists idx_operational_action_events_action
  on public.operational_action_events (action_id, created_at desc);

create index if not exists idx_operational_action_events_workspace
  on public.operational_action_events (workspace_company_id, created_at desc);

drop trigger if exists trg_operational_actions_force_workspace on public.operational_actions;
create trigger trg_operational_actions_force_workspace
  before insert or update on public.operational_actions
  for each row
  execute function public.copilot_proto_row_force_workspace();

drop trigger if exists trg_operational_action_events_force_workspace on public.operational_action_events;
create trigger trg_operational_action_events_force_workspace
  before insert or update on public.operational_action_events
  for each row
  execute function public.copilot_proto_row_force_workspace();

create or replace function public.copilot_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_operational_actions_updated_at on public.operational_actions;
create trigger trg_operational_actions_updated_at
  before update on public.operational_actions
  for each row
  execute function public.copilot_set_updated_at();

alter table public.operational_actions enable row level security;
alter table public.operational_action_events enable row level security;

drop policy if exists operational_actions_tenant_select on public.operational_actions;
drop policy if exists operational_actions_tenant_insert on public.operational_actions;
drop policy if exists operational_actions_tenant_update on public.operational_actions;
drop policy if exists operational_actions_tenant_delete on public.operational_actions;

create policy operational_actions_tenant_select on public.operational_actions
  for select to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());

create policy operational_actions_tenant_insert on public.operational_actions
  for insert to authenticated
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy operational_actions_tenant_update on public.operational_actions
  for update to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id())
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy operational_actions_tenant_delete on public.operational_actions
  for delete to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());

drop policy if exists operational_action_events_tenant_select on public.operational_action_events;
drop policy if exists operational_action_events_tenant_insert on public.operational_action_events;
drop policy if exists operational_action_events_tenant_update on public.operational_action_events;
drop policy if exists operational_action_events_tenant_delete on public.operational_action_events;

create policy operational_action_events_tenant_select on public.operational_action_events
  for select to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());

create policy operational_action_events_tenant_insert on public.operational_action_events
  for insert to authenticated
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy operational_action_events_tenant_update on public.operational_action_events
  for update to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id())
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy operational_action_events_tenant_delete on public.operational_action_events
  for delete to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());

grant select, insert, update, delete on public.operational_actions to authenticated;
grant select, insert, update, delete on public.operational_action_events to authenticated;
