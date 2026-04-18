-- =============================================================================
-- ZETA-02 — Paso 2: triggers fail-closed, RLS por tenant, grants
-- =============================================================================
-- Prerrequisito: zeta-02-01-sync-state-schema.sql y sec02-01 (helper tenant).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) zeta_sync_runs: fuerza company_id desde JWT (mismo patrón que dashboard)
-- ---------------------------------------------------------------------------
create or replace function public.copilot_zeta_sync_runs_force_company()
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
      'copilot_zeta_sync_runs: sin auth.uid() y sin bypass permitido (zeta-02-02)'
      using errcode = '42501';
  end if;

  wid := public.copilot_current_workspace_company_id();
  if wid is null then
    raise exception 'copilot_zeta_sync_runs: sin workspace (app_users/JWT)'
      using errcode = '42501';
  end if;

  new.company_id := wid;
  return new;
end;
$$;

drop trigger if exists trg_zeta_sync_runs_force_company_ins on public.zeta_sync_runs;
create trigger trg_zeta_sync_runs_force_company_ins
  before insert on public.zeta_sync_runs
  for each row
  execute function public.copilot_zeta_sync_runs_force_company();

drop trigger if exists trg_zeta_sync_runs_force_company_upd on public.zeta_sync_runs;
create trigger trg_zeta_sync_runs_force_company_upd
  before update on public.zeta_sync_runs
  for each row
  execute function public.copilot_zeta_sync_runs_force_company();

alter table public.zeta_sync_runs enable row level security;

drop policy if exists zeta_sync_runs_tenant_select on public.zeta_sync_runs;
drop policy if exists zeta_sync_runs_tenant_insert on public.zeta_sync_runs;
drop policy if exists zeta_sync_runs_tenant_update on public.zeta_sync_runs;
drop policy if exists zeta_sync_runs_tenant_delete on public.zeta_sync_runs;

create policy zeta_sync_runs_tenant_select on public.zeta_sync_runs
  for select to authenticated
  using (company_id = public.copilot_current_workspace_company_id());

create policy zeta_sync_runs_tenant_insert on public.zeta_sync_runs
  for insert to authenticated
  with check (company_id = public.copilot_current_workspace_company_id());

create policy zeta_sync_runs_tenant_update on public.zeta_sync_runs
  for update to authenticated
  using (company_id = public.copilot_current_workspace_company_id())
  with check (company_id = public.copilot_current_workspace_company_id());

create policy zeta_sync_runs_tenant_delete on public.zeta_sync_runs
  for delete to authenticated
  using (company_id = public.copilot_current_workspace_company_id());

-- ---------------------------------------------------------------------------
-- B) zeta_sync_state: fuerza company_id desde JWT
-- ---------------------------------------------------------------------------
create or replace function public.copilot_zeta_sync_state_force_company()
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
      'copilot_zeta_sync_state: sin auth.uid() y sin bypass permitido (zeta-02-02)'
      using errcode = '42501';
  end if;

  wid := public.copilot_current_workspace_company_id();
  if wid is null then
    raise exception 'copilot_zeta_sync_state: sin workspace (app_users/JWT)'
      using errcode = '42501';
  end if;

  new.company_id := wid;
  return new;
end;
$$;

drop trigger if exists trg_zeta_sync_state_force_company_ins on public.zeta_sync_state;
create trigger trg_zeta_sync_state_force_company_ins
  before insert on public.zeta_sync_state
  for each row
  execute function public.copilot_zeta_sync_state_force_company();

drop trigger if exists trg_zeta_sync_state_force_company_upd on public.zeta_sync_state;
create trigger trg_zeta_sync_state_force_company_upd
  before update on public.zeta_sync_state
  for each row
  execute function public.copilot_zeta_sync_state_force_company();

alter table public.zeta_sync_state enable row level security;

