-- Summer87 Copilot: usuarios de negocio (app_users)
-- Prerrequisito: public.companies con slug summer87-demo (extend-multi-tenant.sql).
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'owner',
  created_at timestamp not null default now()
);

create index if not exists idx_app_users_company_id
  on public.app_users (company_id);

insert into public.app_users (company_id, full_name, email, role)
select c.id, 'Summer87 Demo Owner', 'demo@summer87.com', 'owner'
from public.companies c
where c.slug = 'summer87-demo'
on conflict (email) do nothing;
