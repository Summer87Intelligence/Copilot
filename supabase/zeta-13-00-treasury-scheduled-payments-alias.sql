-- =============================================================================
-- Pagos programados de tesorería — alias documental (NO crear tabla nueva)
-- =============================================================================
-- El modelo canónico es `public.planned_cash_obligations` (ZETA-11-04).
-- La API y la UI de "Pagos futuros" / `scheduled-payments` leen y escriben ahí.
--
-- Mapeo conceptual treasury_scheduled_payments → planned_cash_obligations:
--   name        → title
--   category    → obligation_type (tax, bps, dgi, salary, supplier, rent, loan, service, other)
--   currency    → currency_code
--   amount      → amount_estimated
--   due_date    → due_date
--   status      → planned|confirmed ≈ scheduled; paid; cancelled; overdue (derivado)
--   recurrence  → recurrence
--   source      → source
--   notes       → notes
--
-- RLS, índices y triggers: ver zeta-11-04-planned-cash-obligations.sql
-- =============================================================================

comment on table public.planned_cash_obligations is
  'ZETA-11/13: obligaciones y pagos programados de tesorería (egresos futuros manuales).';
