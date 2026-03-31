-- Summer87 Copilot: multi-tenant (companies + company_id en snapshots)
-- Prerrequisito: tabla public.dashboard_snapshots ya creada (p. ej. init-dashboard.sql).
-- Ejecutar en Supabase SQL Editor. No se ejecuta desde el repo.

-- A. Empresas
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamp not null default now()
);

-- B. FK en snapshots (nullable hasta poblar)
alter table public.dashboard_snapshots
  add column if not exists company_id uuid references public.companies (id) on delete cascade;

-- C. Empresa demo
insert into public.companies (name, slug)
values ('Summer87 Demo Company', 'summer87-demo')
on conflict (slug) do nothing;

-- D. Asociar filas existentes a la empresa demo
update public.dashboard_snapshots ds
set company_id = c.id
from public.companies c
where c.slug = 'summer87-demo'
  and ds.company_id is null;

-- Índice para el siguiente paso (filtros por empresa)
create index if not exists idx_dashboard_snapshots_company_id
  on public.dashboard_snapshots (company_id);

-- E. company_id obligatorio una vez pobladas las filas existentes
alter table public.dashboard_snapshots
  alter column company_id set not null;

-- F. RLS en dashboard_snapshots: sin cambios a policies (siguen aplicando a todas las filas).
