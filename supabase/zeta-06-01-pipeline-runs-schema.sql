-- ============================================================
-- ZETA-06: Pipeline Run Registry
-- Tabla global para trazabilidad de cron orchestration.
-- Una fila por invocación de cron (nivel pipeline, no per-client).
-- Sin RLS: acceso exclusivo via service_role desde crons.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.zeta_pipeline_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_name   text        NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  duration_ms     integer,
  status          text        NOT NULL DEFAULT 'running',
  rows_processed  integer     NOT NULL DEFAULT 0,
  rows_updated    integer     NOT NULL DEFAULT 0,
  rows_failed     integer     NOT NULL DEFAULT 0,
  error_summary   text,
  metadata        jsonb,

  CONSTRAINT zeta_pipeline_runs_status_chk CHECK (
    status IN ('running', 'succeeded', 'failed', 'skipped', 'partial')
  ),
  CONSTRAINT zeta_pipeline_runs_name_chk CHECK (
    length(trim(pipeline_name)) > 0
  )
);

-- Índice principal: historial por pipeline
CREATE INDEX IF NOT EXISTS idx_zeta_pipeline_runs_name_started
  ON public.zeta_pipeline_runs (pipeline_name, started_at DESC);

-- Índice parcial: búsqueda rápida de runs activos (anti-overlap)
CREATE INDEX IF NOT EXISTS idx_zeta_pipeline_runs_running
  ON public.zeta_pipeline_runs (pipeline_name, started_at DESC)
  WHERE status = 'running';

COMMENT ON TABLE public.zeta_pipeline_runs IS
  'ZETA-06: Ejecuciones de cron pipelines Zeta (nivel orchestración). '
  'Una fila por invocación de cron. '
  'pipeline_name ∈ {zeta-sync-saldos, zeta-sync-vouchers, zeta-sync-contacts}';

COMMENT ON COLUMN public.zeta_pipeline_runs.pipeline_name IS
  'Identificador canónico: zeta-sync-saldos | zeta-sync-vouchers | zeta-sync-contacts';
COMMENT ON COLUMN public.zeta_pipeline_runs.metadata IS
  'Contexto de ejecución: workspaces procesados, meses, counts por tenant. Sin credenciales.';
COMMENT ON COLUMN public.zeta_pipeline_runs.rows_processed IS
  'Total de filas/registros procesados en la corrida (suma de todos los workspaces).';
COMMENT ON COLUMN public.zeta_pipeline_runs.rows_updated IS
  'Total de filas persistidas (insert + update) exitosamente.';
COMMENT ON COLUMN public.zeta_pipeline_runs.rows_failed IS
  'Total de filas que fallaron durante la corrida.';

-- Acceso exclusivo via service_role (cron)
GRANT SELECT, INSERT, UPDATE ON public.zeta_pipeline_runs TO service_role;
