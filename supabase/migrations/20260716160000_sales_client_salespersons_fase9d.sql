-- FASE 9D — Asignación comercial por CLIENTE (historial temporal).
--
-- ADITIVO Y NO DESTRUCTIVO. No toca proto_invoices ni tablas financieras.
-- No DML / no backfill. La atribución comercial arranca 2026-07-01.
--
-- Precedencia de lectura (código app):
--   1) override legacy en sales_document_salespersons (solo lectura histórica)
--   2) comercial vigente del cliente en issue_date (esta tabla)
--   3) Sin asignar
--
-- NO APLICAR sin autorización explícita del usuario.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.sales_client_salespersons (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  customer_id    UUID        NOT NULL,
  salesperson_id UUID        NOT NULL REFERENCES public.sales_salespersons(id) ON DELETE RESTRICT,
  valid_from     DATE        NOT NULL DEFAULT '2026-07-01',
  valid_to       DATE        NULL,
  assigned_by    UUID        NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_client_salespersons_valid_range_chk
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

COMMENT ON TABLE public.sales_client_salespersons IS
  'FASE9D: historial de comercial asignado al cliente. Cada venta hereda el comercial vigente en issue_date.';

CREATE INDEX IF NOT EXISTS sales_client_salespersons_ws_cust_idx
  ON public.sales_client_salespersons (workspace_id, customer_id);

CREATE INDEX IF NOT EXISTS sales_client_salespersons_ws_sp_idx
  ON public.sales_client_salespersons (workspace_id, salesperson_id);

CREATE INDEX IF NOT EXISTS sales_client_salespersons_ws_validity_idx
  ON public.sales_client_salespersons (workspace_id, customer_id, valid_from, valid_to);

-- Una sola asignación abierta (valid_to IS NULL) por cliente/workspace.
CREATE UNIQUE INDEX IF NOT EXISTS sales_client_salespersons_ws_cust_open_uidx
  ON public.sales_client_salespersons (workspace_id, customer_id)
  WHERE valid_to IS NULL;

DROP TRIGGER IF EXISTS trg_sales_client_salespersons_updated_at ON public.sales_client_salespersons;
CREATE TRIGGER trg_sales_client_salespersons_updated_at
  BEFORE UPDATE ON public.sales_client_salespersons
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_client_salespersons_force_workspace ON public.sales_client_salespersons;
CREATE TRIGGER trg_sales_client_salespersons_force_workspace
  BEFORE INSERT OR UPDATE ON public.sales_client_salespersons
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.sales_client_salespersons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_client_salespersons_select" ON public.sales_client_salespersons;
CREATE POLICY "sales_client_salespersons_select" ON public.sales_client_salespersons
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "sales_client_salespersons_insert" ON public.sales_client_salespersons;
CREATE POLICY "sales_client_salespersons_insert" ON public.sales_client_salespersons
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "sales_client_salespersons_update" ON public.sales_client_salespersons;
CREATE POLICY "sales_client_salespersons_update" ON public.sales_client_salespersons
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "sales_client_salespersons_delete" ON public.sales_client_salespersons;
CREATE POLICY "sales_client_salespersons_delete" ON public.sales_client_salespersons
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
