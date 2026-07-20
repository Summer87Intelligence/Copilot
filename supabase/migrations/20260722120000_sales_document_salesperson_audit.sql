-- FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — Auditoría de cambios de vendedor por documento.
--
-- ADITIVO Y NO DESTRUCTIVO. No toca proto_invoices, sales_document_salespersons
-- ni ninguna tabla financiera. No DML / no backfill.
--
-- sales_document_salespersons (FASE 9B) solo conserva el ESTADO ACTUAL (una fila
-- por documento, sobrescrita en cada reasignación) — no hay forma de saber quién
-- estaba asignado antes de un cambio. Esta tabla es append-only: cada cambio de
-- vendedor (asignar, reasignar, desasignar) agrega una fila nueva; nunca se
-- actualiza ni se borra una fila existente (sin políticas UPDATE/DELETE).
--
-- Una fila de auditoría SIEMPRE representa un cambio real de vendedor:
-- `sales_document_salesperson_audit_change_chk` rechaza previous=new (incluida
-- la igualdad null=null). Asignar el mismo vendedor es idempotente a nivel
-- aplicación y no llega a insertar fila aquí.
--
-- NO APLICAR sin autorización explícita del usuario.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.sales_document_salesperson_audit (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  document_id      UUID        NOT NULL,
  previous_seller_id UUID      NULL REFERENCES public.sales_salespersons(id) ON DELETE SET NULL,
  new_seller_id    UUID        NULL REFERENCES public.sales_salespersons(id) ON DELETE SET NULL,
  changed_by       UUID        NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_document_salesperson_audit_change_chk
    CHECK (previous_seller_id IS DISTINCT FROM new_seller_id)
);

COMMENT ON TABLE public.sales_document_salesperson_audit IS
  'Auditoría append-only de cambios de vendedor por documento de venta. Nunca se actualiza ni se borra.';

CREATE INDEX IF NOT EXISTS sales_document_salesperson_audit_ws_doc_idx
  ON public.sales_document_salesperson_audit (workspace_id, document_id, changed_at DESC);

DROP TRIGGER IF EXISTS trg_sales_document_salesperson_audit_force_workspace ON public.sales_document_salesperson_audit;
CREATE TRIGGER trg_sales_document_salesperson_audit_force_workspace
  BEFORE INSERT ON public.sales_document_salesperson_audit
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.sales_document_salesperson_audit ENABLE ROW LEVEL SECURITY;

-- Append-only a nivel policy: solo SELECT + INSERT. Sin UPDATE/DELETE (nadie,
-- ni siquiera el propio autor, puede modificar o borrar una fila de auditoría).
DROP POLICY IF EXISTS "sales_document_salesperson_audit_select" ON public.sales_document_salesperson_audit;
CREATE POLICY "sales_document_salesperson_audit_select" ON public.sales_document_salesperson_audit
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "sales_document_salesperson_audit_insert" ON public.sales_document_salesperson_audit;
CREATE POLICY "sales_document_salesperson_audit_insert" ON public.sales_document_salesperson_audit
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
