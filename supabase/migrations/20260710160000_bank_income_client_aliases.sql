-- BANK-INCOME-CLIENT-ALIAS-AND-BILLING-CONCEPTS-001
-- Asocia INGRESOS bancarios (direction=inflow) a clientes y conceptos de cobro.
-- Solo control y aprendizaje: NO toca caja, facturas, recibos ni Zeta.
--
-- 3 tablas nuevas (aditivo, no destructivo). Scope por workspace_id (companies.id),
-- mismo patrón que bank_movements: RLS + copilot_current_workspace_company_id()
-- + trigger copilot_treasury_row_force_workspace() (genérico pese al nombre).

-- ─── client_bank_aliases ─────────────────────────────────────────────────────
-- Nombres bancarios con que llegan los pagos de un cliente (razón social, RUT,
-- referencia, o aprendido desde un movimiento). No reemplaza client_transfer_aliases.

CREATE TABLE IF NOT EXISTS public.client_bank_aliases (
  id                           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                 UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  client_id                    UUID          NOT NULL REFERENCES public.proto_companies(id) ON DELETE CASCADE,
  alias_text                   TEXT          NOT NULL CHECK (trim(alias_text) <> ''),
  normalized_alias             TEXT          NOT NULL CHECK (trim(normalized_alias) <> ''),
  alias_type                   TEXT          NOT NULL DEFAULT 'manual'
    CHECK (alias_type IN ('bank_name','legal_name','rut','transfer_reference','contact_name','manual','learned')),
  currency                     TEXT          NULL CHECK (currency IS NULL OR currency IN ('UYU','USD')),
  usual_amount                 NUMERIC(14,2) NULL CHECK (usual_amount IS NULL OR usual_amount >= 0),
  confidence_weight            NUMERIC(5,2)  NOT NULL DEFAULT 1 CHECK (confidence_weight >= 0),
  learned_from_bank_movement_id UUID         NULL REFERENCES public.bank_movements(id) ON DELETE SET NULL,
  metadata                     JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_by                   UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at                   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  archived_at                  TIMESTAMPTZ   NULL
);

COMMENT ON TABLE public.client_bank_aliases IS
  'Alias bancarios por cliente para reconocer ingresos que llegan con otro nombre. Aprendizaje + manual.';

CREATE INDEX IF NOT EXISTS client_bank_aliases_ws_client_idx
  ON public.client_bank_aliases (workspace_id, client_id);
CREATE INDEX IF NOT EXISTS client_bank_aliases_ws_norm_idx
  ON public.client_bank_aliases (workspace_id, normalized_alias);

-- Sin duplicados activos por cliente.
CREATE UNIQUE INDEX IF NOT EXISTS client_bank_aliases_active_uidx
  ON public.client_bank_aliases (workspace_id, client_id, normalized_alias)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS trg_client_bank_aliases_updated_at ON public.client_bank_aliases;
CREATE TRIGGER trg_client_bank_aliases_updated_at
  BEFORE UPDATE ON public.client_bank_aliases
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_client_bank_aliases_force_workspace ON public.client_bank_aliases;
CREATE TRIGGER trg_client_bank_aliases_force_workspace
  BEFORE INSERT OR UPDATE ON public.client_bank_aliases
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.client_bank_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_bank_aliases_select" ON public.client_bank_aliases;
CREATE POLICY "client_bank_aliases_select" ON public.client_bank_aliases
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "client_bank_aliases_insert" ON public.client_bank_aliases;
CREATE POLICY "client_bank_aliases_insert" ON public.client_bank_aliases
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "client_bank_aliases_update" ON public.client_bank_aliases;
CREATE POLICY "client_bank_aliases_update" ON public.client_bank_aliases
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "client_bank_aliases_delete" ON public.client_bank_aliases;
CREATE POLICY "client_bank_aliases_delete" ON public.client_bank_aliases
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

-- ─── client_billing_concepts ─────────────────────────────────────────────────
-- Conceptos habituales de cobro (ej. "Pauta y redes" USD 183 mensual).

CREATE TABLE IF NOT EXISTS public.client_billing_concepts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  client_id       UUID          NOT NULL REFERENCES public.proto_companies(id) ON DELETE CASCADE,
  label           TEXT          NOT NULL CHECK (trim(label) <> ''),
  currency        TEXT          NOT NULL CHECK (currency IN ('UYU','USD')),
  expected_amount NUMERIC(14,2) NULL CHECK (expected_amount IS NULL OR expected_amount >= 0),
  billing_type    TEXT          NOT NULL DEFAULT 'recurring'
    CHECK (billing_type IN ('recurring','one_time','installment','variable')),
  frequency       TEXT          NULL CHECK (frequency IS NULL OR frequency IN ('monthly','weekly','yearly','none')),
  expected_day    INTEGER       NULL CHECK (expected_day IS NULL OR (expected_day BETWEEN 1 AND 31)),
  active          BOOLEAN       NOT NULL DEFAULT true,
  notes           TEXT          NULL,
  created_by      UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  archived_at     TIMESTAMPTZ   NULL
);

