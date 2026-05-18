-- =============================================================================
-- ZETA-17-01 — Tabla workspace_integrations
-- =============================================================================
-- Problema:
--   Credenciales Zeta hardcodeadas como env vars (ZETA_EMPRESA_CODIGO, etc.).
--   Incorporar un segundo cliente requiere re-deploy o nueva instancia Vercel.
--
-- Solución:
--   Tabla `workspace_integrations` con credenciales por workspace.
--   `loadZetaServerConfig(workspaceCompanyId)` lee primero de esta tabla,
--   fallback a env vars para no romper el tenant actual.
--
-- Seguridad:
--   - RLS habilitado: solo service_role puede leer `credentials`.
--   - No exponer credentials al cliente bajo ninguna circunstancia.
--   - Usar SUPABASE_SERVICE_ROLE_KEY solo en rutas server-side.
--
-- Encriptación:
--   TODO(ZETA-17): Las credenciales se almacenan como jsonb sin encriptación
--   en esta primera versión para simplificar la implementación inicial.
--   ANTES de usar en producción con múltiples clientes, migrar a:
--     - Supabase Vault (recomendado si está disponible en el proyecto)
--     - pgcrypto con WORKSPACE_INTEGRATION_ENCRYPTION_KEY server-side
--   El contrato de la columna `credentials` es estable — la encriptación es
--   un detalle de implementación que no cambia la interfaz.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + OR REPLACE.
-- =============================================================================

create table if not exists public.workspace_integrations (
  id                   uuid primary key default gen_random_uuid(),
  workspace_company_id uuid not null references public.companies(id) on delete cascade,
  provider             text not null check (provider in ('zeta')),
  status               text not null default 'active'
                         check (status in ('active', 'disabled', 'error')),
  -- Credenciales server-side. Solo service_role puede SELECT.
  -- TODO(ZETA-17): encriptar con Supabase Vault o pgcrypto antes de multi-tenant prod.
  credentials          jsonb,
  metadata             jsonb not null default '{}'::jsonb,
  last_validated_at    timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_company_id, provider)
);

comment on table public.workspace_integrations is
  'ZETA-17: Credenciales de integración por workspace. Solo service_role puede leer. '
  'TODO: encriptar `credentials` con Vault/pgcrypto antes de uso en multi-tenant producción.';

comment on column public.workspace_integrations.credentials is
  'Credenciales del proveedor en formato específico. Para Zeta: '
  '{"desarrolladorCodigo":"...","desarrolladorClave":"...","empresaCodigo":"...","empresaClave":"...","rolCodigo":"1","baseUrl":"..."}. '
  'NUNCA exponer al cliente. Solo server-side con service_role.';

-- Índice principal para lookup por workspace + provider
create index if not exists idx_workspace_integrations_workspace_provider
  on public.workspace_integrations (workspace_company_id, provider)
  where status = 'active';

-- Trigger para updated_at automático
create or replace function public.workspace_integrations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_workspace_integrations_updated_at
  on public.workspace_integrations;

create trigger trg_workspace_integrations_updated_at
  before update on public.workspace_integrations
  for each row
  execute function public.workspace_integrations_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: Solo service_role puede leer. Autenticados normales NO pueden leer creds.
-- ---------------------------------------------------------------------------
alter table public.workspace_integrations enable row level security;

-- Eliminar políticas previas si existen (idempotente)
drop policy if exists workspace_integrations_service_all  on public.workspace_integrations;
drop policy if exists workspace_integrations_deny_anon    on public.workspace_integrations;
drop policy if exists workspace_integrations_deny_auth    on public.workspace_integrations;

-- service_role bypasa RLS por defecto en Supabase → no necesita policy explícita.
-- Bloqueamos explícitamente a autenticados para evitar que el anon key exponga creds.
-- (La policy vacía significa "denied" para el rol authenticated.)
create policy workspace_integrations_deny_auth
  on public.workspace_integrations
  for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Revoke público
-- ---------------------------------------------------------------------------
revoke all on public.workspace_integrations from anon, authenticated;
-- service_role mantiene acceso por defecto de Supabase.
