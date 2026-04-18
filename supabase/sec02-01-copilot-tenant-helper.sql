-- =============================================================================
-- SEC-02 — Paso 1: función de resolución de tenant (workspace = public.companies)
-- =============================================================================
-- ORDEN DE EJECUCIÓN GLOBAL (mismo proyecto Supabase, manual):
--   1) sec02-01-copilot-tenant-helper.sql   (este archivo)
--   2) sec02-02-rls-app-users-companies-dashboard-insights.sql
--   3) sec02-03-rls-proto-workspace-column-and-policies.sql
--   4) sec02-04-rls-engine-and-documents.sql
--   5) sec02-05-grants-revoke-anon.sql
--
-- IDENTIDAD (alineado con SEC-01, sin rediseñar auth en este bloque):
--   - Resolución de tenant vía `app_users.email` normalizado = `auth.jwt() ->> 'email'`.
--   - Retorna `app_users.company_id` (= UUID de `public.companies`, workspace tenant).
--
-- DEUDA TÉCNICA FUTURA (comentario explícito, no implementado aquí):
--   - Conviene añadir `app_users.auth_user_id uuid unique references auth.users(id)` y
--     resolver tenant con `auth.uid()` para evitar acoplamiento al email del JWT y
--     soportar cambios de email sin desalinear membresía.
--
-- Prerrequisitos: tablas `public.app_users`, `public.companies` existentes.
-- Idempotente: `create or replace` / `create index if not exists`.
-- =============================================================================

create index if not exists idx_app_users_email_lower
  on public.app_users (lower(trim(email)));

-- Resuelve el UUID de empresa workspace (`public.companies.id`) para la petición actual.
create or replace function public.copilot_current_workspace_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select au.company_id
  from public.app_users au
  where lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  limit 1;
$$;

comment on function public.copilot_current_workspace_company_id() is
  'SEC-02: tenant workspace (public.companies.id) vía app_users.email = JWT email. '
  'Deuda futura: enlazar auth.users.id (auth.uid()) en app_users.';

revoke all on function public.copilot_current_workspace_company_id() from public;
grant execute on function public.copilot_current_workspace_company_id() to authenticated;
