-- COPILOT-BANK-MOVEMENTS-AND-DAILY-TASKS-SPRINT-A-001
-- Módulos nuevos: Movimientos bancarios (import + conciliación) y Tareas diarias.
-- Idempotente: IF NOT EXISTS / DROP POLICY IF EXISTS. No destructivo.
-- NO toca bank_reconciliation_movements (importador viejo de Tesorería).
-- Prerrequisitos: public.companies, public.app_users,
--   public.copilot_current_workspace_company_id(), public.copilot_set_updated_at().

-- ─── bank_statement_imports ──────────────────────────────────────────────────
-- Un registro por archivo de extracto subido (Santander PDF/CSV/Excel).

CREATE TABLE IF NOT EXISTS public.bank_statement_imports (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bank_name     TEXT          NOT NULL   CHECK (trim(bank_name) <> ''),
  account_label TEXT          NULL,
  file_name     TEXT          NULL,
  file_type     TEXT          NULL       CHECK (file_type IS NULL OR file_type IN ('pdf', 'csv', 'xlsx')),
  imported_by   UUID          NULL       REFERENCES public.app_users(id) ON DELETE SET NULL,
  imported_at   TIMESTAMPTZ   NOT NULL   DEFAULT now(),
  status        TEXT          NOT NULL   DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'parsed', 'failed', 'archived')),
  row_count     INTEGER       NOT NULL   DEFAULT 0 CHECK (row_count >= 0),
  metadata      JSONB         NOT NULL   DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ   NOT NULL   DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL   DEFAULT now()
);

COMMENT ON TABLE public.bank_statement_imports IS
  'Sprint A banco: un registro por extracto bancario subido (Santander en V1).';

CREATE INDEX IF NOT EXISTS bank_statement_imports_ws_idx
  ON public.bank_statement_imports (workspace_id, imported_at DESC);

CREATE INDEX IF NOT EXISTS bank_statement_imports_ws_status_idx
  ON public.bank_statement_imports (workspace_id, status);

DROP TRIGGER IF EXISTS trg_bank_statement_imports_updated_at ON public.bank_statement_imports;
CREATE TRIGGER trg_bank_statement_imports_updated_at
  BEFORE UPDATE ON public.bank_statement_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_set_updated_at();

-- Fuerza workspace_id desde la sesión JWT (defensa en profundidad). Bypass service_role.
DROP TRIGGER IF EXISTS trg_bank_statement_imports_force_workspace ON public.bank_statement_imports;
CREATE TRIGGER trg_bank_statement_imports_force_workspace
  BEFORE INSERT OR UPDATE ON public.bank_statement_imports
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_statement_imports_select" ON public.bank_statement_imports;
CREATE POLICY "bank_statement_imports_select"
  ON public.bank_statement_imports
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "bank_statement_imports_insert" ON public.bank_statement_imports;
CREATE POLICY "bank_statement_imports_insert"
  ON public.bank_statement_imports
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "bank_statement_imports_update" ON public.bank_statement_imports;
CREATE POLICY "bank_statement_imports_update"
  ON public.bank_statement_imports
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());

-- ─── bank_movements ──────────────────────────────────────────────────────────
-- Movimientos reales del banco (una fila por línea del extracto).
-- Importar NO modifica caja: la conciliación la confirma el usuario.

CREATE TABLE IF NOT EXISTS public.bank_movements (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  import_id          UUID          NULL REFERENCES public.bank_statement_imports(id) ON DELETE SET NULL,
  bank_name          TEXT          NOT NULL   CHECK (trim(bank_name) <> ''),
  account_label      TEXT          NULL,
  movement_date      DATE          NOT NULL,
  description        TEXT          NOT NULL   CHECK (trim(description) <> ''),
  raw_description    TEXT          NULL,
  amount             NUMERIC(14, 2) NOT NULL  CHECK (amount > 0),
  currency           TEXT          NOT NULL   CHECK (currency IN ('UYU', 'USD')),
  direction          TEXT          NOT NULL   CHECK (direction IN ('inflow', 'outflow')),
  bank_reference     TEXT          NULL,
  status             TEXT          NOT NULL   DEFAULT 'pending'
    CHECK (status IN ('pending', 'suggested', 'matched', 'ignored', 'needs_review')),
  matched_type       TEXT          NULL
    CHECK (matched_type IS NULL OR matched_type IN
      ('zeta_receipt', 'manual_movement', 'planned_payment', 'client', 'internal', 'other')),
  matched_id         UUID          NULL,
  matched_confidence NUMERIC(5, 2) NULL,
  matched_by         UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  matched_at         TIMESTAMPTZ   NULL,
  metadata           JSONB         NOT NULL   DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ   NOT NULL   DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL   DEFAULT now()
);

