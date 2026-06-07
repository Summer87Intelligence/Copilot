-- =============================================================================
-- proto_companies — opening balance per currency for ledger/account statement
--
-- These columns store a historical baseline balance that cannot be reconstructed
-- from proto_invoices/proto_receipts alone (e.g. pre-sync receipts for clients
-- that had activity before Copilot started syncing).
--
-- Setting:
--   - Set via Supabase dashboard, admin script, or future UI feature.
--   - NULL (default) = treat as 0 (backward-compatible).
--   - Positive = client had outstanding debt before sync window.
--   - Negative = client had a credit (paid more than invoiced) before sync window.
--
-- Used by: buildClientAccountStatement({ openingBalanceUyu, openingBalanceUsd })
-- =============================================================================

alter table public.proto_companies
  add column if not exists ledger_opening_balance_uyu numeric default null,
  add column if not exists ledger_opening_balance_usd numeric default null;

comment on column public.proto_companies.ledger_opening_balance_uyu is
  'Saldo UYU anterior al primer movimiento registrado. NULL = sin saldo previo conocido (trata como 0).';

comment on column public.proto_companies.ledger_opening_balance_usd is
  'Saldo USD anterior al primer movimiento registrado. NULL = sin saldo previo conocido (trata como 0).';
