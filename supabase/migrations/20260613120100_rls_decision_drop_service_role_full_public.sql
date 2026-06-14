-- =============================================================================
-- RLS-FIX-B: Eliminar policies "service_role_full" sin TO clause en decision_*
-- =============================================================================
--
-- Origen: post-auditoría FASE 2 (Grupo B).
--
-- Problema:
--   14 tablas `decision_*` tienen dos policies declaradas:
--     1) "service_role_full"  FOR ALL USING (true)             -- sin TO → PUBLIC
--     2) "tenant_access"      FOR ALL TO authenticated
--                             USING  (workspace_company_id = current_workspace())
--                             WITH CHECK (...)
--
--   PostgreSQL combina policies del mismo COMMAND con OR (lógica permisiva).
--   Como (1) aplica a PUBLIC (incluye authenticated y anon) y siempre
--   matchea (USING true), la (2) queda inerte: cualquier role autenticado
--   ve filas de TODOS los workspaces. El nombre "service_role_full" es
--   engañoso — sin cláusula `TO`, NO está restringido a service_role.
--
-- Decisión aprobada:
--   DROP de la policy permisiva. NO recrear con `TO service_role` porque
--   `service_role.rolbypassrls = true` (confirmado por pre-flight A): el
--   role bypassea RLS independiente de cualquier policy. Una policy
--   "TO service_role USING (true)" es semánticamente redundante y un nombre
--   engañoso es deuda futura. Limpio > redundante.
--
-- Tras esta migración, en cada tabla queda únicamente la policy
-- "tenant_access" (FOR ALL TO authenticated, filtrada por workspace).
-- Service role sigue leyendo/escribiendo todo por bypass.
--
-- Tablas afectadas (14):
--   - public.decision_snapshots
--   - public.portfolio_score_history
--   - public.collection_action_timeline
--   - public.decision_follow_ups
--   - public.decision_operational_state
--   - public.decision_daily_queue_snapshots
--   - public.decision_operational_analytics_snapshots
--   - public.decision_automation_runs
--   - public.decision_automation_actions
--   - public.decision_ai_briefings
--   - public.decision_predictive_snapshots
--   - public.decision_executive_briefings
--   - public.decision_learning_outcomes
--   - public.decision_learning_snapshots
--
-- Impacto en service_role:
--   Ninguno. `service_role.rolbypassrls = true` → bypassa policies.
--   Todos los repos `lib/data/decision-*-repository.ts` se ejecutan via
--   service role server-side. Siguen funcionando idénticos.
--
-- Impacto en authenticated:
--   La policy "tenant_access" pasa a ser el único gate. Filtra por
--   `workspace_company_id = public.copilot_current_workspace_company_id()`.
--   Hoy 0 código de browser hace `.from()` sobre estas tablas (verificado
--   en pre-flight E), así que el cambio no afecta consumo actual.
--
-- Reversibilidad:
--   Idempotente. Para revertir: recrear las policies originales
--     CREATE POLICY "service_role_full" ON <tabla> FOR ALL USING (true);
--   (NO recomendado — reintroduce el leak).
--
-- NO se modifican tablas, datos, funciones, crons, APIs ni UI.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- decision_snapshots (de-01)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_snapshots;

-- ---------------------------------------------------------------------------
-- portfolio_score_history (de-01)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.portfolio_score_history;

-- ---------------------------------------------------------------------------
-- collection_action_timeline (de-02)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.collection_action_timeline;

-- ---------------------------------------------------------------------------
-- decision_follow_ups (de-03)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_follow_ups;

-- ---------------------------------------------------------------------------
-- decision_operational_state (de-03)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_operational_state;

-- ---------------------------------------------------------------------------
-- decision_daily_queue_snapshots (de-05)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_daily_queue_snapshots;

-- ---------------------------------------------------------------------------
-- decision_operational_analytics_snapshots (de-07)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_operational_analytics_snapshots;

-- ---------------------------------------------------------------------------
-- decision_automation_runs (de-08)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_automation_runs;

-- ---------------------------------------------------------------------------
-- decision_automation_actions (de-08)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_automation_actions;

-- ---------------------------------------------------------------------------
-- decision_ai_briefings (de-09)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_ai_briefings;

-- ---------------------------------------------------------------------------
-- decision_predictive_snapshots (de-10)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_predictive_snapshots;

-- ---------------------------------------------------------------------------
-- decision_executive_briefings (de-11)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_executive_briefings;

-- ---------------------------------------------------------------------------
-- decision_learning_outcomes (de-12)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_learning_outcomes;

-- ---------------------------------------------------------------------------
-- decision_learning_snapshots (de-12)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_full" ON public.decision_learning_snapshots;
