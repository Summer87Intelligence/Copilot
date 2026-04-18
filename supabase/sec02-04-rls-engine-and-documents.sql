-- =============================================================================
-- SEC-02 — Paso 4: motor (initiatives / decisions / actions / outcomes) + proto_documents
-- =============================================================================
-- Prerrequisitos: sec02-01, sec02-02, sec02-03 (proto_* con workspace_company_id + trigger
--   copilot_proto_row_force_workspace definido).
--
-- ORDEN: ADD COLUMN nullable → índice → trigger → backfill → validar NULL → NOT NULL → RLS.
--
-- BACKFILL “primer companies.id por created_at”:
--   PELIGRO — solo base vacía / single-tenant inicial; no multi-tenant poblado sin auditoría.
--
-- Políticas RLS: solo DROP POLICY IF EXISTS + CREATE POLICY explícitos (sin loops ni pg_policies).
-- Idempotente: IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Validación cerrada proto_documents (CASE lista blanca; else → false)
-- ---------------------------------------------------------------------------
create or replace function public.copilot_proto_document_related_in_tenant(
  p_related_table text,
  p_related_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ws uuid;
  t  text;
begin
  ws := public.copilot_current_workspace_company_id();
  if ws is null then
    return false;
  end if;

  t := lower(trim(both from coalesce(p_related_table, '')));

  return case t
    when 'proto_invoices' then exists (
      select 1 from public.proto_invoices x
      where x.id = p_related_id and x.workspace_company_id = ws
    )
    when 'proto_receipts' then exists (
      select 1 from public.proto_receipts x
      where x.id = p_related_id and x.workspace_company_id = ws
    )
    when 'proto_payments' then exists (
      select 1 from public.proto_payments x
      where x.id = p_related_id and x.workspace_company_id = ws
    )
    when 'proto_companies' then exists (
      select 1 from public.proto_companies x
      where x.id = p_related_id and x.workspace_company_id = ws
    )
    when 'proto_tax_obligations' then exists (
      select 1 from public.proto_tax_obligations x
      where x.id = p_related_id and x.workspace_company_id = ws
    )
    when 'proto_tax_payments' then exists (
      select 1 from public.proto_tax_payments x
      where x.id = p_related_id and x.workspace_company_id = ws
    )
    when 'actions' then exists (
      select 1 from public.actions x
      where x.id = p_related_id and x.workspace_company_id = ws
    )
    else false
  end;
end;
$$;

comment on function public.copilot_proto_document_related_in_tenant(text, uuid) is
  'SEC-02: related_table en CASE cerrado; tenant vía workspace_company_id y copilot_current_workspace_company_id().';

revoke all on function public.copilot_proto_document_related_in_tenant(text, uuid) from public;
grant execute on function public.copilot_proto_document_related_in_tenant(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- B) initiatives: tenant + trigger fail-closed + RLS
-- ---------------------------------------------------------------------------
create or replace function public.copilot_initiatives_force_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if auth.uid() is null then
    raise exception
      'copilot_initiatives: sin auth.uid() y sin bypass permitido (sec02-04)'
      using errcode = '42501';
  end if;

  wid := public.copilot_current_workspace_company_id();
  if wid is null then
    raise exception 'copilot_initiatives: sin workspace (app_users/JWT)'
      using errcode = '42501';
  end if;

  new.workspace_company_id := wid;
  return new;
end;
$$;

do $sec04_initiatives$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'initiatives'
  ) then
    return;
  end if;

  alter table public.initiatives
    add column if not exists workspace_company_id uuid
      references public.companies (id) on delete restrict;

  create index if not exists idx_initiatives_workspace_company_id
    on public.initiatives (workspace_company_id);

  drop trigger if exists trg_initiatives_force_workspace on public.initiatives;
  create trigger trg_initiatives_force_workspace
    before insert or update on public.initiatives
    for each row execute function public.copilot_initiatives_force_workspace();

  update public.initiatives t
  set workspace_company_id = sub.cid
  from (select id as cid from public.companies order by created_at asc limit 1) sub
  where t.workspace_company_id is null;

  if exists (select 1 from public.initiatives where workspace_company_id is null) then
    raise exception 'sec02-04 initiatives: NULLs restantes; abortar' using errcode = '23514';
  end if;

  alter table public.initiatives alter column workspace_company_id set not null;
  alter table public.initiatives enable row level security;

  drop policy if exists initiatives_tenant_select on public.initiatives;
  drop policy if exists initiatives_tenant_insert on public.initiatives;
  drop policy if exists initiatives_tenant_update on public.initiatives;
  drop policy if exists initiatives_tenant_delete on public.initiatives;
  drop policy if exists initiatives_tenant_isolation on public.initiatives;

  create policy initiatives_tenant_select on public.initiatives for select to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy initiatives_tenant_insert on public.initiatives for insert to authenticated
    with check (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy initiatives_tenant_update on public.initiatives for update to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id())
    with check (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy initiatives_tenant_delete on public.initiatives for delete to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());