COMMENT ON TABLE public.bank_movements IS
  'Sprint A banco: movimientos del extracto bancario. Conciliación manual confirmada por el usuario; no impacta caja.';

CREATE INDEX IF NOT EXISTS bank_movements_ws_date_idx
  ON public.bank_movements (workspace_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS bank_movements_ws_status_idx
  ON public.bank_movements (workspace_id, status);

CREATE INDEX IF NOT EXISTS bank_movements_ws_direction_idx
  ON public.bank_movements (workspace_id, direction);

CREATE INDEX IF NOT EXISTS bank_movements_ws_currency_idx
  ON public.bank_movements (workspace_id, currency);

CREATE INDEX IF NOT EXISTS bank_movements_import_idx
  ON public.bank_movements (import_id)
  WHERE import_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bank_movements_ws_matched_idx
  ON public.bank_movements (workspace_id, matched_type, matched_id)
  WHERE matched_type IS NOT NULL;

DROP TRIGGER IF EXISTS trg_bank_movements_updated_at ON public.bank_movements;
CREATE TRIGGER trg_bank_movements_updated_at
  BEFORE UPDATE ON public.bank_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_set_updated_at();

-- Fuerza workspace_id desde la sesión JWT (defensa en profundidad). Bypass service_role.
DROP TRIGGER IF EXISTS trg_bank_movements_force_workspace ON public.bank_movements;
CREATE TRIGGER trg_bank_movements_force_workspace
  BEFORE INSERT OR UPDATE ON public.bank_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.bank_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_movements_select" ON public.bank_movements;
CREATE POLICY "bank_movements_select"
  ON public.bank_movements
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "bank_movements_insert" ON public.bank_movements;
CREATE POLICY "bank_movements_insert"
  ON public.bank_movements
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "bank_movements_update" ON public.bank_movements;
CREATE POLICY "bank_movements_update"
  ON public.bank_movements
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());

-- ─── bank_movement_match_suggestions ─────────────────────────────────────────
-- Sugerencias de coincidencia por movimiento (generadas en fases siguientes).

CREATE TABLE IF NOT EXISTS public.bank_movement_match_suggestions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bank_movement_id UUID          NOT NULL REFERENCES public.bank_movements(id) ON DELETE CASCADE,
  candidate_type   TEXT          NOT NULL
    CHECK (candidate_type IN
      ('zeta_receipt', 'manual_movement', 'planned_payment', 'client', 'internal', 'other')),
  candidate_id     UUID          NULL,
  confidence       NUMERIC(5, 2) NOT NULL,
  reason           TEXT          NULL,
  amount_delta     NUMERIC(14, 2) NULL,
  date_delta_days  INTEGER       NULL,
  status           TEXT          NOT NULL   DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'rejected', 'expired')),
  metadata         JSONB         NOT NULL   DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ   NOT NULL   DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL   DEFAULT now()
);

COMMENT ON TABLE public.bank_movement_match_suggestions IS
  'Sprint A banco: candidatos de conciliación por movimiento bancario. El usuario acepta o rechaza.';

CREATE INDEX IF NOT EXISTS bank_movement_match_suggestions_movement_idx
  ON public.bank_movement_match_suggestions (bank_movement_id, status);

CREATE INDEX IF NOT EXISTS bank_movement_match_suggestions_ws_idx
  ON public.bank_movement_match_suggestions (workspace_id, status);

CREATE INDEX IF NOT EXISTS bank_movement_match_suggestions_candidate_idx
  ON public.bank_movement_match_suggestions (workspace_id, candidate_type, candidate_id)
  WHERE candidate_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_bank_movement_match_suggestions_updated_at ON public.bank_movement_match_suggestions;
CREATE TRIGGER trg_bank_movement_match_suggestions_updated_at
  BEFORE UPDATE ON public.bank_movement_match_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_set_updated_at();

