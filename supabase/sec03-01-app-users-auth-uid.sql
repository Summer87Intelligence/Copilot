-- =============================================================================
-- SEC-03-01 — Migrar tenant resolver a auth.uid()
-- =============================================================================
-- Problema:
--   `copilot_current_workspace_company_id()` resuelve workspace vía
--   `auth.jwt() ->> 'email'`. Si el usuario cambia el email en Supabase Auth,
--   el JWT actualizado ya no matchea `app_users.email` → RLS falla silenciosamente.
--
-- Solución:
--   1) Agregar `app_users.auth_user_id uuid` — FK a `auth.users(id)`.
--   2) Backfill vía match de email (único camino seguro para datos existentes).
--   3) Actualizar `copilot_current_workspace_company_id()` para resolver
--      primero por `auth.uid()` y, si no hay match, fallback por email.
--   4) El fallback email se elimina cuando auth_user_id tenga cobertura total.
--
-- ORDEN SEGURO DE APLICACIÓN:
--   1) Este script en Supabase SQL Editor (idempotente).
--   2) Verificar con: SELECT COUNT(*) FROM app_users WHERE auth_user_id IS NULL;
--      → debería ser 0 si todos los usuarios tienen email coincidente en auth.users.
--   3) Cuando auth_user_id IS NULL COUNT = 0, eliminar el fallback email (ver TODO).
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE.
-- NO modifica políticas RLS existentes (solo actualiza la función que usan).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Columna auth_user_id
-- ---------------------------------------------------------------------------
alter table public.app_users
  add column if not exists auth_user_id uuid unique
    references auth.users(id) on delete set null;

comment on column public.app_users.auth_user_id is
  'SEC-03: UUID de auth.users(id). Fuente principal de resolución de tenant. '
  'Backfill via email match. Null para usuarios creados antes de esta migración '
  'hasta que se re-autentiquen o se actualicen manualmente.';

-- Índice para lookups rápidos por auth.uid() (usado en función RLS)
create index if not exists idx_app_users_auth_user_id
  on public.app_users (auth_user_id)
  where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Backfill auth_user_id desde auth.users por email
--    Solo actualiza filas donde auth_user_id todavía es NULL.
--    Safe: si el email no existe en auth.users, la fila queda NULL (fallback email activo).
-- ---------------------------------------------------------------------------
update public.app_users au
set auth_user_id = a.id
from auth.users a
where lower(trim(a.email)) = lower(trim(au.email))
  and au.auth_user_id is null;

-- Log del resultado del backfill (útil para verificación manual en SQL Editor)
do $$
declare
  total_users     integer;
  linked_users    integer;
  unlinked_users  integer;
begin
  select count(*) into total_users   from public.app_users;
  select count(*) into linked_users  from public.app_users where auth_user_id is not null;
  unlinked_users := total_users - linked_users;

  raise notice 'SEC-03-01 backfill: total=% linked=% unlinked=%',
    total_users, linked_users, unlinked_users;

  if unlinked_users > 0 then
    raise notice 'ADVERTENCIA: % app_users sin auth_user_id. '
      'Verificar emails en auth.users. El fallback email sigue activo para estos usuarios.',
      unlinked_users;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Función actualizada: resolver por auth.uid() primero, fallback email
-- ---------------------------------------------------------------------------
create or replace function public.copilot_current_workspace_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Resolución primaria: auth.uid() → app_users.auth_user_id
  -- Más segura que el email: no se rompe si el usuario cambia su email en Auth.
  -- NOTA: cada rama del UNION debe estar entre paréntesis en PostgreSQL
  -- para que LIMIT aplique a esa rama y no a toda la query.
  (
    select au.company_id
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and auth.uid() is not null
    limit 1
  )

  union all

  -- TODO(SEC-03): Eliminar este fallback cuando auth_user_id tenga cobertura total
  -- (COUNT(*) FROM app_users WHERE auth_user_id IS NULL = 0).
  -- El fallback garantiza que usuarios con auth_user_id NULL (pre-migración o
  -- sin match de email en auth.users) sigan teniendo acceso durante la transición.
  -- Condición de eliminación: todos los app_users deben tener auth_user_id poblado
  -- Y haber validado que el sistema funciona correctamente con solo auth.uid().
  (
    select au.company_id
    from public.app_users au
    where lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and au.auth_user_id is null
    limit 1
  )

  limit 1;
$$;

comment on function public.copilot_current_workspace_company_id() is
  'SEC-03: tenant workspace (public.companies.id). '
  'Resolución primaria: auth.uid() → app_users.auth_user_id. '
  'Fallback temporal: auth.jwt().email → app_users.email (para usuarios pre-migración). '
  'Eliminar fallback cuando app_users.auth_user_id tenga cobertura total.';

-- Los grants se mantienen igual
revoke all on function public.copilot_current_workspace_company_id() from public;
grant execute on function public.copilot_current_workspace_company_id() to authenticated;