COMMENT ON TABLE public.client_billing_concepts IS
  'Conceptos habituales de cobro por cliente. Insumo del motor de ingresos; no genera facturas.';

CREATE INDEX IF NOT EXISTS client_billing_concepts_ws_client_idx
  ON public.client_billing_concepts (workspace_id, client_id);
CREATE INDEX IF NOT EXISTS client_billing_concepts_ws_amount_idx
  ON public.client_billing_concepts (workspace_id, currency, expected_amount);

DROP TRIGGER IF EXISTS trg_client_billing_concepts_updated_at ON public.client_billing_concepts;
CREATE TRIGGER trg_client_billing_concepts_updated_at
  BEFORE UPDATE ON public.client_billing_concepts
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_client_billing_concepts_force_workspace ON public.client_billing_concepts;
CREATE TRIGGER trg_client_billing_concepts_force_workspace
  BEFORE INSERT OR UPDATE ON public.client_billing_concepts
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.client_billing_concepts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_billing_concepts_select" ON public.client_billing_concepts;
CREATE POLICY "client_billing_concepts_select" ON public.client_billing_concepts
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "client_billing_concepts_insert" ON public.client_billing_concepts;
CREATE POLICY "client_billing_concepts_insert" ON public.client_billing_concepts
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "client_billing_concepts_update" ON public.client_billing_concepts;
CREATE POLICY "client_billing_concepts_update" ON public.client_billing_concepts
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "client_billing_concepts_delete" ON public.client_billing_concepts;
CREATE POLICY "client_billing_concepts_delete" ON public.client_billing_concepts
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

-- ─── bank_income_matches ─────────────────────────────────────────────────────
-- Asociación movimiento de ingreso ↔ cliente/concepto. Solo control/aprendizaje.

CREATE TABLE IF NOT EXISTS public.bank_income_matches (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bank_movement_id   UUID          NOT NULL REFERENCES public.bank_movements(id) ON DELETE CASCADE,
  client_id          UUID          NOT NULL REFERENCES public.proto_companies(id) ON DELETE CASCADE,
  billing_concept_id UUID          NULL REFERENCES public.client_billing_concepts(id) ON DELETE SET NULL,
  match_status       TEXT          NOT NULL DEFAULT 'suggested'
    CHECK (match_status IN ('suggested','confirmed','rejected')),
  confidence         TEXT          NULL CHECK (confidence IS NULL OR confidence IN ('high','medium','low')),
  score              NUMERIC(6,2)  NULL,
  reasons            JSONB         NOT NULL DEFAULT '[]'::jsonb,
  confirmed_by       UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  confirmed_at       TIMESTAMPTZ   NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bank_income_matches IS
  'Ingreso bancario asociado a cliente/concepto. NO impacta caja, facturas, recibos ni Zeta.';

CREATE INDEX IF NOT EXISTS bank_income_matches_ws_movement_idx
  ON public.bank_income_matches (workspace_id, bank_movement_id);
CREATE INDEX IF NOT EXISTS bank_income_matches_ws_client_idx
  ON public.bank_income_matches (workspace_id, client_id);

-- Un solo match confirmado por movimiento.
CREATE UNIQUE INDEX IF NOT EXISTS bank_income_matches_confirmed_uidx
  ON public.bank_income_matches (bank_movement_id)
  WHERE match_status = 'confirmed';

DROP TRIGGER IF EXISTS trg_bank_income_matches_updated_at ON public.bank_income_matches;
CREATE TRIGGER trg_bank_income_matches_updated_at
  BEFORE UPDATE ON public.bank_income_matches
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_bank_income_matches_force_workspace ON public.bank_income_matches;
CREATE TRIGGER trg_bank_income_matches_force_workspace
  BEFORE INSERT OR UPDATE ON public.bank_income_matches
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.bank_income_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_income_matches_select" ON public.bank_income_matches;
CREATE POLICY "bank_income_matches_select" ON public.bank_income_matches
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bank_income_matches_insert" ON public.bank_income_matches;
CREATE POLICY "bank_income_matches_insert" ON public.bank_income_matches
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bank_income_matches_update" ON public.bank_income_matches;
CREATE POLICY "bank_income_matches_update" ON public.bank_income_matches
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bank_income_matches_delete" ON public.bank_income_matches;
CREATE POLICY "bank_income_matches_delete" ON public.bank_income_matches
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
