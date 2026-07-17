-- FASE BANK-LOCAL-POSTGRES-VALIDATION-001 — Fixtures determinísticos (LOCAL ONLY).
-- Cargar DESPUÉS del baseline (FASE E) y de aplicar las 3 migraciones pendientes.
-- UUIDs previsibles para assertions. NO contiene datos reales ni nombres sensibles.
--
-- Workspace A = 'aaaaaaaa-...', Workspace B = 'bbbbbbbb-...'. Importes en NUMERIC.

BEGIN;

-- companies (workspaces)
INSERT INTO public.companies (id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','WS A (local test)'),
  ('bbbbbbbb-0000-0000-0000-000000000001','WS B (local test)')
ON CONFLICT DO NOTHING;

-- app_users (activo e inactivo en A; uno en B)
INSERT INTO public.app_users (id, company_id, role, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','admin',  true),
  ('aaaaaaaa-0000-0000-0000-0000000000a2','aaaaaaaa-0000-0000-0000-000000000001','usuario',false),
  ('bbbbbbbb-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000001','admin',  true)
ON CONFLICT DO NOTHING;

-- proto_companies (clientes)
INSERT INTO public.proto_companies (id, name, workspace_company_id) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000c1','Cliente A','aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-0000000000c1','Cliente B','bbbbbbbb-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- bank_movements: inflow 10.000 UYU (A), egreso, reversed, USD, y uno para WS B.
INSERT INTO public.bank_movements (id, workspace_id, amount, currency, direction, status, movement_date, description) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000m1','aaaaaaaa-0000-0000-0000-000000000001',10000,'UYU','inflow','pending','2026-07-08','MOV A 10000'),
  ('aaaaaaaa-0000-0000-0000-0000000000m2','aaaaaaaa-0000-0000-0000-000000000001', 4000,'UYU','inflow','pending','2026-07-08','MOV A2 4000'),
  ('aaaaaaaa-0000-0000-0000-0000000000m3','aaaaaaaa-0000-0000-0000-000000000001', 6000,'UYU','inflow','pending','2026-07-08','MOV A3 6000'),
  ('aaaaaaaa-0000-0000-0000-0000000000me','aaaaaaaa-0000-0000-0000-000000000001', 5000,'UYU','outflow','pending','2026-07-08','MOV egreso'),
  ('aaaaaaaa-0000-0000-0000-0000000000mr','aaaaaaaa-0000-0000-0000-000000000001', 5000,'UYU','inflow','reversed','2026-07-08','MOV reversed'),
  ('aaaaaaaa-0000-0000-0000-0000000000mu','aaaaaaaa-0000-0000-0000-000000000001', 3000,'USD','inflow','pending','2026-07-08','MOV USD'),
  ('bbbbbbbb-0000-0000-0000-0000000000m1','bbbbbbbb-0000-0000-0000-000000000001',10000,'UYU','inflow','pending','2026-07-08','MOV B 10000')
ON CONFLICT DO NOTHING;

-- proto_receipts: 10.000 UYU (A), USD, y uno para WS B.
INSERT INTO public.proto_receipts (id, workspace_company_id, company_id, amount, currency, currency_code, status, receipt_date, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000r1','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1',10000,'UYU','UYU','active','2026-07-08',true),
  ('aaaaaaaa-0000-0000-0000-0000000000ru','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000c1', 3000,'USD','USD','active','2026-07-08',true),
  ('bbbbbbbb-0000-0000-0000-0000000000r1','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-0000000000c1',10000,'UYU','UYU','active','2026-07-08',true)
ON CONFLICT DO NOTHING;

-- proto_invoices: factura A saldo 6.000, factura B saldo 4.000, USD, y una de WS B.
INSERT INTO public.proto_invoices (id, workspace_company_id, balance_amount, currency, currency_code, status) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-000000000001',6000,'UYU','UYU','open'),
  ('aaaaaaaa-0000-0000-0000-0000000000f2','aaaaaaaa-0000-0000-0000-000000000001',4000,'UYU','UYU','open'),
  ('aaaaaaaa-0000-0000-0000-0000000000fp','aaaaaaaa-0000-0000-0000-000000000001',   0,'UYU','UYU','paid'),
  ('aaaaaaaa-0000-0000-0000-0000000000fu','aaaaaaaa-0000-0000-0000-000000000001',5000,'USD','USD','open'),
  ('bbbbbbbb-0000-0000-0000-0000000000f1','bbbbbbbb-0000-0000-0000-000000000001',6000,'UYU','UYU','open')
ON CONFLICT DO NOTHING;

-- suggestions: válida (pending_review), rejected, superseded, y una de otro movimiento.
INSERT INTO public.bank_reconciliation_suggestions (id, workspace_id, bank_movement_id, proposed_client_id, proposed_receipt_id, confidence, recommended_action, status) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000s1','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000m1','aaaaaaaa-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-0000000000r1',96,'AUTO_RECONCILE_CANDIDATE','pending_review'),
  ('aaaaaaaa-0000-0000-0000-0000000000s2','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000m2',NULL,NULL,20,'REVIEW','rejected'),
  ('aaaaaaaa-0000-0000-0000-0000000000s3','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-0000000000m3',NULL,NULL,20,'REVIEW','superseded')
ON CONFLICT DO NOTHING;

COMMIT;
