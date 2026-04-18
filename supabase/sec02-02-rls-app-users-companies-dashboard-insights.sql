-- =============================================================================
-- SEC-02 — Paso 2: RLS núcleo (app_users, companies, dashboard_snapshots, copilot_insights)
-- =============================================================================
-- Prerrequisito: sec02-01-copilot-tenant-helper.sql ejecutado.
--
-- ORDEN DENTRO DE ESTE ARCHIVO (robusto):
--   1) Políticas RLS en tablas sin trigger de escritura (app_users, companies).
--   2) Funciones + triggers fail-closed (dashboard_snapshots, copilot_insights).
--   3) Políticas RLS explícitas por comando (SELECT / INSERT / UPDATE / DELETE) en tablas con triggers.
--
-- POLÍTICAS: SELECT → USING; INSERT → WITH CHECK; UPDATE → USING + WITH CHECK; DELETE → USING.
--
-- Idempotente: DROP IF EXISTS + CREATE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) app_users: solo lectura del mismo workspace (sin mutación vía authenticated)
-- ---------------------------------------------------------------------------
alter table public.app_users enable row level security;

drop policy if exists "app_users_select_same_workspace" on public.app_users;
drop policy if exists "app_users_all" on public.app_users;

create policy "app_users_select_same_workspace"
  on public.app_users
  for select
  to authenticated
  using (company_id = public.copilot_current_workspace_company_id());

-- Sin políticas INSERT/UPDATE/DELETE → authenticated no muta (service_role bypass RLS si aplica).

-- ---------------------------------------------------------------------------
-- B) companies: solo la fila del workspace actual
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;

drop policy if exists "companies_select_own_workspace" on public.companies;
drop policy if exists "companies_all" on public.companies;

create policy "companies_select_own_workspace"
  on public.companies
  for select
  to authenticated
  using (id = public.copilot_current_workspace_company_id());

-- ---------------------------------------------------------------------------
-- C) dashboard_snapshots: triggers fail-closed + RLS por comando
-- ---------------------------------------------------------------------------
-- Función trigger: fuerza company_id (= tenant) en INSERT/UPDATE de sesión final.
-- BYPASS DOCUMENTADO (conservador, solo rutas conocidas):
--   - JWT `role` = `service_role` (clave de servicio Supabase).
--   - `session_user` en `postgres` / `supabase_admin` (SQL Editor / mantenimiento).
-- Cualquier otro caso sin auth.uid() → ERROR (fail-closed).
create or replace function public.copilot_dashboard_snapshots_force_tenant()
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
      'copilot_dashboard_snapshots: operación tenant sin auth.uid() y sin bypass permitido (ver comentario en sec02-02)'
      using errcode = '42501';
  end if;

  wid := public.copilot_current_workspace_company_id();
  if wid is null then
    raise exception 'copilot_dashboard_snapshots: sin workspace (app_users sin fila para este JWT)'
      using errcode = '42501';
  end if;

  new.company_id := wid;
  return new;
end;
$$;

drop trigger if exists trg_dashboard_snapshots_force_tenant_ins on public.dashboard_snapshots;
create trigger trg_dashboard_snapshots_force_tenant_ins
  before insert on public.dashboard_snapshots
  for each row
  execute function public.copilot_dashboard_snapshots_force_tenant();

drop trigger if exists trg_dashboard_snapshots_force_tenant_upd on public.dashboard_snapshots;
create trigger trg_dashboard_snapshots_force_tenant_upd
  before update on public.dashboard_snapshots
  for each row
  execute function public.copilot_dashboard_snapshots_force_tenant();

alter table public.dashboard_snapshots enable row level security;

drop policy if exists "Allow read access" on public.dashboard_snapshots;
drop policy if exists "dashboard_snapshots_select_own_company" on public.dashboard_snapshots;
drop policy if exists "dashboard_snapshots_insert_own_company" on public.dashboard_snapshots;
drop policy if exists "dashboard_snapshots_update_own_company" on public.dashboard_snapshots;
drop policy if exists "dashboard_snapshots_delete_own_company" on public.dashboard_snapshots;

create policy "dashboard_snapshots_select_own_company"
  on public.dashboard_snapshots
  for select
  to authenticated
  using (company_id = public.copilot_current_workspace_company_id());

create policy "dashboard_snapshots_insert_own_company"
  on public.dashboard_snapshots
  for insert
  to authenticated
  with check (company_id = public.copilot_current_workspace_company_id());

create policy "dashboard_snapshots_update_own_company"
  on public.dashboard_snapshots
  for update
  to authenticated
  using (company_id = public.copilot_current_workspace_company_id())
  with check (company_id = public.copilot_current_workspace_company_id());

create policy "dashboard_snapshots_delete_own_company"
  on public.dashboard_snapshots
  for delete
  to authenticated
  using (company_id = public.copilot_current_workspace_company_id());

-- ---------------------------------------------------------------------------
-- D) copilot_insights (si existe): misma política fail-closed + RLS por comando
--     Prerrequisito DDL: create-copilot-insights.sql
-- ---------------------------------------------------------------------------
create or replace function public.copilot_insights_force_tenant()
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
      'copilot_insights: operación tenant sin auth.uid() y sin bypass permitido (ver comentario en sec02-02)'
      using errcode = '42501';
  end if;

  wid := public.copilot_current_workspace_company_id();
  if wid is null then
    raise exception 'copilot_insights: sin workspace (app_users sin fila para este JWT)'
      using errcode = '42501';
  end if;

  new.company_id := wid;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'copilot_insights'
  ) then
    null;
  else
    drop trigger if exists trg_copilot_insights_force_tenant_ins on public.copilot_insights;
    create trigger trg_copilot_insights_force_tenant_ins
      before insert on public.copilot_insights
      for each row
      execute function public.copilot_insights_force_tenant();

    drop trigger if exists trg_copilot_insights_force_tenant_upd on public.copilot_insights;
    create trigger trg_copilot_insights_force_tenant_upd
      before update on public.copilot_insights
      for each row
      execute function public.copilot_insights_force_tenant();

    alter table public.copilot_insights enable row level security;

    drop policy if exists "copilot_insights_select_own" on public.copilot_insights;
    drop policy if exists "copilot_insights_insert_own" on public.copilot_insights;
    drop policy if exists "copilot_insights_update_own" on public.copilot_insights;
    drop policy if exists "copilot_insights_delete_own" on public.copilot_insights;

    create policy "copilot_insights_select_own"
      on public.copilot_insights
      for select
      to authenticated
      using (company_id = public.copilot_current_workspace_company_id());

    create policy "copilot_insights_insert_own"
      on public.copilot_insights
      for insert
      to authenticated
      with check (company_id = public.copilot_current_workspace_company_id());

    create policy "copilot_insights_update_own"
      on public.copilot_insights
      for update
      to authenticated
      using (company_id = public.copilot_current_workspace_company_id())
      with check (company_id = public.copilot_current_workspace_company_id());

    create policy "copilot_insights_delete_own"
      on public.copilot_insights
      for delete
      to authenticated
      using (company_id = public.copilot_current_workspace_company_id());
  end if;
end;
$$;
