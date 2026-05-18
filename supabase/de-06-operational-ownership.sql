-- =============================================================================
-- DE-06: Operational Ownership (Phase 4A)
-- Responsable operacional por cliente en decision_operational_state.
-- =============================================================================

ALTER TABLE public.decision_operational_state
  ADD COLUMN IF NOT EXISTS assigned_user_id  UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by       UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_note   TEXT;

CREATE INDEX IF NOT EXISTS idx_dos_workspace_assigned_user
  ON public.decision_operational_state (workspace_company_id, assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dos_assigned_user_id
  ON public.decision_operational_state (assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

-- machine_state + breached_sla indexes (idempotent with de-04)
CREATE INDEX IF NOT EXISTS idx_dos_workspace_machine_state_v2
  ON public.decision_operational_state (workspace_company_id, operational_state);

CREATE INDEX IF NOT EXISTS idx_dos_workspace_breached_sla_v2
  ON public.decision_operational_state (workspace_company_id, breached_sla)
  WHERE breached_sla = true;

COMMENT ON COLUMN public.decision_operational_state.assigned_user_id IS
  'Operador responsable (app_users.id) del seguimiento operacional del cliente.';
COMMENT ON COLUMN public.decision_operational_state.assigned_at IS
  'Timestamp de asignación del responsable actual.';
COMMENT ON COLUMN public.decision_operational_state.assigned_by IS
  'Usuario que realizó la asignación (app_users.id).';
COMMENT ON COLUMN public.decision_operational_state.assignment_note IS
  'Nota opcional al asignar o reasignar.';