end;
$sec04_initiatives$;

-- ---------------------------------------------------------------------------
-- C) Motor hijo: sync workspace desde initiative (fail-closed)
-- ---------------------------------------------------------------------------
create or replace function public.copilot_engine_child_sync_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  iws    uuid;
  jwt_ws uuid;
begin
  select i.workspace_company_id into iws
  from public.initiatives i
  where i.id = new.initiative_id;

  if iws is null then
    raise exception 'copilot_engine_child: initiative inexistente o sin workspace_company_id'
      using errcode = '23503';
  end if;

  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or session_user in ('postgres', 'supabase_admin') then
    new.workspace_company_id := iws;
    return new;
  end if;

  if auth.uid() is null then
    raise exception
      'copilot_engine_child: sin auth.uid() y sin bypass permitido (sec02-04)'
      using errcode = '42501';
  end if;

  jwt_ws := public.copilot_current_workspace_company_id();
  if jwt_ws is null or jwt_ws is distinct from iws then
    raise exception 'copilot_engine_child: initiative fuera del workspace del usuario'
      using errcode = '42501';
  end if;

  new.workspace_company_id := iws;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- D) decisions
-- ---------------------------------------------------------------------------
do $sec04_decisions$
declare
  orphan_cnt int;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'decisions'
  ) then
    return;
  end if;

  alter table public.decisions
    add column if not exists workspace_company_id uuid
      references public.companies (id) on delete restrict;

  create index if not exists idx_decisions_workspace_company_id
    on public.decisions (workspace_company_id);

  drop trigger if exists trg_decisions_sync_workspace on public.decisions;
  create trigger trg_decisions_sync_workspace
    before insert or update on public.decisions
    for each row execute function public.copilot_engine_child_sync_workspace();

  update public.decisions c
  set workspace_company_id = i.workspace_company_id
  from public.initiatives i
  where i.id = c.initiative_id and c.workspace_company_id is null;

  update public.decisions c
  set workspace_company_id = sub.cid
  from (select id as cid from public.companies order by created_at asc limit 1) sub
  where c.workspace_company_id is null;

  select count(*)::int into orphan_cnt from public.decisions where workspace_company_id is null;
  if orphan_cnt > 0 then
    raise exception 'sec02-04 decisions: NULLs restantes (% filas); abortar', orphan_cnt
      using errcode = '23514';
  end if;

  alter table public.decisions alter column workspace_company_id set not null;
  alter table public.decisions enable row level security;

  drop policy if exists decisions_tenant_select on public.decisions;
  drop policy if exists decisions_tenant_insert on public.decisions;
  drop policy if exists decisions_tenant_update on public.decisions;
  drop policy if exists decisions_tenant_delete on public.decisions;
  drop policy if exists decisions_tenant_isolation on public.decisions;

  create policy decisions_tenant_select on public.decisions for select to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy decisions_tenant_insert on public.decisions for insert to authenticated
    with check (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy decisions_tenant_update on public.decisions for update to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id())
    with check (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy decisions_tenant_delete on public.decisions for delete to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());
