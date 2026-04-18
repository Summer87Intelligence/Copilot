-- PROPUESTA (no ejecutar en CI): columnas para login Copilot usuario + PIN en `public.app_users`.
-- Ya existe `app_users` (id, company_id, full_name, email, role, created_at). Se amplía.

alter table public.app_users
  add column if not exists username text;

alter table public.app_users
  add column if not exists pin text;

-- Un solo login por username (case-insensitive). Solo filas con username no nulo.
create unique index if not exists idx_app_users_username_lower
  on public.app_users (lower(trim(username)))
  where username is not null and length(trim(username)) > 0;

comment on column public.app_users.username is
  'Identificador de login Copilot (único; puede ser email visible u otro alias operativo).';

comment on column public.app_users.pin is
  'PIN Copilot en texto plano (temporal; reemplazar por hash en etapa siguiente).';

-- Ejemplo manual (ajustar email/company existentes en tu entorno):
-- update public.app_users
--   set username = 'admin', pin = '1234', role = 'superadmin'
-- where email = 'demo@summer87.com';
