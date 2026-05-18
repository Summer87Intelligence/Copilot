-- =============================================================================
-- ZETA-17-02 — Asegurar columna companies.status
-- =============================================================================
-- Contexto:
--   `fetchActiveWorkspaceIdPage` filtra por `companies.status = 'active'`.
--   El cron funciona en producción → la columna existe en Supabase.
--   Sin embargo, no está en ningún archivo SQL del repo → riesgo para nuevos
--   entornos (staging, local, segundo tenant) que apliquen las migrations desde cero.
--
-- Esta migration normaliza el estado del repo: añade la columna IF NOT EXISTS.
-- Si ya existe (producción actual), no hace nada.
-- Si no existe (entorno nuevo), la crea con default 'active' y backfill.
--
-- Idempotente: IF NOT EXISTS.
-- =============================================================================

-- Agregar columna si no existe (prod: no-op; entorno nuevo: la crea)
alter table public.companies
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive', 'suspended'));

comment on column public.companies.status is
  'Estado del workspace. Solo workspaces active son procesados por los cron pipelines. '
  'Usar inactive para workspaces pausados, suspended para problemas de facturación.';

-- Backfill: las filas existentes sin valor explícito ya reciben 'active' por default.
-- Solo necesario si la columna se agregó ahora (en ese caso, la constraint ya garantiza
-- que los datos existentes son 'active' gracias al DEFAULT).

-- Índice para el filtro del cron (fetchActiveWorkspaceIdPage)
create index if not exists idx_companies_status
  on public.companies (status, id)
  where status = 'active';
