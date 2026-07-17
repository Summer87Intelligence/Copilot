-- BANK-PAYER-IDENTITY-001 (FASE DOMAIN-IA-BANK-001)
-- Modelo de identidad de pagador bancario + relación pagador↔cliente (N:M).
--
-- ADITIVA y NO DESTRUCTIVA. Sin DML, sin backfill. NO APLICAR sin autorización.
-- Workspace-scoped (companies.id). RLS + force_workspace (service_role la app).
-- No guarda la cuenta completa: solo `masked_account` + `account_hash` estable.
-- Un pagador puede pagar por VARIOS clientes (no relación exclusiva).

CREATE TABLE IF NOT EXISTS public.bank_payer_identities (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bank_name             TEXT          NULL,
  original_name         TEXT          NULL,             -- valor visible original
  normalized_name       TEXT          NULL,             -- ayuda de matching, NO identidad
  document_id           TEXT          NULL,             -- RUT/documento si viene
  masked_account        TEXT          NULL,             -- •••• 4821
  account_hash          TEXT          NOT NULL,         -- huella determinística estable
  fingerprint_strength  TEXT          NOT NULL DEFAULT 'name'
    CHECK (fingerprint_strength IN ('reference','account','document','bank_account_ref','name','none')),
  fingerprint_version   INTEGER       NOT NULL DEFAULT 1,
  usual_currency        TEXT          NULL CHECK (usual_currency IS NULL OR usual_currency IN ('UYU','USD')),
  first_seen_at         TIMESTAMPTZ   NULL,
  last_seen_at          TIMESTAMPTZ   NULL,
  movement_count        INTEGER       NOT NULL DEFAULT 0 CHECK (movement_count >= 0),
  total_by_currency     JSONB         NOT NULL DEFAULT '{}'::jsonb,  -- {"UYU":..,"USD":..}
  normalization_metadata JSONB        NOT NULL DEFAULT '{}'::jsonb,
  status                TEXT          NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected','active','inactive','conflicted')),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bank_payer_identities IS
  'Identidad estable de pagador bancario (huella por referencia/cuenta/documento; nombre solo como ayuda). No guarda cuenta completa. FASE DOMAIN-IA-BANK-001.';

CREATE UNIQUE INDEX IF NOT EXISTS bank_payer_identities_ws_hash_uidx
  ON public.bank_payer_identities (workspace_id, account_hash);
CREATE INDEX IF NOT EXISTS bank_payer_identities_ws_name_idx
  ON public.bank_payer_identities (workspace_id, normalized_name);

CREATE TABLE IF NOT EXISTS public.client_payer_links (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  payer_identity_id  UUID          NOT NULL REFERENCES public.bank_payer_identities(id) ON DELETE CASCADE,
  client_company_id  UUID          NOT NULL REFERENCES public.proto_companies(id) ON DELETE CASCADE,
  confidence         INTEGER       NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  -- No es un booleano: un pagador puede pagar por varias empresas del grupo.
  status             TEXT          NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected','suggested','confirmed','learned','conflicted','inactive','rejected')),
  source             TEXT          NOT NULL DEFAULT 'engine'
    CHECK (source IN ('engine','manual','import')),
  confirmations      INTEGER       NOT NULL DEFAULT 0 CHECK (confirmations >= 0),
  rejections         INTEGER       NOT NULL DEFAULT 0 CHECK (rejections >= 0),
  reconciled_count   INTEGER       NOT NULL DEFAULT 0 CHECK (reconciled_count >= 0),
  total_by_currency  JSONB         NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at      TIMESTAMPTZ   NULL,
  last_seen_at       TIMESTAMPTZ   NULL,
  confirmed_by       UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  confirmed_at       TIMESTAMPTZ   NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_payer_links IS
  'Relación N:M pagador↔cliente con confianza y estado (no booleano). Un pagador puede pagar por varios clientes. FASE DOMAIN-IA-BANK-001.';

-- Una relación activa única por (pagador, cliente); el histórico rechazado/inactivo puede repetir.
CREATE UNIQUE INDEX IF NOT EXISTS client_payer_links_active_uidx
  ON public.client_payer_links (workspace_id, payer_identity_id, client_company_id)
  WHERE status NOT IN ('rejected','inactive');
CREATE INDEX IF NOT EXISTS client_payer_links_ws_client_idx
  ON public.client_payer_links (workspace_id, client_company_id);
CREATE INDEX IF NOT EXISTS client_payer_links_ws_payer_idx
  ON public.client_payer_links (workspace_id, payer_identity_id);

-- Triggers estándar (updated_at + workspace forzado por servidor; bypass service_role).
DROP TRIGGER IF EXISTS trg_bank_payer_identities_updated_at ON public.bank_payer_identities;
CREATE TRIGGER trg_bank_payer_identities_updated_at BEFORE UPDATE ON public.bank_payer_identities
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();
DROP TRIGGER IF EXISTS trg_bank_payer_identities_force_ws ON public.bank_payer_identities;
CREATE TRIGGER trg_bank_payer_identities_force_ws BEFORE INSERT OR UPDATE ON public.bank_payer_identities
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();
DROP TRIGGER IF EXISTS trg_client_payer_links_updated_at ON public.client_payer_links;
CREATE TRIGGER trg_client_payer_links_updated_at BEFORE UPDATE ON public.client_payer_links
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();
DROP TRIGGER IF EXISTS trg_client_payer_links_force_ws ON public.client_payer_links;
CREATE TRIGGER trg_client_payer_links_force_ws BEFORE INSERT OR UPDATE ON public.client_payer_links
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

-- RLS por workspace (SELECT/INSERT/UPDATE/DELETE). Sin anon/public.
ALTER TABLE public.bank_payer_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_payer_links   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bpi_select" ON public.bank_payer_identities;
CREATE POLICY "bpi_select" ON public.bank_payer_identities FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bpi_insert" ON public.bank_payer_identities;
CREATE POLICY "bpi_insert" ON public.bank_payer_identities FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bpi_update" ON public.bank_payer_identities;
CREATE POLICY "bpi_update" ON public.bank_payer_identities FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bpi_delete" ON public.bank_payer_identities;
CREATE POLICY "bpi_delete" ON public.bank_payer_identities FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "cpl_select" ON public.client_payer_links;
CREATE POLICY "cpl_select" ON public.client_payer_links FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "cpl_insert" ON public.client_payer_links;
CREATE POLICY "cpl_insert" ON public.client_payer_links FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "cpl_update" ON public.client_payer_links;
CREATE POLICY "cpl_update" ON public.client_payer_links FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "cpl_delete" ON public.client_payer_links;
CREATE POLICY "cpl_delete" ON public.client_payer_links FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP TABLE IF EXISTS public.client_payer_links;
--   DROP TABLE IF EXISTS public.bank_payer_identities;
