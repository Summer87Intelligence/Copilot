-- BANK-RECONCILIATION-LINKS-001 (FASE E)
-- Conciliación bancaria AUDITABLE y N:M sin tocar el movimiento original.
--
-- Hoy `bank_movements` guarda una conciliación INLINE (matched_type/matched_id),
-- que solo admite 1 movimiento ↔ 1 operación y no registra importe aplicado. Esta
-- tabla aditiva permite:
--   - varios movimientos ↔ 1 operación,
--   - 1 movimiento ↔ varias operaciones (aplicaciones parciales),
--   - importe aplicado por relación, con moneda y dirección,
--   - auditoría (usuario, método, confianza, nota, fecha).
--
-- ADITIVA y NO DESTRUCTIVA. No borra ni migra datos. No escribe en tablas legacy.
-- Scope por workspace_id (companies.id) con el mismo patrón que bank_movements:
-- RLS + copilot_current_workspace_company_id() + copilot_treasury_row_force_workspace().
--
-- El movimiento original (bank_movements) NO se modifica: una relación VINCULA
-- operaciones, no crea dinero nuevo (ver docs/architecture/canonical-bank-reconciliation.md).

CREATE TABLE IF NOT EXISTS public.bank_movement_reconciliation_links (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bank_movement_id  UUID          NOT NULL REFERENCES public.bank_movements(id) ON DELETE CASCADE,
  -- Tipo de operación conciliada. 'ignored' se usa cuando el movimiento se marca
  -- ignorado con motivo (no vincula operación real).
  target_type       TEXT          NOT NULL
    CHECK (target_type IN (
      'receipt',                 -- recibo Zeta / cobro registrado
      'planned_cash_obligation', -- pago programado (Tesorería)
      'treasury_income',         -- ingreso interno de Tesorería
      'treasury_expense',        -- egreso interno de Tesorería
      'bank_movement',           -- transferencia entre movimientos bancarios
      'manual',                  -- operación manual sin entidad estructurada
      'ignored'                  -- ignorado con motivo (no cuenta como conciliado)
    )),
  -- Id de la entidad conciliada (uuid o clave estable). Nulo para 'manual'/'ignored'.
  target_id         TEXT          NULL,
  -- Importe aplicado en ESTA relación (siempre positivo; el signo lo da direction).
  applied_amount    NUMERIC(14,2) NOT NULL CHECK (applied_amount > 0),
  currency          TEXT          NOT NULL CHECK (currency IN ('UYU','USD')),
  direction         TEXT          NOT NULL CHECK (direction IN ('inflow','outflow')),
  -- Cómo se creó la relación.
  method            TEXT          NOT NULL DEFAULT 'manual'
    CHECK (method IN ('manual','suggested_confirmed')),
  -- Confianza de la sugerencia confirmada (nula si fue 100% manual).
  confidence        TEXT          NULL CHECK (confidence IS NULL OR confidence IN ('high','medium','low')),
  note              TEXT          NULL,
  created_by        UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- Deshacer conciliación = archivar (auditable), no borrar.
  archived_at       TIMESTAMPTZ   NULL
);

COMMENT ON TABLE public.bank_movement_reconciliation_links IS
  'Relaciones N:M auditables entre movimientos bancarios y operaciones (recibos, pagos, ingresos/egresos). No modifica el movimiento ni crea dinero; solo vincula. FASE E.';

CREATE INDEX IF NOT EXISTS bank_recon_links_ws_movement_idx
  ON public.bank_movement_reconciliation_links (workspace_id, bank_movement_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS bank_recon_links_ws_target_idx
  ON public.bank_movement_reconciliation_links (workspace_id, target_type, target_id)
  WHERE archived_at IS NULL;

-- Una misma relación (movimiento ↔ operación concreta) no se duplica mientras esté activa.
CREATE UNIQUE INDEX IF NOT EXISTS bank_recon_links_active_uidx
  ON public.bank_movement_reconciliation_links (workspace_id, bank_movement_id, target_type, target_id)
  WHERE archived_at IS NULL AND target_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_bank_recon_links_updated_at ON public.bank_movement_reconciliation_links;
CREATE TRIGGER trg_bank_recon_links_updated_at
  BEFORE UPDATE ON public.bank_movement_reconciliation_links
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_bank_recon_links_force_workspace ON public.bank_movement_reconciliation_links;
CREATE TRIGGER trg_bank_recon_links_force_workspace
  BEFORE INSERT OR UPDATE ON public.bank_movement_reconciliation_links
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.bank_movement_reconciliation_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_recon_links_select" ON public.bank_movement_reconciliation_links;
CREATE POLICY "bank_recon_links_select" ON public.bank_movement_reconciliation_links
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bank_recon_links_insert" ON public.bank_movement_reconciliation_links;
CREATE POLICY "bank_recon_links_insert" ON public.bank_movement_reconciliation_links
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bank_recon_links_update" ON public.bank_movement_reconciliation_links;
CREATE POLICY "bank_recon_links_update" ON public.bank_movement_reconciliation_links
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "bank_recon_links_delete" ON public.bank_movement_reconciliation_links;
CREATE POLICY "bank_recon_links_delete" ON public.bank_movement_reconciliation_links
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP TABLE IF EXISTS public.bank_movement_reconciliation_links;
-- La tabla es aditiva: si se revierte, la conciliación inline de bank_movements
-- (matched_type/matched_id) sigue operando como antes.
