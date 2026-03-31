-- Summer87 Copilot: RLS tenant-safe para INSERT/SELECT en dashboard_snapshots
-- Objetivo:
-- - Permitir INSERT desde frontend autenticado solo para su empresa.
-- - Permitir SELECT solo de snapshots de la misma empresa.
-- - Sin desactivar RLS ni abrir acceso público.
--
-- Ejecutar en Supabase SQL Editor.

alter table public.dashboard_snapshots enable row level security;

-- Quitar policy legacy demasiado amplia (si existe).
drop policy if exists "Allow read access" on public.dashboard_snapshots;

-- Idempotencia: eliminar y recrear políticas objetivo.
drop policy if exists "dashboard_snapshots_select_own_company"
  on public.dashboard_snapshots;
drop policy if exists "dashboard_snapshots_insert_own_company"
  on public.dashboard_snapshots;

-- SELECT: cada usuario autenticado solo ve snapshots de su company_id según app_users.
create policy "dashboard_snapshots_select_own_company"
  on public.dashboard_snapshots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and au.company_id = dashboard_snapshots.company_id
    )
  );

-- INSERT: cada usuario autenticado solo puede insertar snapshots para su empresa.
create policy "dashboard_snapshots_insert_own_company"
  on public.dashboard_snapshots
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and au.company_id = dashboard_snapshots.company_id
    )
  );
