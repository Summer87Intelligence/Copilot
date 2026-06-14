-- =============================================================================
-- ZETA-16 — Crear tabla `zeta_daily_snapshots` con RLS hardening compatible
-- =============================================================================
--
-- Origen: DRIFT-001 FASE 4 (2026-06-14).
--
-- Contexto:
--   `supabase/zeta-16-02-daily-snapshots.sql` quedó como migration orphan
--   (archivo fuera de `supabase/migrations/`). El cron `zeta-daily-snapshot`
--   ha estado fallando silenciosamente desde 2026-05-17 (28 corridas
--   registradas, todas con upsert que erroreaba con "relation does not
--   exist" y el repositorio silenciaba el error). Esta migración crea la
--   tabla de forma correcta y compatible con el hardening RLS aplicado en
--   las migraciones 20260613120000–20260613120200.
--
-- Cambios vs `supabase/zeta-16-02-daily-snapshots.sql`:
--   - Schema explícito `public.` en todas las referencias.
--   - Policy reemplazada: el original definía
--       CREATE POLICY "service_role_full" FOR ALL USING (true)
--     sin cláusula TO → aplica a PUBLIC y reintroduciría el leak
--     cross-tenant que cerramos en RLS-FIX-B/C. Se sustituye por
--     `tenant_read` (SELECT TO authenticated, scoped a workspace),
--     siguiendo el patrón de RLS-FIX-C aplicado a `zeta_sync_metrics_history`.
--   - service_role escribe vía bypass de RLS (rolbypassrls=true) — el cron
--     opera idéntico al resto del paquete sin necesidad de policy de mutación.
--
-- Idempotencia:
--   - `CREATE TABLE IF NOT EXISTS`
--   - `CREATE INDEX IF NOT EXISTS`
--   - `ENABLE ROW LEVEL SECURITY` (no-op si ya está habilitado)
--   - `DROP POLICY IF EXISTS` + `CREATE POLICY`
--
-- Backfill:
--   NO se sintetizan snapshots históricos. Los contadores diarios
--   (`sync_runs_today`, `sync_errors_today`, `resync_jobs_completed`, etc.)
--   no son reconstruibles a posteriori sin riesgo de datos engañosos. El
--   cron empezará a persistir 1 fila por workspace activo en la siguiente
--   corrida (02:00 UTC). Análisis comparativos D vs D-1 (check D
--   `orphan_close_spike` de `zeta-financial-health`) se rehabilitan a partir
--   del día 2 después de aplicar.
--
-- Impacto operativo:
--   - Próxima corrida del cron pasará de write silently-failing a write OK.
--   - Métrica engañosa de "succeeded" en `zeta_pipeline_runs` desaparece
--     (rows_processed seguirá siendo el contador de workspaces, pero
--     ahora corresponderá a filas realmente persistidas).
--   - `zeta-financial-health` saldrá de `partial` cuando exista al menos
--     un snapshot del día anterior.
--   - Browser: cero impacto (sin código browser que consuma esta tabla).
--
-- Reversibilidad:
--   DROP TABLE public.zeta_daily_snapshots CASCADE;
--   (vuelve al estado de silent-failure preexistente).
--
-- NO se modifican otros objetos, datos, funciones, crons, APIs ni UI.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.zeta_daily_snapshots (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id       uuid        NOT NULL,
  snapshot_date              date        NOT NULL,

  -- Entity counts at snapshot time
  invoices_count             integer,
  receipts_count             integer,
  contacts_count             integer,
  cuotas_count               integer,
  open_invoices_count        integer,
  total_balance_pending      numeric,

  -- Operational metrics for the day
  sync_runs_today            integer     NOT NULL DEFAULT 0,
  sync_errors_today          integer     NOT NULL DEFAULT 0,
  integrity_violations_open  integer     NOT NULL DEFAULT 0,
  critical_violations_open   integer     NOT NULL DEFAULT 0,
  resync_jobs_completed      integer     NOT NULL DEFAULT 0,
  resync_jobs_failed         integer     NOT NULL DEFAULT 0,
  dead_letter_jobs           integer     NOT NULL DEFAULT 0,

  metadata                   jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT zeta_daily_snapshots_ws_date_unique
    UNIQUE (workspace_company_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_zeta_daily_snapshots_workspace_date
  ON public.zeta_daily_snapshots (workspace_company_id, snapshot_date DESC);

ALTER TABLE public.zeta_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policy alineada al patrón post-RLS hardening (RLS-FIX-C / zeta_sync_metrics_history)
--
--   workspace_company_id es NOT NULL → policy estricta sin rama IS NULL.
--   Service role bypassa RLS (rolbypassrls=true) y sigue escribiendo
--   via el cron sin necesidad de policy de mutación adicional.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "tenant_read" ON public.zeta_daily_snapshots;

CREATE POLICY "tenant_read"
  ON public.zeta_daily_snapshots
  FOR SELECT
  TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());
