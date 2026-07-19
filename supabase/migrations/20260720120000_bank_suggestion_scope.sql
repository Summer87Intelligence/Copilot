-- BANK-HISTORICAL-SHADOW-PERSIST-POLICY-001
--
-- Separación ESTRUCTURADA de ámbito para las sugerencias shadow. Hasta ahora la
-- distinción operativo/histórico vivía SOLO en `warnings` (JSON). Esta migración
-- agrega una columna canónica y consultable `suggestion_scope` para aislar:
--
--   operational       → flujo post-corte normal (comportamiento actual).
--   historical_review → movimiento [2026-01-01, 2026-07-01): audit-only, REVIEW/UNIDENTIFIED,
--                        nunca AUTO, no genera tarea/alerta/notificación/conciliación.
--   matched_audit     → movimiento `matched` analizado explícitamente (reservado; contrato futuro).
--
-- ADITIVA e INMUTABLE. No editar/reaplicar. NO APLICAR sin autorización explícita.
-- No borra datos. Compatible con las filas existentes (quedan `operational`).
-- Ajusta el índice de idempotencia para que los ámbitos NO colisionen entre sí.

-- ── Columna de ámbito (default seguro: operational) ──────────────────────────
ALTER TABLE public.bank_reconciliation_suggestions
  ADD COLUMN IF NOT EXISTS suggestion_scope TEXT NOT NULL DEFAULT 'operational';

-- Backfill explícito (las filas existentes ya reciben 'operational' por el DEFAULT;
-- este UPDATE es idempotente y documenta la intención). Incluye las 5 sugerencias
-- actuales (2 de ellas creadas sobre movimientos `matched` ANTES de la política
-- matched: NO se reclasifican a matched_audit en esta fase; quedan operational y su
-- tratamiento separado se decide aparte).
UPDATE public.bank_reconciliation_suggestions
  SET suggestion_scope = 'operational'
  WHERE suggestion_scope IS NULL OR suggestion_scope NOT IN ('operational','historical_review','matched_audit');

-- CHECK con nombre estable (constraint separado para poder evolucionar el dominio).
ALTER TABLE public.bank_reconciliation_suggestions
  DROP CONSTRAINT IF EXISTS brs_suggestion_scope_check;
ALTER TABLE public.bank_reconciliation_suggestions
  ADD CONSTRAINT brs_suggestion_scope_check
  CHECK (suggestion_scope IN ('operational','historical_review','matched_audit'));

COMMENT ON COLUMN public.bank_reconciliation_suggestions.suggestion_scope IS
  'Ámbito canónico de la sugerencia: operational (post-corte) | historical_review (< 2026-07-01, audit-only, nunca AUTO, sin trabajo operativo) | matched_audit (reservado). No confundir con `status` (ciclo de vida).';

-- ── Idempotencia por ÁMBITO ──────────────────────────────────────────────────
-- Antes: UNA sugerencia activa por (workspace, movimiento, engine_version).
-- Ahora: incluye suggestion_scope → operativo e histórico (y futuro matched_audit)
-- son entradas independientes; una operational NUNCA sobrescribe una historical_review
-- ni viceversa. En la práctica cada movimiento tiene un solo ámbito (por su fecha),
-- así que el reemplazo del índice NO puede violar unicidad con los datos existentes.
DROP INDEX IF EXISTS public.brs_active_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS brs_active_scope_uidx
  ON public.bank_reconciliation_suggestions (workspace_id, bank_movement_id, engine_version, suggestion_scope)
  WHERE status IN ('generated','pending_review');

-- Índice para consultas filtradas por ámbito (listOperational/listHistoricalReview).
CREATE INDEX IF NOT EXISTS brs_ws_scope_status_idx
  ON public.bank_reconciliation_suggestions (workspace_id, suggestion_scope, status);

-- RLS: las políticas existentes son por workspace (agnósticas de columna); la nueva
-- columna queda cubierta sin cambios de policy. Grants sin cambios.

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP INDEX IF EXISTS public.brs_active_scope_uidx;
--   DROP INDEX IF EXISTS public.brs_ws_scope_status_idx;
--   CREATE UNIQUE INDEX brs_active_uidx ON public.bank_reconciliation_suggestions
--     (workspace_id, bank_movement_id, engine_version) WHERE status IN ('generated','pending_review');
--   ALTER TABLE public.bank_reconciliation_suggestions DROP CONSTRAINT IF EXISTS brs_suggestion_scope_check;
--   ALTER TABLE public.bank_reconciliation_suggestions DROP COLUMN IF EXISTS suggestion_scope;