-- Fuerza workspace_id desde la sesión JWT (defensa en profundidad). Bypass service_role.
DROP TRIGGER IF EXISTS trg_bank_movement_match_suggestions_force_workspace ON public.bank_movement_match_suggestions;
CREATE TRIGGER trg_bank_movement_match_suggestions_force_workspace
  BEFORE INSERT OR UPDATE ON public.bank_movement_match_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.bank_movement_match_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_movement_match_suggestions_select" ON public.bank_movement_match_suggestions;
CREATE POLICY "bank_movement_match_suggestions_select"
  ON public.bank_movement_match_suggestions
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "bank_movement_match_suggestions_insert" ON public.bank_movement_match_suggestions;
CREATE POLICY "bank_movement_match_suggestions_insert"
  ON public.bank_movement_match_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "bank_movement_match_suggestions_update" ON public.bank_movement_match_suggestions;
CREATE POLICY "bank_movement_match_suggestions_update"
  ON public.bank_movement_match_suggestions
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());

-- ─── daily_tasks ─────────────────────────────────────────────────────────────
-- Lista operativa diaria por usuario, filtrada por permisos de módulo.

CREATE TABLE IF NOT EXISTS public.daily_tasks (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID          NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  assigned_to_user_id UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  title               TEXT          NOT NULL   CHECK (trim(title) <> ''),
  description         TEXT          NULL,
  module_key          TEXT          NOT NULL   CHECK (trim(module_key) <> ''),
  source_type         TEXT          NULL,
  source_id           UUID          NULL,
  priority            TEXT          NOT NULL   DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  status              TEXT          NOT NULL   DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'postponed', 'cancelled')),
  due_date            DATE          NULL,
  completed_at        TIMESTAMPTZ   NULL,
  completed_by        UUID          NULL REFERENCES public.app_users(id) ON DELETE SET NULL,
  action_url          TEXT          NULL,
  metadata            JSONB         NOT NULL   DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ   NOT NULL   DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL   DEFAULT now()
);

COMMENT ON TABLE public.daily_tasks IS
  'Sprint A tareas: lista operativa diaria por usuario. module_key limita visibilidad según permisos.';

CREATE INDEX IF NOT EXISTS daily_tasks_ws_status_idx
  ON public.daily_tasks (workspace_id, status, due_date);

CREATE INDEX IF NOT EXISTS daily_tasks_assignee_idx
  ON public.daily_tasks (workspace_id, assigned_to_user_id, status)
  WHERE assigned_to_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS daily_tasks_ws_module_idx
  ON public.daily_tasks (workspace_id, module_key);

CREATE INDEX IF NOT EXISTS daily_tasks_ws_due_idx
  ON public.daily_tasks (workspace_id, due_date)
  WHERE due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS daily_tasks_source_idx
  ON public.daily_tasks (workspace_id, source_type, source_id)
  WHERE source_type IS NOT NULL;

DROP TRIGGER IF EXISTS trg_daily_tasks_updated_at ON public.daily_tasks;
CREATE TRIGGER trg_daily_tasks_updated_at
  BEFORE UPDATE ON public.daily_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_set_updated_at();

-- Fuerza workspace_id desde la sesión JWT (defensa en profundidad). Bypass service_role.
-- La función es genérica pese al nombre "treasury": solo fija new.workspace_id.
DROP TRIGGER IF EXISTS trg_daily_tasks_force_workspace ON public.daily_tasks;
CREATE TRIGGER trg_daily_tasks_force_workspace
  BEFORE INSERT OR UPDATE ON public.daily_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_treasury_row_force_workspace();

ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_tasks_select" ON public.daily_tasks;
CREATE POLICY "daily_tasks_select"
  ON public.daily_tasks
  FOR SELECT TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "daily_tasks_insert" ON public.daily_tasks;
CREATE POLICY "daily_tasks_insert"
  ON public.daily_tasks
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());

DROP POLICY IF EXISTS "daily_tasks_update" ON public.daily_tasks;
CREATE POLICY "daily_tasks_update"
  ON public.daily_tasks
  FOR UPDATE TO authenticated
  USING (workspace_id = public.copilot_current_workspace_company_id())
  WITH CHECK (workspace_id = public.copilot_current_workspace_company_id());