end;
$sec04_decisions$;

-- ---------------------------------------------------------------------------
-- E) actions
-- ---------------------------------------------------------------------------
do $sec04_actions$
declare
  orphan_cnt int;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'actions'
  ) then
    return;
  end if;

  alter table public.actions
    add column if not exists workspace_company_id uuid
      references public.companies (id) on delete restrict;

  create index if not exists idx_actions_workspace_company_id
    on public.actions (workspace_company_id);

  drop trigger if exists trg_actions_sync_workspace on public.actions;
  create trigger trg_actions_sync_workspace
    before insert or update on public.actions
    for each row execute function public.copilot_engine_child_sync_workspace();

  update public.actions c
  set workspace_company_id = i.workspace_company_id
  from public.initiatives i
  where i.id = c.initiative_id and c.workspace_company_id is null;

  update public.actions c
  set workspace_company_id = sub.cid
  from (select id as cid from public.companies order by created_at asc limit 1) sub
  where c.workspace_company_id is null;

  select count(*)::int into orphan_cnt from public.actions where workspace_company_id is null;
  if orphan_cnt > 0 then
    raise exception 'sec02-04 actions: NULLs restantes (% filas); abortar', orphan_cnt
      using errcode = '23514';
  end if;

  alter table public.actions alter column workspace_company_id set not null;
  alter table public.actions enable row level security;

  drop policy if exists actions_tenant_select on public.actions;
  drop policy if exists actions_tenant_insert on public.actions;
  drop policy if exists actions_tenant_update on public.actions;
  drop policy if exists actions_tenant_delete on public.actions;
  drop policy if exists actions_tenant_isolation on public.actions;

  create policy actions_tenant_select on public.actions for select to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy actions_tenant_insert on public.actions for insert to authenticated
    with check (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy actions_tenant_update on public.actions for update to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id())
    with check (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy actions_tenant_delete on public.actions for delete to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());
end;
$sec04_actions$;

-- ---------------------------------------------------------------------------
-- F) outcomes
-- ---------------------------------------------------------------------------
do $sec04_outcomes$
declare
  orphan_cnt int;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'outcomes'
  ) then
    return;
  end if;

  alter table public.outcomes
    add column if not exists workspace_company_id uuid
      references public.companies (id) on delete restrict;

  create index if not exists idx_outcomes_workspace_company_id
    on public.outcomes (workspace_company_id);

  drop trigger if exists trg_outcomes_sync_workspace on public.outcomes;
  create trigger trg_outcomes_sync_workspace
    before insert or update on public.outcomes
    for each row execute function public.copilot_engine_child_sync_workspace();

  update public.outcomes c
  set workspace_company_id = i.workspace_company_id
  from public.initiatives i
  where i.id = c.initiative_id and c.workspace_company_id is null;

  update public.outcomes c
  set workspace_company_id = sub.cid
  from (select id as cid from public.companies order by created_at asc limit 1) sub
  where c.workspace_company_id is null;

  select count(*)::int into orphan_cnt from public.outcomes where workspace_company_id is null;
  if orphan_cnt > 0 then
    raise exception 'sec02-04 outcomes: NULLs restantes (% filas); abortar', orphan_cnt
      using errcode = '23514';
  end if;

  alter table public.outcomes alter column workspace_company_id set not null;
  alter table public.outcomes enable row level security;

  drop policy if exists outcomes_tenant_select on public.outcomes;
  drop policy if exists outcomes_tenant_insert on public.outcomes;
  drop policy if exists outcomes_tenant_update on public.outcomes;
  drop policy if exists outcomes_tenant_delete on public.outcomes;
  drop policy if exists outcomes_tenant_isolation on public.outcomes;

  create policy outcomes_tenant_select on public.outcomes for select to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy outcomes_tenant_insert on public.outcomes for insert to authenticated
    with check (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy outcomes_tenant_update on public.outcomes for update to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id())
    with check (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy outcomes_tenant_delete on public.outcomes for delete to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());
