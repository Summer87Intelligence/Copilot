-- ZETA-06-03: scope de orchestración + heartbeat para anti-overlap y recuperación.
-- - workspace_company_id NULL = corrida "fleet" (cron multi-workspace actual).
-- - last_heartbeat_at: pulsos durante corridas largas; expiración vía código (expireStaleFleetPipelineRuns).

ALTER TABLE public.zeta_pipeline_runs
  ADD COLUMN IF NOT EXISTS workspace_company_id uuid
    REFERENCES public.companies (id) ON DELETE SET NULL;

ALTER TABLE public.zeta_pipeline_runs
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

COMMENT ON COLUMN public.zeta_pipeline_runs.workspace_company_id IS
  'NULL = run de orchestración global (cron que itera workspaces). UUID = scope por workspace (futuro / overlap granular).';

COMMENT ON COLUMN public.zeta_pipeline_runs.last_heartbeat_at IS
  'Último pulso de la corrida; usado para detectar runs colgados (stale) sin romper corridas legítimas.';

CREATE INDEX IF NOT EXISTS idx_zeta_pipeline_runs_fleet_running
  ON public.zeta_pipeline_runs (pipeline_name, started_at DESC)
  WHERE status = 'running' AND workspace_company_id IS NULL;
