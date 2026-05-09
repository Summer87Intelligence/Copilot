-- =============================================================================
-- Collection Operations Layer — Tabla `collection_actions`
-- =============================================================================
-- Capa operativa de cobranza: registro de acciones, seguimiento de estados y
-- promesas de pago por cliente (proto_companies).
--
-- IMPORTANTE:
--   - Esta tabla es operativa interna. NO modifica proto_invoices, proto_receipts
--     ni ningún dato financiero de Zeta.
--   - Scoping por workspace_company_id (mismo patrón que proto_*).
--   - RLS: SELECT / INSERT / UPDATE / DELETE restringidos al workspace del JWT.
--   - Soft delete: is_active + archived_at (sin hard deletes).
--   - Trigger copilot_proto_row_force_workspace ya existe (sec02-03).
--   - Trigger copilot_set_updated_at ya existe (debe aplicarse aquí también).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tipos enum
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.collection_action_status as enum (
    'pending_review',
    'contacted',
    'promised_payment',
    'paid',
    'disputed',
    'escalated',
    'paused'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.collection_action_type as enum (
    'call',
    'whatsapp',
    'email',
    'meeting',
    'internal_note',
    'payment_promise',
    'dispute',
    'escalation'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.collection_priority as enum (
    'low',
    'medium',
    'high',
    'urgent'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tabla principal
-- ---------------------------------------------------------------------------

create table if not exists public.collection_actions (
  id                    uuid primary key default gen_random_uuid(),
  workspace_company_id  uuid not null references public.companies (id) on delete restrict,
  company_id            uuid not null references public.proto_companies (id) on delete restrict,

  -- Estado y tipo de acción
  status                public.collection_action_status not null default 'pending_review',
  action_type           public.collection_action_type not null,
  priority              public.collection_priority not null default 'medium',

  -- Operativo
  assigned_to           text,
  created_by            text,

  -- Fechas operativas
  due_date              timestamptz,
  contact_date          timestamptz,
  next_action_date      timestamptz,

  -- Promesa de pago
  promise_date          timestamptz,
  promise_amount        numeric(14, 2),
  promise_currency      text check (promise_currency in ('UYU', 'USD')),

  -- Notas y metadata
  notes                 text,
  metadata              jsonb,

  -- Soft delete
  is_active             boolean not null default true,
  archived_at           timestamptz,

  -- Timestamps
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.collection_actions is
  'Capa operativa de cobranza. Acciones de seguimiento por cliente. '
  'No modifica datos financieros (facturas, recibos, Zeta). '
  'Scopeada por workspace_company_id (SEC-02).';

-- ---------------------------------------------------------------------------
-- 3. Índices
-- ---------------------------------------------------------------------------

create index if not exists idx_collection_actions_workspace
  on public.collection_actions (workspace_company_id);

create index if not exists idx_collection_actions_company
  on public.collection_actions (workspace_company_id, company_id);

create index if not exists idx_collection_actions_status
  on public.collection_actions (workspace_company_id, status)
  where is_active = true;

create index if not exists idx_collection_actions_next_action
  on public.collection_actions (workspace_company_id, next_action_date)
  where is_active = true and next_action_date is not null;

create index if not exists idx_collection_actions_created_at
  on public.collection_actions (workspace_company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Trigger: forzar workspace (reutiliza función existente de sec02-03)
-- ---------------------------------------------------------------------------

drop trigger if exists trg_collection_actions_force_workspace on public.collection_actions;
create trigger trg_collection_actions_force_workspace
  before insert or update on public.collection_actions
  for each row
  execute function public.copilot_proto_row_force_workspace();

-- ---------------------------------------------------------------------------
-- 5. Trigger: updated_at automático
--    Asume que la función copilot_set_updated_at() ya existe en el proyecto.
--    Si no existe, se crea aquí como fallback idempotente.
-- ---------------------------------------------------------------------------

create or replace function public.copilot_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_collection_actions_updated_at on public.collection_actions;
create trigger trg_collection_actions_updated_at
  before update on public.collection_actions
  for each row
  execute function public.copilot_set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

alter table public.collection_actions enable row level security;

-- Limpiar políticas previas (idempotente)
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'collection_actions'
  loop
    execute format('drop policy if exists %I on public.collection_actions', pol.policyname);
  end loop;
end;
$$;

create policy collection_actions_tenant_select on public.collection_actions
  for select to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());

create policy collection_actions_tenant_insert on public.collection_actions
  for insert to authenticated
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy collection_actions_tenant_update on public.collection_actions
  for update to authenticated
  using  (workspace_company_id = public.copilot_current_workspace_company_id())
  with check (workspace_company_id = public.copilot_current_workspace_company_id());

create policy collection_actions_tenant_delete on public.collection_actions
  for delete to authenticated
  using (workspace_company_id = public.copilot_current_workspace_company_id());
