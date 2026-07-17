-- BANK-RECONCILIATION-SUGGESTIONS-001 (FASE BANK-SCHEMA-CORRECTION-001)
--
-- CORRECCIÓN DE ESQUEMA: una sola fuente canónica por hecho.
--
--   Hecho FINANCIERO ("este movimiento quedó aplicado a este recibo por $X"):
--     → CANÓNICA = `bank_movement_reconciliation_links` (FASE E). NO se duplica.
--
--   Hecho de INTELIGENCIA ("el motor PROPONE cliente/recibo con confianza y razones"):
--     → `bank_reconciliation_suggestions` (esta tabla). Solo propuesta; NUNCA es la
--       fuente financiera. Una sugerencia confirmada NO se vuelve el vínculo: crea/
--       reutiliza el link canónico vía RPC transaccional (ver 20260719120200).
--
--   Aplicación a facturas: `payment_allocations` referencia el LINK CANÓNICO (no la
--   sugerencia). Trazabilidad: `reconciliation_events` (append-only).
--
-- ADITIVA. Sin DML/backfill. NO APLICAR sin autorización. Workspace-scoped, RLS,
-- sin anon/public. Compatible con cliente service_role (trigger force_workspace).

-- ── Sugerencias del motor (SHADOW / proposal-only) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_suggestions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bank_movement_id    UUID          NOT NULL REFERENCES public.bank_movements(id) ON DELETE CASCADE,
  payer_identity_id   UUID          NULL REFERENCES public.bank_payer_identities(id) ON DELETE SET NULL,
  proposed_client_id  UUID          NULL REFERENCES public.proto_companies(id) ON DELETE SET NULL,
  proposed_receipt_id UUID          NULL REFERENCES public.proto_receipts(id) ON DELETE SET NULL,
  confidence          INTEGER       NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  reasons             JSONB         NOT NULL DEFAULT '[]'::jsonb,
  warnings            JSONB         NOT NULL DEFAULT '[]'::jsonb,
  recommended_action  TEXT          NOT NULL DEFAULT 'UNIDENTIFIED'
    CHECK (recommended_action IN ('AUTO_RECONCILE_CANDIDATE','REVIEW','UNIDENTIFIED','REJECT')),
  engine_version      INTEGER       NOT NULL DEFAULT 1,
  status              TEXT          NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated','pending_review','confirmed','rejected','superseded','expired','reversed')),
  -- Anti-drift: 'confirmed' SOLO con link canónico creado por la RPC; los estados
  -- terminales sin vínculo activo ('rejected'/'superseded'/'reversed') no llevan link.
  confirmed_link_id   UUID          NULL REFERENCES public.bank_movement_reconciliation_links(id) ON DELETE SET NULL,
  reviewed_by         UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ   NULL,
  rejected_reason     TEXT          NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT brs_confirmed_requires_link CHECK (status <> 'confirmed' OR confirmed_link_id IS NOT NULL),
  CONSTRAINT brs_rejected_has_no_link    CHECK (status NOT IN ('rejected','superseded','reversed') OR confirmed_link_id IS NULL)
);

COMMENT ON TABLE public.bank_reconciliation_suggestions IS
  'Propuestas del motor (cliente/recibo/pagador, confianza, razones). NO es la fuente financiera: la confirmación crea el link canónico vía RPC. FASE BANK-SCHEMA-CORRECTION-001.';

CREATE INDEX IF NOT EXISTS brs_ws_movement_idx ON public.bank_reconciliation_suggestions (workspace_id, bank_movement_id);
CREATE INDEX IF NOT EXISTS brs_ws_status_idx   ON public.bank_reconciliation_suggestions (workspace_id, status);
-- Shadow versionado: una sola sugerencia ACTIVA por (movimiento, engine_version).
CREATE UNIQUE INDEX IF NOT EXISTS brs_active_uidx
  ON public.bank_reconciliation_suggestions (workspace_id, bank_movement_id, engine_version)
  WHERE status IN ('generated','pending_review');

