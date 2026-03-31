-- Summer87 Copilot: vincular usuario autenticado a empresa demo (app_users)
-- Prerrequisito: public.companies con slug 'summer87-demo'.
-- Ejecutar en Supabase SQL Editor (idempotente gracias a ON CONFLICT).

insert into public.app_users (
  id,
  company_id,
  full_name,
  email,
  role,
  created_at
)
select
  gen_random_uuid(),
  c.id,
  'Andres Larghero',
  'summer87.ai@gmail.com',
  'owner',
  now()
from public.companies c
where c.slug = 'summer87-demo'
on conflict (email) do nothing;