end;
$sec04_outcomes$;

-- ---------------------------------------------------------------------------
-- G) proto_documents
-- ---------------------------------------------------------------------------
do $sec04_proto_documents$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'proto_documents'
  ) then
    return;
  end if;

  alter table public.proto_documents
    add column if not exists workspace_company_id uuid
      references public.companies (id) on delete restrict;

  create index if not exists idx_proto_documents_workspace_company_id
    on public.proto_documents (workspace_company_id);

  drop trigger if exists trg_proto_documents_force_workspace on public.proto_documents;
  create trigger trg_proto_documents_force_workspace
    before insert or update on public.proto_documents
    for each row execute function public.copilot_proto_row_force_workspace();

  update public.proto_documents d
  set workspace_company_id = i.workspace_company_id
  from public.proto_invoices i
  where lower(trim(both from d.related_table)) = 'proto_invoices'
    and d.related_id = i.id and d.workspace_company_id is null;

  update public.proto_documents d
  set workspace_company_id = r.workspace_company_id
  from public.proto_receipts r
  where lower(trim(both from d.related_table)) = 'proto_receipts'
    and d.related_id = r.id and d.workspace_company_id is null;

  update public.proto_documents d
  set workspace_company_id = p.workspace_company_id
  from public.proto_payments p
  where lower(trim(both from d.related_table)) = 'proto_payments'
    and d.related_id = p.id and d.workspace_company_id is null;

  update public.proto_documents d
  set workspace_company_id = c.workspace_company_id
  from public.proto_companies c
  where lower(trim(both from d.related_table)) = 'proto_companies'
    and d.related_id = c.id and d.workspace_company_id is null;

  update public.proto_documents d
  set workspace_company_id = o.workspace_company_id
  from public.proto_tax_obligations o
  where lower(trim(both from d.related_table)) = 'proto_tax_obligations'
    and d.related_id = o.id and d.workspace_company_id is null;

  update public.proto_documents d
  set workspace_company_id = p.workspace_company_id
  from public.proto_tax_payments p
  where lower(trim(both from d.related_table)) = 'proto_tax_payments'
    and d.related_id = p.id and d.workspace_company_id is null;

  update public.proto_documents d
  set workspace_company_id = a.workspace_company_id
  from public.actions a
  where lower(trim(both from d.related_table)) = 'actions'
    and d.related_id = a.id and d.workspace_company_id is null;

  update public.proto_documents d
  set workspace_company_id = sub.cid
  from (select id as cid from public.companies order by created_at asc limit 1) sub
  where d.workspace_company_id is null;

  if exists (select 1 from public.proto_documents where workspace_company_id is null) then
    raise exception 'sec02-04 proto_documents: NULLs restantes; abortar' using errcode = '23514';
  end if;

  alter table public.proto_documents alter column workspace_company_id set not null;
  alter table public.proto_documents enable row level security;

  drop policy if exists proto_documents_tenant_select on public.proto_documents;
  drop policy if exists proto_documents_tenant_insert on public.proto_documents;
  drop policy if exists proto_documents_tenant_update on public.proto_documents;
  drop policy if exists proto_documents_tenant_delete on public.proto_documents;
  drop policy if exists proto_documents_all on public.proto_documents;

  create policy proto_documents_tenant_select on public.proto_documents for select to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());
  create policy proto_documents_tenant_insert on public.proto_documents for insert to authenticated
    with check (
      workspace_company_id = public.copilot_current_workspace_company_id()
      and public.copilot_proto_document_related_in_tenant(related_table, related_id)
    );
  create policy proto_documents_tenant_update on public.proto_documents for update to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id())
    with check (
      workspace_company_id = public.copilot_current_workspace_company_id()
      and public.copilot_proto_document_related_in_tenant(related_table, related_id)
    );
  create policy proto_documents_tenant_delete on public.proto_documents for delete to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());
end;
$sec04_proto_documents$;

-- CHECK FINAL: no quedan loops `for ... in (select ...)` en sec02-04
