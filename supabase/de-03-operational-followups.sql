-- =============================================================================
-- DE-03: Operational Follow-ups + Operational State
-- decision_follow_ups         — cola de seguimientos programados
-- decision_operational_state  — estado operativo por cliente (1 fila/cliente)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. decision_follow_ups
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.decision_follow_ups (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id           UUID        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','in_progress','completed','snoozed','cancelled')),
  scheduled_for         TIMESTAMPTZ NOT NULL,
  completed_at          TIMESTAMPTZ,
  reason                TEXT,
  source_action_id      UUID,
  priority              TEXT        NOT NULL DEFAULT 'medium'
                                    CHECK (priority IN ('low','medium','high','critical')),
  metadata              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.decision_follow_ups IS
  'Cola de seguimientos programados por cliente. '
  'Generados por el follow-up engine o manualmente. '
  'Permite cola de trabajo diaria del equipo de cobranza.';

CREATE INDEX IF NOT EXISTS idx_dfu_workspace_scheduled
  ON public.decision_follow_ups (workspace_company_id, scheduled_for ASC);

CREATE INDEX IF NOT EXISTS idx_dfu_workspace_customer
  ON public.decision_follow_ups (workspace_company_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_dfu_workspace_status
  ON public.decision_follow_ups (workspace_company_id, status);

ALTER TABLE public.decision_follow_ups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_follow_ups' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.decision_follow_ups FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_follow_ups' AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.decision_follow_ups
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. decision_operational_state
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.decision_operational_state (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id           UUID        NOT NULL,
  current_risk          TEXT        NOT NULL DEFAULT 'low'
                                    CHECK (current_risk IN ('low','medium','high','critical')),
  current_priority      TEXT        NOT NULL DEFAULT 'medium'
                                    CHECK (current_priority IN ('low','medium','high','critical')),
  operational_state     TEXT        NOT NULL DEFAULT 'monitor',
  next_follow_up_at     TIMESTAMPTZ,
  last_contact_at       TIMESTAMPTZ,
  active_promise        BOOLEAN     NOT NULL DEFAULT false,
  escalated             BOOLEAN     NOT NULL DEFAULT false,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT decision_operational_state_ws_customer_unique
    UNIQUE (workspace_company_id, customer_id)
);

COMMENT ON TABLE public.decision_operational_state IS
  'Estado operativo actual por cliente — 1 fila por (workspace, cliente). '
  'Actualizado en cada acción registrada para re-score inmediato. '
  'Permite queries de cola operativa sin recalcular el briefing completo.';

CREATE INDEX IF NOT EXISTS idx_dos_workspace_risk
  ON public.decision_operational_state (workspace_company_id, current_risk);

CREATE INDEX IF NOT EXISTS idx_dos_workspace_state
  ON public.decision_operational_state (workspace_company_id, operational_state);

CREATE INDEX IF NOT EXISTS idx_dos_workspace_follow_up
  ON public.decision_operational_state (workspace_company_id, next_follow_up_at ASC)
  WHERE next_follow_up_at IS NOT NULL;

ALTER TABLE public.decision_operational_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_operational_state' AND policyname = 'service_role_full'
  ) THEN
    CREATE POLICY "service_role_full" ON public.decision_operational_state FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_operational_state' AND policyname = 'tenant_access'
  ) THEN
    CREATE POLICY "tenant_access" ON public.decision_operational_state
      FOR ALL TO authenticated
      USING  (workspace_company_id = public.copilot_current_workspace_company_id())
      WITH CHECK (workspace_company_id = public.copilot_current_workspace_company_id());
  END IF;
END $$;
