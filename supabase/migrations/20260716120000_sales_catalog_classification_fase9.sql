-- FASE 9 — Catálogo canónico de Ventas: productos/servicios, categorías,
-- aliases y clasificación de líneas.
--
-- ADITIVO Y NO DESTRUCTIVO. No toca proto_invoices ni ninguna tabla financiera.
-- El detalle de venta (líneas) sigue leyéndose de
--   proto_invoices.zeta_metadata.zeta_customer_voucher_v1.raw_payload.Lineas[]
-- Estas tablas solo NORMALIZAN esos conceptos; el texto original de Zeta jamás
-- se modifica.
--
-- Scope por workspace_id (companies.id) con el mismo patrón que bank_movements:
-- RLS + copilot_current_workspace_company_id() + copilot_treasury_row_force_workspace().
-- Idempotente: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.

-- ─── sales_catalog_categories ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_catalog_categories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name         TEXT        NOT NULL CHECK (trim(name) <> ''),
  active       BOOLEAN     NOT NULL DEFAULT true,
  created_by   UUID        NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sales_catalog_categories IS
  'FASE9: categorías de productos/servicios de venta (Marketing digital, Desarrollo web, etc.).';

CREATE INDEX IF NOT EXISTS sales_catalog_categories_ws_active_idx
  ON public.sales_catalog_categories (workspace_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS sales_catalog_categories_ws_name_uidx
  ON public.sales_catalog_categories (workspace_id, lower(trim(name)));

DROP TRIGGER IF EXISTS trg_sales_catalog_categories_updated_at ON public.sales_catalog_categories;
CREATE TRIGGER trg_sales_catalog_categories_updated_at
  BEFORE UPDATE ON public.sales_catalog_categories
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_catalog_categories_force_workspace ON public.sales_catalog_categories;
CREATE TRIGGER trg_sales_catalog_categories_force_workspace
  BEFORE INSERT OR UPDATE ON public.sales_catalog_categories
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.sales_catalog_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_catalog_categories_select" ON public.sales_catalog_categories;
CREATE POLICY "sales_catalog_categories_select" ON public.sales_catalog_categories
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_catalog_categories_insert" ON public.sales_catalog_categories;
CREATE POLICY "sales_catalog_categories_insert" ON public.sales_catalog_categories
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_catalog_categories_update" ON public.sales_catalog_categories;
CREATE POLICY "sales_catalog_categories_update" ON public.sales_catalog_categories
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_catalog_categories_delete" ON public.sales_catalog_categories;
CREATE POLICY "sales_catalog_categories_delete" ON public.sales_catalog_categories
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

-- ─── sales_catalog_items ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_catalog_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name             TEXT        NOT NULL CHECK (trim(name) <> ''),
  category_id      UUID        NULL REFERENCES public.sales_catalog_categories(id) ON DELETE SET NULL,
  item_type        TEXT        NOT NULL DEFAULT 'service' CHECK (item_type IN ('product','service')),
  active           BOOLEAN     NOT NULL DEFAULT true,
  default_currency TEXT        NULL CHECK (default_currency IS NULL OR default_currency IN ('UYU','USD')),
  description      TEXT        NULL,
  created_by       UUID        NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sales_catalog_items IS
  'FASE9: productos/servicios canónicos de venta (Página web, Pautas y redes, etc.).';

CREATE INDEX IF NOT EXISTS sales_catalog_items_ws_active_idx
  ON public.sales_catalog_items (workspace_id, active);
CREATE INDEX IF NOT EXISTS sales_catalog_items_ws_category_idx
  ON public.sales_catalog_items (workspace_id, category_id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_catalog_items_ws_name_uidx
  ON public.sales_catalog_items (workspace_id, lower(trim(name)));

DROP TRIGGER IF EXISTS trg_sales_catalog_items_updated_at ON public.sales_catalog_items;
CREATE TRIGGER trg_sales_catalog_items_updated_at
  BEFORE UPDATE ON public.sales_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_catalog_items_force_workspace ON public.sales_catalog_items;
CREATE TRIGGER trg_sales_catalog_items_force_workspace
  BEFORE INSERT OR UPDATE ON public.sales_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.sales_catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_catalog_items_select" ON public.sales_catalog_items;
CREATE POLICY "sales_catalog_items_select" ON public.sales_catalog_items
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_catalog_items_insert" ON public.sales_catalog_items;
CREATE POLICY "sales_catalog_items_insert" ON public.sales_catalog_items
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_catalog_items_update" ON public.sales_catalog_items;
CREATE POLICY "sales_catalog_items_update" ON public.sales_catalog_items
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_catalog_items_delete" ON public.sales_catalog_items;
CREATE POLICY "sales_catalog_items_delete" ON public.sales_catalog_items
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

-- ─── sales_catalog_aliases ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_catalog_aliases (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  catalog_item_id  UUID        NOT NULL REFERENCES public.sales_catalog_items(id) ON DELETE CASCADE,
  original_value   TEXT        NOT NULL CHECK (trim(original_value) <> ''),
  normalized_value TEXT        NOT NULL CHECK (trim(normalized_value) <> ''),
  match_type       TEXT        NOT NULL DEFAULT 'normalized_exact'
    CHECK (match_type IN ('exact','normalized_exact','contains','code')),
  priority         INTEGER     NOT NULL DEFAULT 100,
  active           BOOLEAN     NOT NULL DEFAULT true,
  created_by       UUID        NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sales_catalog_aliases IS
  'FASE9: aliases/equivalencias de conceptos Zeta → producto canónico. Preserva texto original.';

CREATE INDEX IF NOT EXISTS sales_catalog_aliases_ws_item_idx
  ON public.sales_catalog_aliases (workspace_id, catalog_item_id);
CREATE INDEX IF NOT EXISTS sales_catalog_aliases_ws_norm_idx
  ON public.sales_catalog_aliases (workspace_id, normalized_value);
CREATE UNIQUE INDEX IF NOT EXISTS sales_catalog_aliases_ws_norm_type_uidx
  ON public.sales_catalog_aliases (workspace_id, normalized_value, match_type)
  WHERE active;

DROP TRIGGER IF EXISTS trg_sales_catalog_aliases_updated_at ON public.sales_catalog_aliases;
CREATE TRIGGER trg_sales_catalog_aliases_updated_at
  BEFORE UPDATE ON public.sales_catalog_aliases
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_catalog_aliases_force_workspace ON public.sales_catalog_aliases;
CREATE TRIGGER trg_sales_catalog_aliases_force_workspace
  BEFORE INSERT OR UPDATE ON public.sales_catalog_aliases
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.sales_catalog_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_catalog_aliases_select" ON public.sales_catalog_aliases;
CREATE POLICY "sales_catalog_aliases_select" ON public.sales_catalog_aliases
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_catalog_aliases_insert" ON public.sales_catalog_aliases;
CREATE POLICY "sales_catalog_aliases_insert" ON public.sales_catalog_aliases
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_catalog_aliases_update" ON public.sales_catalog_aliases;
CREATE POLICY "sales_catalog_aliases_update" ON public.sales_catalog_aliases
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_catalog_aliases_delete" ON public.sales_catalog_aliases;
CREATE POLICY "sales_catalog_aliases_delete" ON public.sales_catalog_aliases
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

-- ─── sales_line_classifications ──────────────────────────────────────────────
-- Clasificación manual determinística por concepto normalizado. status 'ignored'
-- marca un concepto como no-venta clasificable (no desaparece de KPIs; se agrupa).

CREATE TABLE IF NOT EXISTS public.sales_line_classifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  concept_key     TEXT        NOT NULL CHECK (trim(concept_key) <> ''),
  catalog_item_id UUID        NULL REFERENCES public.sales_catalog_items(id) ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'classified' CHECK (status IN ('classified','ignored')),
  created_by      UUID        NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sales_line_classifications IS
  'FASE9: clasificación manual por concepto normalizado. Override determinístico sobre aliases.';

CREATE INDEX IF NOT EXISTS sales_line_classifications_ws_status_idx
  ON public.sales_line_classifications (workspace_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS sales_line_classifications_ws_key_uidx
  ON public.sales_line_classifications (workspace_id, concept_key);

DROP TRIGGER IF EXISTS trg_sales_line_classifications_updated_at ON public.sales_line_classifications;
CREATE TRIGGER trg_sales_line_classifications_updated_at
  BEFORE UPDATE ON public.sales_line_classifications
  FOR EACH ROW EXECUTE FUNCTION public.copilot_set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_line_classifications_force_workspace ON public.sales_line_classifications;
CREATE TRIGGER trg_sales_line_classifications_force_workspace
  BEFORE INSERT OR UPDATE ON public.sales_line_classifications
  FOR EACH ROW EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.sales_line_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_line_classifications_select" ON public.sales_line_classifications;
CREATE POLICY "sales_line_classifications_select" ON public.sales_line_classifications
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_line_classifications_insert" ON public.sales_line_classifications;
CREATE POLICY "sales_line_classifications_insert" ON public.sales_line_classifications
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_line_classifications_update" ON public.sales_line_classifications;
CREATE POLICY "sales_line_classifications_update" ON public.sales_line_classifications
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
DROP POLICY IF EXISTS "sales_line_classifications_delete" ON public.sales_line_classifications;
CREATE POLICY "sales_line_classifications_delete" ON public.sales_line_classifications
  FOR DELETE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());