drop policy if exists zeta_sync_state_tenant_select on public.zeta_sync_state;
drop policy if exists zeta_sync_state_tenant_insert on public.zeta_sync_state;
drop policy if exists zeta_sync_state_tenant_update on public.zeta_sync_state;
drop policy if exists zeta_sync_state_tenant_delete on public.zeta_sync_state;

create policy zeta_sync_state_tenant_select on public.zeta_sync_state
  for select to authenticated
  using (company_id = public.copilot_current_workspace_company_id());

create policy zeta_sync_state_tenant_insert on public.zeta_sync_state
  for insert to authenticated
  with check (company_id = public.copilot_current_workspace_company_id());

create policy zeta_sync_state_tenant_update on public.zeta_sync_state
  for update to authenticated
  using (company_id = public.copilot_current_workspace_company_id())
  with check (company_id = public.copilot_current_workspace_company_id());

create policy zeta_sync_state_tenant_delete on public.zeta_sync_state
  for delete to authenticated
  using (company_id = public.copilot_current_workspace_company_id());

-- ---------------------------------------------------------------------------
-- C) zeta_sync_raw_payloads: company_id derivada de la corrida (anti-spoof)
-- ---------------------------------------------------------------------------
create or replace function public.copilot_zeta_sync_raw_sync_company_from_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  select r.company_id into cid
  from public.zeta_sync_runs r
  where r.id = new.sync_run_id;

  if cid is null then
    raise exception 'copilot_zeta_sync_raw: sync_run_id inexistente'
      using errcode = '23503';
  end if;

  new.company_id := cid;
  return new;
end;
$$;

drop trigger if exists trg_zeta_sync_raw_sync_company_ins on public.zeta_sync_raw_payloads;
create trigger trg_zeta_sync_raw_sync_company_ins
  before insert on public.zeta_sync_raw_payloads
  for each row
  execute function public.copilot_zeta_sync_raw_sync_company_from_run();

drop trigger if exists trg_zeta_sync_raw_sync_company_upd on public.zeta_sync_raw_payloads;
create trigger trg_zeta_sync_raw_sync_company_upd
  before update on public.zeta_sync_raw_payloads
  for each row
  execute function public.copilot_zeta_sync_raw_sync_company_from_run();

alter table public.zeta_sync_raw_payloads enable row level security;

drop policy if exists zeta_sync_raw_tenant_select on public.zeta_sync_raw_payloads;
drop policy if exists zeta_sync_raw_tenant_insert on public.zeta_sync_raw_payloads;
drop policy if exists zeta_sync_raw_tenant_update on public.zeta_sync_raw_payloads;
drop policy if exists zeta_sync_raw_tenant_delete on public.zeta_sync_raw_payloads;

create policy zeta_sync_raw_tenant_select on public.zeta_sync_raw_payloads
  for select to authenticated
  using (company_id = public.copilot_current_workspace_company_id());

create policy zeta_sync_raw_tenant_insert on public.zeta_sync_raw_payloads
  for insert to authenticated
  with check (company_id = public.copilot_current_workspace_company_id());

create policy zeta_sync_raw_tenant_update on public.zeta_sync_raw_payloads
  for update to authenticated
  using (company_id = public.copilot_current_workspace_company_id())
  with check (company_id = public.copilot_current_workspace_company_id());

create policy zeta_sync_raw_tenant_delete on public.zeta_sync_raw_payloads
  for delete to authenticated
  using (company_id = public.copilot_current_workspace_company_id());

-- ---------------------------------------------------------------------------
-- D) Grants (alineado a sec02-05: operational, sin anon)
-- ---------------------------------------------------------------------------
do $zeta_grants$
declare
  t text;
begin
  foreach t in array array[
    'zeta_sync_runs',
    'zeta_sync_state',
    'zeta_sync_raw_payloads'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('revoke all on table public.%I from anon', t);
      execute format('revoke all on table public.%I from authenticated', t);
      execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    end if;
  end loop;
end;
$zeta_grants$;
