-- =============================================================================
-- RLS-FIX-A: Acotar policies SELECT TO authenticated USING (true) por workspace
-- =============================================================================
--
-- Origen: post-auditoría FASE 2 (Grupo A).
--
-- Problema:
--   5 tablas de telemetría Zeta exponen filas cross-tenant porque su policy
--   SELECT TO authenticated usa USING (true). Cualquier sesión con JWT
--   Supabase autenticado (anon key + JWT) ve datos de TODOS los workspaces.
--
-- Solución:
--   DROP la policy permisiva y CREATE una equivalente que filtra por
--   `workspace_company_id = public.copilot_current_workspace_company_id()`.
--   La función helper ya existe (`supabase/sec02-01-copilot-tenant-helper.sql`)
--   y está concedida a `authenticated`.
--
-- Tablas afectadas:
--   - zeta_completeness_audits   (workspace_company_id NOT NULL)
--   - zeta_sync_divergences      (workspace_company_id NOT NULL)
--   - zeta_integrity_violations  (workspace_company_id NOT NULL)
--   - zeta_resync_jobs           (workspace_company_id NOT NULL)
--   - zeta_pipeline_runs         (workspace_company_id NULLABLE — fleet runs)
--
-- Justificación zeta_pipeline_runs:
--   La columna se agregó en zeta-06-03 después de crear la tabla. Hoy los
--   crons de producción registran runs con `workspace_company_id IS NULL`
--   ("fleet" — orquestación global, ver zeta-06-03 comment). Por eso la
--   policy permite NULL (operación visible al equipo) OR el workspace del
--   usuario (si en el futuro se registran runs granulares por tenant).
--
-- Impacto en service_role:
--   Ninguno. `service_role.rolbypassrls = true` (confirmado por A) → bypassa
--   cualquier policy de RLS. Los crons y APIs server siguen leyendo todo.
--
-- Impacto en consumidores actuales (verificado vía grep + análisis):
--   - El browser client (`lib/supabase-client.ts`) NO consulta estas tablas
--     con `.from()`. Único uso en browser: trigger-only Realtime sobre
--     `zeta_pipeline_runs` (`lib/copilot-pipeline-health-realtime.ts:143`)
--     que ignora el payload y refetcha vía `/api/copilot/pipeline-health`
--     (API server con tenant auth).
--   - Realtime postgres_changes sobre `zeta_pipeline_runs` sigue funcionando
--     porque la nueva policy permite SELECT de runs fleet (NULL) — que son
--     los únicos en producción.
--
-- Reversibilidad:
--   Esta migración es idempotente (`DROP POLICY IF EXISTS` + `CREATE POLICY`).
--   Para revertir: ejecutar manualmente los `CREATE POLICY ... USING (true)`
--   originales (ver supabase/zeta-13-0X-*.sql y supabase/zeta-06-02-*.sql).
--
-- NO se modifican tablas, datos, funciones, crons, APIs ni UI.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A.1 — zeta_completeness_audits
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated_can_select_completeness_audits"
  ON public.zeta_completeness_audits;

CREATE POLICY "authenticated_can_select_completeness_audits"
  ON public.zeta_completeness_audits
  FOR SELECT
  TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());

-- ---------------------------------------------------------------------------
-- A.2 — zeta_sync_divergences
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated_can_select_sync_divergences"
  ON public.zeta_sync_divergences;

CREATE POLICY "authenticated_can_select_sync_divergences"
  ON public.zeta_sync_divergences
  FOR SELECT
  TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());

-- ---------------------------------------------------------------------------
-- A.3 — zeta_integrity_violations
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated_can_select_integrity_violations"
  ON public.zeta_integrity_violations;

CREATE POLICY "authenticated_can_select_integrity_violations"
  ON public.zeta_integrity_violations
  FOR SELECT
  TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());

-- ---------------------------------------------------------------------------
-- A.4 — zeta_resync_jobs
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated_can_select_resync_jobs"
  ON public.zeta_resync_jobs;

CREATE POLICY "authenticated_can_select_resync_jobs"
  ON public.zeta_resync_jobs
  FOR SELECT
  TO authenticated
  USING (workspace_company_id = public.copilot_current_workspace_company_id());

-- ---------------------------------------------------------------------------
-- A.5 — zeta_pipeline_runs (fleet runs visibles + workspace propio)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "zeta_pipeline_runs_authenticated_read"
  ON public.zeta_pipeline_runs;

CREATE POLICY "zeta_pipeline_runs_authenticated_read"
  ON public.zeta_pipeline_runs
  FOR SELECT
  TO authenticated
  USING (
    workspace_company_id IS NULL
    OR workspace_company_id = public.copilot_current_workspace_company_id()
  );
