-- BANK-RECONCILIATION-MATCHES-001 (FASE DOMAIN-IA-BANK-001)
-- Conciliación inteligente: match movimiento↔cliente↔recibo, aplicaciones a
-- facturas, y eventos de auditoría. ADITIVA. Sin DML/backfill. NO APLICAR.
--
-- Complementa (no reemplaza) `bank_movement_reconciliation_links` (FASE E, N:M
-- manual): estas tablas guardan además la IDENTIDAD del pagador, la CONFIANZA,
-- las RAZONES estructuradas del motor y la trazabilidad de eventos. Workspace-scoped.

CREATE TABLE IF NOT EXISTS public.bank_reconciliation_matches (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bank_movement_id    UUID          NOT NULL REFERENCES public.bank_movements(id) ON DELETE CASCADE,
  client_company_id   UUID          NULL REFERENCES public.proto_companies(id) ON DELETE SET NULL,
  payer_identity_id   UUID          NULL REFERENCES public.bank_payer_identities(id) ON DELETE SET NULL,
  receipt_id          UUID          NULL REFERENCES public.proto_receipts(id) ON DELETE SET NULL,
  assigned_amount     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (assigned_amount >= 0),
  currency            TEXT          NOT NULL CHECK (currency IN ('UYU','USD')),
  status              TEXT          NOT NULL DEFAULT 'unanalyzed'
    CHECK (status IN ('unanalyzed','unidentified','suggested','pending_confirmation',
                      'auto_reconciled','manually_reconciled','partially_reconciled',
                      'difference_detected','duplicate','ignored','reversed')),
  confidence          INTEGER       NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  method              TEXT          NOT NULL DEFAULT 'engine'
    CHECK (method IN ('engine','manual','suggested_confirmed')),
  reasons             JSONB         NOT NULL DEFAULT '[]'::jsonb,
  warnings            JSONB         NOT NULL DEFAULT '[]'::jsonb,
  engine_version      INTEGER       NOT NULL DEFAULT 1,
  confirmed_by        UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  confirmed_at        TIMESTAMPTZ   NULL,
  reversed_at         TIMESTAMPTZ   NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bank_reconciliation_matches IS
  'Conciliación inteligente por movimiento: cliente/pagador/recibo, confianza, razones y estado. Modo shadow por defecto (suggested). FASE DOMAIN-IA-BANK-001.';

CREATE INDEX IF NOT EXISTS brm_ws_movement_idx ON public.bank_reconciliation_matches (workspace_id, bank_movement_id);
CREATE INDEX IF NOT EXISTS brm_ws_status_idx   ON public.bank_reconciliation_matches (workspace_id, status);
CREATE INDEX IF NOT EXISTS brm_ws_client_idx   ON public.bank_reconciliation_matches (workspace_id, client_company_id);

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  reconciliation_match_id  UUID          NOT NULL REFERENCES public.bank_reconciliation_matches(id) ON DELETE CASCADE,
  bank_movement_id         UUID          NOT NULL REFERENCES public.bank_movements(id) ON DELETE CASCADE,
  receipt_id               UUID          NULL REFERENCES public.proto_receipts(id) ON DELETE SET NULL,
  invoice_id               UUID          NULL REFERENCES public.proto_invoices(id) ON DELETE SET NULL,
  applied_amount           NUMERIC(14,2) NOT NULL CHECK (applied_amount > 0),
  currency                 TEXT          NOT NULL CHECK (currency IN ('UYU','USD')),
  status                   TEXT          NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','reversed')),
  source                   TEXT          NOT NULL DEFAULT 'engine'
    CHECK (source IN ('engine','manual')),
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_allocations IS
  'Aplicación de un pago a una factura (parcial/múltiple). Σ aplicado ≤ importe del movimiento y ≤ saldo de la factura y ≤ importe del recibo (validado en app). FASE DOMAIN-IA-BANK-001.';

CREATE INDEX IF NOT EXISTS pa_ws_match_idx   ON public.payment_allocations (workspace_id, reconciliation_match_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS pa_ws_invoice_idx ON public.payment_allocations (workspace_id, invoice_id) WHERE status='active';

CREATE TABLE IF NOT EXISTS public.reconciliation_events (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  event_type     TEXT          NOT NULL
    CHECK (event_type IN ('movement_imported','duplicate_detected','suggestion_created',
                          'suggestion_changed','reconciliation_confirmed','reconciliation_rejected',
                          'allocation_created','allocation_changed','reconciliation_reversed',
                          'payer_link_confirmed','payer_link_rejected','payer_link_conflicted')),
  entity_type    TEXT          NOT NULL,
  entity_id      UUID          NULL,
  previous_state TEXT          NULL,
  new_state      TEXT          NULL,
  reason         TEXT          NULL,
  actor_user_id  UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  metadata       JSONB         NOT NULL DEFAULT '{}'::jsonb,  -- nunca secretos ni cuenta completa
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reconciliation_events IS
  'Trazabilidad de decisiones de conciliación (append-only). No almacena secretos ni cuentas completas. FASE DOMAIN-IA-BANK-001.';

CREATE INDEX IF NOT EXISTS re_ws_created_idx ON public.reconciliation_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS re_ws_entity_idx  ON public.reconciliation_events (workspace_id, entity_type, entity_id);

-- Triggers estándar.
DROP TRIGGER IF EXISTS trg_brm_updated_at ON public.bank_reconciliation_matches;
CREATE TRIGGER trg_brm_updated_at BEFORE UPDATE ON public.bank_reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();
DROP TRIGGER IF EXISTS trg_brm_force_ws ON public.bank_reconciliation_matches;
CREATE TRIGGER trg_brm_force_ws BEFORE INSERT OR UPDATE ON public.bank_reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();
DROP TRIGGER IF EXISTS trg_pa_updated_at ON public.payment_allocations;
CREATE TRIGGER trg_pa_updated_at BEFORE UPDATE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();
DROP TRIGGER IF EXISTS trg_pa_force_ws ON public.payment_allocations;
CREATE TRIGGER trg_pa_force_ws BEFORE INSERT OR UPDATE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();
DROP TRIGGER IF EXISTS trg_re_force_ws ON public.reconciliation_events;
CREATE TRIGGER trg_re_force_ws BEFORE INSERT ON public.reconciliation_events
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

-- RLS por workspace. Sin anon/public.
ALTER TABLE public.bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_events       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_reconciliation_matches','payment_allocations','reconciliation_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (workspace_id = public.copilot_current_workspace_company_id())', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (workspace_id = public.copilot_current_workspace_company_id())', t||'_insert', t);
  END LOOP;
  -- UPDATE/DELETE solo para matches y allocations (events son append-only).
  FOREACH t IN ARRAY ARRAY['bank_reconciliation_matches','payment_allocations'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (workspace_id = public.copilot_current_workspace_company_id()) WITH CHECK (workspace_id = public.copilot_current_workspace_company_id())', t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (workspace_id = public.copilot_current_workspace_company_id())', t||'_delete', t);
  END LOOP;
END $$;

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP TABLE IF EXISTS public.reconciliation_events;
--   DROP TABLE IF EXISTS public.payment_allocations;
--   DROP TABLE IF EXISTS public.bank_reconciliation_matches;
