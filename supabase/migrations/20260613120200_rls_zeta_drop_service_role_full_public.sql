-- =============================================================================
-- RLS-FIX-C: Eliminar "service_role_full" en zeta_* + agregar tenant_read
-- =============================================================================
--
-- Origen: post-auditoría FASE 2 (Grupo C).
--
-- Problema:
--   5 tablas `zeta_*` tienen únicamente:
--     "service_role_full"  FOR ALL USING (true)             -- sin TO → PUBLIC
--   y NINGUNA otra policy. Sin TO clause aplica a PUBLIC (todos los roles):
--   authenticated y anon ven (y pueden mutar) filas de TODOS los workspaces.
--   Peor que Grupo B porque no existe siquiera un "tenant_access" residual
--   que filtre.
--
-- Decisión aprobada:
--   - DROP de la policy permisiva (idéntica razón a Grupo B —
--     service_role.rolbypassrls = true).
--   - CREATE una nueva policy SELECT-only "tenant_read" para `authenticated`,
--     scoped al workspace. Las mutaciones siguen siendo exclusivas de
--     service_role (bypass RLS) — los crons son los únicos escritores.
--
-- Tablas afectadas (5):
--   - public.zeta_sync_metrics            (workspace_company_id NULLABLE)
--   - public.zeta_acknowledged_drifts     (workspace_company_id NOT NULL)
--   - public.zeta_daily_snapshots         (workspace_company_id NOT NULL)
--   - public.zeta_contract_snapshots      (workspace_company_id NULLABLE)
--   - public.zeta_sync_metrics_history    (workspace_company_id NOT NULL)
--
-- Diseño de policy por tabla:
--   - NOT NULL → USING (workspace_company_id = current_workspace())
--   - NULLABLE → USING (workspace_company_id IS NULL
--                       OR workspace_company_id = current_workspace())
--   La rama NULL es para métricas/snapshots globales no atribuibles a un
--   workspace (mismo patrón que zeta_pipeline_runs fleet).
--
-- Impacto en service_role:
--   Ninguno. Bypassa RLS por atributo de rol.
--   Crons (`/api/cron/zeta-daily-snapshot`, `lib/observability/zeta-sync-metrics.ts`)
--   siguen insertando/leyendo idénticos.
--
-- Impacto en authenticated:
--   Hoy no hay consumo browser de estas tablas (verificado pre-flight E).
--   Las nuevas policies habilitan SELECT scoped al workspace para futuro
--   uso UI sin reintroducir el leak.
--
-- Reversibilidad:
--   Idempotente. Para revertir totalmente:
--     1. DROP POLICY IF EXISTS "tenant_read" ON <tabla>;
--     2. CREATE POLICY "service_role_full" ON <tabla> FOR ALL USING (true);
--   (NO recomendado.)
--
-- NO se modifican tablas, datos, funciones, crons, APIs ni UI.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- C.1 — zeta_sync_metrics (workspace_company_id NULLABLE)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "service_role_full" ON public.zeta_sync_metrics;

DROP POLICY IF EXISTS "tenant_read" ON public.zeta_sync_metrics;

CREATE POLICY "tenant_read"
  ON public.zeta_sync_metrics
  FOR SELECT
  TO authenticated
  USING (
    workspace_company_id IS NULL
    OR workspace_company_id = public.copilot_current_workspace_company_id()
  );

-- ---------------------------------------------------------------------------
-- C.2 — zeta_acknowledged_drifts (workspace_company_id NOT NULL)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "service_role_full" ON public.zeta_acknowledged_drifts;

DROP POLICY IF EXISTS "tenant_read" ON public.zeta_acknowledged_drifts;

CREATE POLICY "tenant_read"
  ON public.zeta_acknowledged_drifts
  FOR SELECT
  TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());

-- ---------------------------------------------------------------------------
-- C.3 — zeta_daily_snapshots (workspace_company_id NOT NULL)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "service_role_full" ON public.zeta_daily_snapshots;

DROP POLICY IF EXISTS "tenant_read" ON public.zeta_daily_snapshots;

CREATE POLICY "tenant_read"
  ON public.zeta_daily_snapshots
  FOR SELECT
  TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());

-- ---------------------------------------------------------------------------
-- C.4 — zeta_contract_snapshots (workspace_company_id NULLABLE)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "service_role_full" ON public.zeta_contract_snapshots;

DROP POLICY IF EXISTS "tenant_read" ON public.zeta_contract_snapshots;

CREATE POLICY "tenant_read"
  ON public.zeta_contract_snapshots
  FOR SELECT
  TO authenticated
  USING (
    workspace_company_id IS NULL
    OR workspace_company_id = public.copilot_current_workspace_company_id()
  );

-- ---------------------------------------------------------------------------
-- C.5 — zeta_sync_metrics_history (workspace_company_id NOT NULL)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "service_role_full" ON public.zeta_sync_metrics_history;

DROP POLICY IF EXISTS "tenant_read" ON public.zeta_sync_metrics_history;

CREATE POLICY "tenant_read"
  ON public.zeta_sync_metrics_history
  FOR SELECT
  TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());