-- ── Aplicaciones a facturas (referencian el LINK CANÓNICO, no la sugerencia) ──
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  reconciliation_link_id  UUID          NOT NULL REFERENCES public.bank_movement_reconciliation_links(id) ON DELETE CASCADE,
  invoice_id              UUID          NULL REFERENCES public.proto_invoices(id) ON DELETE SET NULL,
  applied_amount          NUMERIC(14,2) NOT NULL CHECK (applied_amount > 0),
  currency                TEXT          NOT NULL CHECK (currency IN ('UYU','USD')),
  status                  TEXT          NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  source                  TEXT          NOT NULL DEFAULT 'engine' CHECK (source IN ('engine','manual')),
  created_by              UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_allocations IS
  'Aplicación factura↔importe sobre un LINK CANÓNICO. Σ activas ≤ importe del link y ≤ saldo de la factura (validado transaccionalmente en la RPC, NO por CHECK de fila). FASE BANK-SCHEMA-CORRECTION-001.';

CREATE INDEX IF NOT EXISTS pa_ws_link_idx    ON public.payment_allocations (workspace_id, reconciliation_link_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS pa_ws_invoice_idx ON public.payment_allocations (workspace_id, invoice_id) WHERE status='active';
-- Una factura aparece a lo sumo UNA vez por link activo (la RPC agrega el JSON por
-- factura). Varios links → una factura SÍ está permitido (multi-pago legítimo).
CREATE UNIQUE INDEX IF NOT EXISTS pa_link_invoice_active_uidx
  ON public.payment_allocations (workspace_id, reconciliation_link_id, invoice_id)
  WHERE status='active' AND invoice_id IS NOT NULL;

-- ── Eventos (append-only) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reconciliation_events (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  event_type     TEXT          NOT NULL
    CHECK (event_type IN ('movement_imported','duplicate_detected','suggestion_created',
                          'suggestion_changed','suggestion_superseded','reconciliation_confirmed',
                          'reconciliation_rejected','allocation_created','allocation_changed',
                          'reconciliation_reversed','payer_link_confirmed','payer_link_rejected',
                          'payer_link_conflicted')),
  entity_type    TEXT          NOT NULL,   -- suggestion | link | allocation | payer
  entity_id      UUID          NULL,
  previous_state TEXT          NULL,
  new_state      TEXT          NULL,
  reason         TEXT          NULL,
  actor_user_id  UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  metadata       JSONB         NOT NULL DEFAULT '{}'::jsonb,   -- nunca secretos ni cuenta completa
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reconciliation_events IS
  'Trazabilidad append-only de sugerencias/links/allocations/pagadores. Sin secretos ni cuentas completas. FASE BANK-SCHEMA-CORRECTION-001.';

CREATE INDEX IF NOT EXISTS re_ws_created_idx ON public.reconciliation_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS re_ws_entity_idx  ON public.reconciliation_events (workspace_id, entity_type, entity_id);

-- ── Triggers estándar ─────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_brs_updated_at ON public.bank_reconciliation_suggestions;
CREATE TRIGGER trg_brs_updated_at BEFORE UPDATE ON public.bank_reconciliation_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();
DROP TRIGGER IF EXISTS trg_brs_force_ws ON public.bank_reconciliation_suggestions;
CREATE TRIGGER trg_brs_force_ws BEFORE INSERT OR UPDATE ON public.bank_reconciliation_suggestions
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

-- ── RLS por workspace (sin anon/public); events append-only ──────────────────
ALTER TABLE public.bank_reconciliation_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_events           ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_reconciliation_suggestions','payment_allocations','reconciliation_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (workspace_id = public.copilot_current_workspace_company_id())', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (workspace_id = public.copilot_current_workspace_company_id())', t||'_insert', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['bank_reconciliation_suggestions','payment_allocations'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (workspace_id = public.copilot_current_workspace_company_id()) WITH CHECK (workspace_id = public.copilot_current_workspace_company_id())', t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (workspace_id = public.copilot_current_workspace_company_id())', t||'_delete', t);
  END LOOP;
END $$;

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP TABLE IF EXISTS public.reconciliation_events;
--   DROP TABLE IF EXISTS public.payment_allocations;
--   DROP TABLE IF EXISTS public.bank_reconciliation_suggestions;
