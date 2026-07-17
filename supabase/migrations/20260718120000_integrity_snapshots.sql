-- INTEGRITY-SNAPSHOTS-001 (FASE F)
-- Persistencia OPCIONAL del reporte del Centro de Integridad para historial y
-- observabilidad (tendencia de críticos/advertencias en el tiempo).
--
-- ADITIVA y NO DESTRUCTIVA. No borra ni migra datos. Sin DML, sin backfill.
-- El motor de integridad funciona SIN esta tabla (se calcula on-demand); esta
-- tabla solo guarda snapshots cuando se decida persistirlos.
--
-- Scope por workspace_id (companies.id) con el mismo patrón que el resto de
-- superficies: RLS + copilot_current_workspace_company_id() + force_workspace.

CREATE TABLE IF NOT EXISTS public.copilot_integrity_snapshots (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  -- Estado global calculado.
  status         TEXT          NOT NULL
    CHECK (status IN ('healthy','info','warning','critical')),
  critical_count INTEGER       NOT NULL DEFAULT 0 CHECK (critical_count >= 0),
  warning_count  INTEGER       NOT NULL DEFAULT 0 CHECK (warning_count  >= 0),
  info_count     INTEGER       NOT NULL DEFAULT 0 CHECK (info_count     >= 0),
  -- Cobertura de reglas evaluadas / no disponibles.
  rules_evaluated INTEGER      NOT NULL DEFAULT 0 CHECK (rules_evaluated >= 0),
  rules_skipped   INTEGER      NOT NULL DEFAULT 0 CHECK (rules_skipped   >= 0),
  -- Reporte completo (findings + observabilidad) serializado. Nunca datos sensibles.
  report         JSONB         NOT NULL DEFAULT '{}'::jsonb,
  -- Cómo se disparó el snapshot.
  triggered_by   TEXT          NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual','cron','api')),
  created_by     UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.copilot_integrity_snapshots IS
  'Snapshots históricos del Centro de Integridad (estado + conteos + reporte). Aditiva y opcional; el motor calcula on-demand sin depender de esta tabla. FASE F.';

CREATE INDEX IF NOT EXISTS copilot_integrity_snapshots_ws_created_idx
  ON public.copilot_integrity_snapshots (workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_integrity_snapshots_updated_at ON public.copilot_integrity_snapshots;
CREATE TRIGGER trg_integrity_snapshots_updated_at
  BEFORE UPDATE ON public.copilot_integrity_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_integrity_snapshots_force_workspace ON public.copilot_integrity_snapshots;
CREATE TRIGGER trg_integrity_snapshots_force_workspace
  BEFORE INSERT OR UPDATE ON public.copilot_integrity_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.copilot_integrity_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "copilot_integrity_snapshots_select" ON public.copilot_integrity_snapshots;
CREATE POLICY "copilot_integrity_snapshots_select" ON public.copilot_integrity_snapshots
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "copilot_integrity_snapshots_insert" ON public.copilot_integrity_snapshots;
CREATE POLICY "copilot_integrity_snapshots_insert" ON public.copilot_integrity_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "copilot_integrity_snapshots_update" ON public.copilot_integrity_snapshots;
CREATE POLICY "copilot_integrity_snapshots_update" ON public.copilot_integrity_snapshots
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "copilot_integrity_snapshots_delete" ON public.copilot_integrity_snapshots;
CREATE POLICY "copilot_integrity_snapshots_delete" ON public.copilot_integrity_snapshots
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP TABLE IF EXISTS public.copilot_integrity_snapshots;
-- Aditiva: revertir no afecta el cálculo on-demand del Centro de Integridad.
