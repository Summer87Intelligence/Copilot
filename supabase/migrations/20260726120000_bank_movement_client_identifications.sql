-- BANK-HISTORICAL-PAYER-IDENTIFICATION-001
--
-- ADITIVA y NO DESTRUCTIVA. Sin DML, sin backfill. NO APLICAR sin autorización.
--
-- Decisión funcional: "identificar el cliente de un movimiento" y "conciliar
-- con Zeta" son dos hechos DISTINTOS. No reutiliza `bank_movement_reconciliation_links`
-- (esa tabla exige `target_type`/`target_id` == recibo real; forzar un valor
-- ficticio o NULL ahí para representar "sin recibo" rompería su contrato
-- financiero). Esta tabla identifica movimiento→cliente de forma independiente,
-- exista o no un recibo compatible en Zeta.
--
-- No crea ningún link financiero, allocation ni evento de conciliación.
-- No marca ninguna factura como pagada. Nunca usa una referencia puntual de
-- operación (TT/LR/TR/LE/NRR) como identidad — solo referencia al pagador
-- durable (`bank_payer_identities`, ya existente) cuando aplica.

CREATE TABLE IF NOT EXISTS public.bank_movement_client_identifications (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  movement_id           UUID          NOT NULL REFERENCES public.bank_movements(id) ON DELETE CASCADE,
  client_company_id     UUID          NOT NULL REFERENCES public.proto_companies(id) ON DELETE CASCADE,
  payer_identity_id     UUID          NULL REFERENCES public.bank_payer_identities(id) ON DELETE SET NULL,
  status                TEXT          NOT NULL DEFAULT 'identified'
    CHECK (status IN ('identified','shared_account','third_party','excluded','revoked')),
  identification_mode   TEXT          NOT NULL DEFAULT 'manual_single'
    CHECK (identification_mode IN ('manual_single','manual_batch')),
  reason                TEXT          NULL,
  confirmed_by          UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  confirmed_at          TIMESTAMPTZ   NULL,
  revoked_by            UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  revoked_at            TIMESTAMPTZ   NULL,
  metadata              JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bank_movement_client_identifications IS
  'Identificación manual movimiento→cliente, independiente de si existe recibo/factura en Zeta. NUNCA implica conciliación financiera ni marca facturas pagadas — eso vive exclusivamente en bank_movement_reconciliation_links vía confirm_bank_reconciliation_v1. FASE BANK-HISTORICAL-PAYER-IDENTIFICATION-001.';

-- Una identificación activa por movimiento (excluded/revoked pueden repetirse
-- como histórico de corrección, igual que el patrón ya usado en client_payer_links).
CREATE UNIQUE INDEX IF NOT EXISTS bmci_active_uidx
  ON public.bank_movement_client_identifications (workspace_id, movement_id)
  WHERE status NOT IN ('excluded','revoked');
CREATE INDEX IF NOT EXISTS bmci_ws_client_idx
  ON public.bank_movement_client_identifications (workspace_id, client_company_id);
CREATE INDEX IF NOT EXISTS bmci_ws_payer_idx
  ON public.bank_movement_client_identifications (workspace_id, payer_identity_id);

DROP TRIGGER IF EXISTS trg_bmci_updated_at ON public.bank_movement_client_identifications;
CREATE TRIGGER trg_bmci_updated_at BEFORE UPDATE ON public.bank_movement_client_identifications
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();
DROP TRIGGER IF EXISTS trg_bmci_force_ws ON public.bank_movement_client_identifications;
CREATE TRIGGER trg_bmci_force_ws BEFORE INSERT OR UPDATE ON public.bank_movement_client_identifications
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.bank_movement_client_identifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bmci_select" ON public.bank_movement_client_identifications;
CREATE POLICY "bmci_select" ON public.bank_movement_client_identifications FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bmci_insert" ON public.bank_movement_client_identifications;
CREATE POLICY "bmci_insert" ON public.bank_movement_client_identifications FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bmci_update" ON public.bank_movement_client_identifications;
CREATE POLICY "bmci_update" ON public.bank_movement_client_identifications FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bmci_delete" ON public.bank_movement_client_identifications;
CREATE POLICY "bmci_delete" ON public.bank_movement_client_identifications FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP TABLE IF EXISTS public.bank_movement_client_identifications;
