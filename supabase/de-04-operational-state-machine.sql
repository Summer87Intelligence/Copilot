-- =============================================================================
-- DE-04: Operational State Machine (Phase 2A)
-- Extiende decision_operational_state con metadata de transiciones + SLA.
-- Migra valores legacy Phase 1C → estados formales Phase 2A.
-- =============================================================================

ALTER TABLE public.decision_operational_state
  ADD COLUMN IF NOT EXISTS previous_state   TEXT,
  ADD COLUMN IF NOT EXISTS transitioned_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transition_reason TEXT,
  ADD COLUMN IF NOT EXISTS breached_sla     BOOLEAN NOT NULL DEFAULT false;

-- Migrar valores legacy → estados formales
UPDATE public.decision_operational_state
SET operational_state = CASE operational_state
  WHEN 'monitor'             THEN 'monitoring'
  WHEN 'awaiting_promise'    THEN 'payment_promised'
  WHEN 'retry_call'          THEN 'follow_up'
  WHEN 'retry_email'         THEN 'follow_up'
  WHEN 'payment_cleared'     THEN 'recovered'
  WHEN 'escalated_active'    THEN 'escalated'
  WHEN 'overdue_no_contact'  THEN 'critical'
  ELSE operational_state
END
WHERE operational_state IN (
  'monitor', 'awaiting_promise', 'retry_call', 'retry_email',
  'payment_cleared', 'escalated_active', 'overdue_no_contact'
);

-- Default para filas sin estado reconocido
UPDATE public.decision_operational_state
SET operational_state = 'monitoring'
WHERE operational_state NOT IN (
  'new_risk', 'monitoring', 'follow_up', 'payment_promised',
  'escalated', 'critical', 'recovered', 'paused', 'legal_review'
);

-- Backfill transitioned_at desde updated_at
UPDATE public.decision_operational_state
SET transitioned_at = updated_at
WHERE transitioned_at IS NULL;

ALTER TABLE public.decision_operational_state
  ALTER COLUMN operational_state SET DEFAULT 'monitoring';

ALTER TABLE public.decision_operational_state
  DROP CONSTRAINT IF EXISTS decision_operational_state_operational_state_check;

ALTER TABLE public.decision_operational_state
  ADD CONSTRAINT decision_operational_state_operational_state_check
  CHECK (operational_state IN (
    'new_risk', 'monitoring', 'follow_up', 'payment_promised',
    'escalated', 'critical', 'recovered', 'paused', 'legal_review'
  ));

CREATE INDEX IF NOT EXISTS idx_dos_workspace_machine_state
  ON public.decision_operational_state (workspace_company_id, operational_state);

CREATE INDEX IF NOT EXISTS idx_dos_workspace_sla_breach
  ON public.decision_operational_state (workspace_company_id, breached_sla)
  WHERE breached_sla = true;

COMMENT ON COLUMN public.decision_operational_state.previous_state IS
  'Estado operativo formal inmediatamente anterior (Phase 2A).';
COMMENT ON COLUMN public.decision_operational_state.transitioned_at IS
  'Timestamp de entrada al estado actual.';
COMMENT ON COLUMN public.decision_operational_state.transition_reason IS
  'Motivo de la última transición (motor determinístico).';
COMMENT ON COLUMN public.decision_operational_state.breached_sla IS
  'True si el cliente excedió SLA del estado actual.';
