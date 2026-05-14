-- =============================================================================
-- OPS-06-10 — Governance state + audit persistence
-- =============================================================================
-- Persistencia del estado de governance operacional y auditoría de eventos.
-- Sustituye estado volátil en-memoria por fuente de verdad en Supabase.
-- Idempotente. No destructivo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABLE: copilot_operational_governance_state
-- Almacena el estado de cada regla de automatización por workspace.
-- ---------------------------------------------------------------------------

create table if not exists public.copilot_operational_governance_state (
  id                    uuid primary key default gen_random_uuid(),
  workspace_company_id  uuid not null references public.companies (id) on delete cascade,
  rule_id               text not null,
  enabled               boolean not null default true,
  muted_until           timestamptz null,
  cooldown_minutes      integer null check (cooldown_minutes is null or cooldown_minutes >= 0),
  metadata              jsonb not null default '{}',
  updated_by            text null,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  constraint copilot_operational_governance_state_rule_id_not_blank
    check (char_length(trim(rule_id)) > 0),
  constraint copilot_operational_governance_state_unique_rule
    unique (workspace_company_id, rule_id)
);

comment on table public.copilot_operational_governance_state is
  'OPS-06-10: estado persistente de reglas de automatización operacional por workspace.';

comment on column public.copilot_operational_governance_state.rule_id is
  'Identificador de regla del registry (ej: rule.sla.escalation_unassigned).';

comment on column public.copilot_operational_governance_state.muted_until is
  'Si no null, la regla está silenciada hasta esta fecha (ISO).';

comment on column public.copilot_operational_governance_state.updated_by is
  'Actor que realizó el último cambio (label o user_id). Puede ser null para cambios del sistema.';

-- Índices
create index if not exists idx_copilot_governance_state_workspace
  on public.copilot_operational_governance_state (workspace_company_id);

create index if not exists idx_copilot_governance_state_workspace_rule
  on public.copilot_operational_governance_state (workspace_company_id, rule_id);

-- Trigger updated_at
drop trigger if exists trg_copilot_governance_state_updated_at
  on public.copilot_operational_governance_state;
create trigger trg_copilot_governance_state_updated_at
  before update on public.copilot_operational_governance_state
  for each row
  execute function public.copilot_set_updated_at();

-- RLS
alter table public.copilot_operational_governance_state enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public'
      and tablename = 'copilot_operational_governance_state'
  loop
    execute format(
      'drop policy if exists %I on public.copilot_operational_governance_state',
      pol.policyname
    );
  end loop;
end;
$$;

create policy copilot_governance_state_tenant_select
  on public.copilot_operational_governance_state
  for select to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());

create policy copilot_governance_state_tenant_insert
  on public.copilot_operational_governance_state
  for insert to authenticated
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy copilot_governance_state_tenant_update
  on public.copilot_operational_governance_state
  for update to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id())
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy copilot_governance_state_tenant_delete
  on public.copilot_operational_governance_state
  for delete to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());


-- ---------------------------------------------------------------------------
-- TABLE: copilot_operational_governance_audit
-- Persiste eventos de auditoría operacional para sobrevivir restarts/deploys.
-- ---------------------------------------------------------------------------

create table if not exists public.copilot_operational_governance_audit (
  id                    uuid primary key default gen_random_uuid(),
  workspace_company_id  uuid not null references public.companies (id) on delete cascade,
  rule_id               text not null,
  workflow_id           text null,
  action_id             text null,
  decision              text not null,
  reasons               jsonb not null default '[]',
  risk_level            text null,
  actor_label           text null,
  actor_user_id         text null,
  occurred_at           timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

comment on table public.copilot_operational_governance_audit is
  'OPS-06-10: auditoría persistente de decisiones de governance operacional.';

comment on column public.copilot_operational_governance_audit.decision is
  'Decisión de la regla: generated | skipped_disabled | skipped_muted | skipped_cooldown | skipped_restricted.';

-- Índices
create index if not exists idx_copilot_governance_audit_workspace
  on public.copilot_operational_governance_audit (workspace_company_id);

create index if not exists idx_copilot_governance_audit_workspace_occurred
  on public.copilot_operational_governance_audit (workspace_company_id, occurred_at desc);

create index if not exists idx_copilot_governance_audit_rule
  on public.copilot_operational_governance_audit (workspace_company_id, rule_id);

-- Retención: índice para purga por fecha (> 90 días)
create index if not exists idx_copilot_governance_audit_cleanup
  on public.copilot_operational_governance_audit (occurred_at);

-- RLS
alter table public.copilot_operational_governance_audit enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public'
      and tablename = 'copilot_operational_governance_audit'
  loop
    execute format(
      'drop policy if exists %I on public.copilot_operational_governance_audit',
      pol.policyname
    );
  end loop;
end;
$$;

create policy copilot_governance_audit_tenant_select
  on public.copilot_operational_governance_audit
  for select to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());

create policy copilot_governance_audit_tenant_insert
  on public.copilot_operational_governance_audit
  for insert to authenticated
  with check (workspace_company_id = public.copilot_current_workspace_company_id());
