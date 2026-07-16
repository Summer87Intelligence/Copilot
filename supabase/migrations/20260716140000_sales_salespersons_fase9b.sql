-- FASE 9B — Comerciales (salespersons) y asignación por documento de venta.
--
-- ADITIVO Y NO DESTRUCTIVO. No toca proto_invoices ni tablas financieras.
-- La asignación comercial es MANUAL y arranca 2026-07-01: no hay backfill,
-- no se adivina, ventas anteriores quedan "Sin asignar".
--
-- Scope por workspace_id (companies.id) con el patrón estándar:
-- RLS + copilot_current_workspace_company_id() + copilot_treasury_row_force_workspace().
-- Idempotente.

-- ─── sales_salespersons ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_salespersons (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  app_user_id  UUID        NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  display_name TEXT        NOT NULL CHECK (trim(display_name) <> ''),
  active       BOOLEAN     NOT NULL DEFAULT true,
  valid_from   DATE        NOT NULL DEFAULT '2026-07-01',
  valid_to     DATE        NULL,
  created_by   UUID        NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sales_salespersons IS
  'FASE9B: comerciales del workspace (Daniel, Juanma, Camila...). Distinto de app_users del sistema.';

CREATE INDEX IF NOT EXISTS sales_salespersons_ws_active_idx
  ON public.sales_salespersons (workspace_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS sales_salespersons_ws_name_uidx
  ON public.sales_salespersons (workspace_id, lower(trim(display_name)));

DROP TRIGGER IF EXISTS trg_sales_salespersons_updated_at ON public.sales_salespersons;
CREATE TRIGGER trg_sales_salespersons_updated_at
  BEFORE UPDATE ON public.sales_salespersons
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_salespersons_force_workspace ON public.sales_salespersons;
CREATE TRIGGER trg_sales_salespersons_force_workspace
  BEFORE INSERT OR UPDATE ON public.sales_salespersons
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.sales_salespersons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_salespersons_select" ON public.sales_salespersons;
CREATE POLICY "sales_salespersons_select" ON public.sales_salespersons
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_salespersons_insert" ON public.sales_salespersons;
CREATE POLICY "sales_salespersons_insert" ON public.sales_salespersons
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_salespersons_update" ON public.sales_salespersons;
CREATE POLICY "sales_salespersons_update" ON public.sales_salespersons
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_salespersons_delete" ON public.sales_salespersons;
CREATE POLICY "sales_salespersons_delete" ON public.sales_salespersons
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

-- ─── sales_document_salespersons ─────────────────────────────────────────────
-- Asignación comercial por DOCUMENTO de venta (proto_invoices.id como texto,
-- no FK dura para no acoplar el ciclo de vida del comprobante). Un solo
-- comercial por documento (unique). Nullable: se puede des-asignar.

CREATE TABLE IF NOT EXISTS public.sales_document_salespersons (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  document_id    UUID        NOT NULL,
  salesperson_id UUID        NULL REFERENCES public.sales_salespersons(id) ON DELETE SET NULL,
  assigned_by    UUID        NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sales_document_salespersons IS
  'FASE9B: comercial asignado a un documento de venta (proto_invoices.id). Manual, desde 2026-07-01.';

CREATE INDEX IF NOT EXISTS sales_document_salespersons_ws_sp_idx
  ON public.sales_document_salespersons (workspace_id, salesperson_id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_document_salespersons_ws_doc_uidx
  ON public.sales_document_salespersons (workspace_id, document_id);

DROP TRIGGER IF EXISTS trg_sales_document_salespersons_updated_at ON public.sales_document_salespersons;
CREATE TRIGGER trg_sales_document_salespersons_updated_at
  BEFORE UPDATE ON public.sales_document_salespersons
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_document_salespersons_force_workspace ON public.sales_document_salespersons;
CREATE TRIGGER trg_sales_document_salespersons_force_workspace
  BEFORE INSERT OR UPDATE ON public.sales_document_salespersons
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.sales_document_salespersons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_document_salespersons_select" ON public.sales_document_salespersons;
CREATE POLICY "sales_document_salespersons_select" ON public.sales_document_salespersons
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_document_salespersons_insert" ON public.sales_document_salespersons;
CREATE POLICY "sales_document_salespersons_insert" ON public.sales_document_salespersons
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_document_salespersons_update" ON public.sales_document_salespersons;
CREATE POLICY "sales_document_salespersons_update" ON public.sales_document_salespersons
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_document_salespersons_delete" ON public.sales_document_salespersons;
CREATE POLICY "sales_document_salespersons_delete" ON public.sales_document_salespersons
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
