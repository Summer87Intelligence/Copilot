-- SECURITY-02: endurecimiento login PIN (hash, lockout, auditoría, credential_version).
-- Zero-downtime: columnas nuevas nullable/default; no DROP de `pin` en esta fase.
-- Ejecutar en Supabase SQL Editor o migración gestionada.

-- ---------------------------------------------------------------------------
-- A) app_users — columnas de credencial y lockout
-- ---------------------------------------------------------------------------
alter table public.app_users
  add column if not exists pin_hash text;

alter table public.app_users
  add column if not exists credential_version integer not null default 1;

alter table public.app_users
  add column if not exists credentials_updated_at timestamptz;

alter table public.app_users
  add column if not exists failed_login_count integer not null default 0;

alter table public.app_users
  add column if not exists locked_until timestamptz;

alter table public.app_users
  add column if not exists last_login_at timestamptz;

comment on column public.app_users.pin_hash is
  'SECURITY-02: Argon2id PHC string. Coexiste con `pin` legacy hasta migración completa.';
comment on column public.app_users.credential_version is
  'SECURITY-02: incrementar al rotar PIN/credenciales; cookie debe coincidir.';
comment on column public.app_users.failed_login_count is
  'SECURITY-02: intentos fallidos consecutivos de login PIN.';
comment on column public.app_users.locked_until is
  'SECURITY-02: bloqueo temporal tras demasiados fallos; null = desbloqueado.';

-- ---------------------------------------------------------------------------
-- B) auth_login_events — auditoría (sin PIN ni hashes)
-- ---------------------------------------------------------------------------
create table if not exists public.auth_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  success boolean not null,
  failure_reason text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_login_events_user_created
  on public.auth_login_events (user_id, created_at desc);

create index if not exists idx_auth_login_events_company_created
  on public.auth_login_events (company_id, created_at desc);

comment on table public.auth_login_events is
  'SECURITY-02: auditoría de intentos de login Copilot PIN y eventos de sesión.';

alter table public.auth_login_events enable row level security;

-- Sin políticas para authenticated/anon: solo service_role (bypass) inserta/consulta desde API.

grant insert, select on public.auth_login_events to service_role;
