-- Validación: facturas Zeta (CCV1) enero 2026 vs saldo en Copilot
--
-- Diagnóstico servidor (Next.js): `ZETA_SALDOS_DIAG=1` en el entorno y repetir POST
-- `sync-saldos-pendientes`; en logs buscar líneas JSON con `"message":"zeta_saldos_diag_..."`.
--
-- Orden operativo:
--   1) Sync customer vouchers (enero 2026, mismo cliente).
--   2) Sync saldos pendientes hasta corrida completa (IsLastPage).
--   3) Editar los UUID en cada CTE `params` y ejecutar cada consulta por separado.
--
-- workspace_company_id = tenant (public.companies.id)
-- proto_company_id     = cliente (proto_companies.id)

-- --- Consulta 1: listado enero 2026 ---
WITH params AS (
  SELECT
    '00000000-0000-4000-8000-000000000000'::uuid AS workspace_company_id,
    '00000000-0000-4000-8000-000000000001'::uuid AS proto_company_id
)
SELECT
  pi.id,
  pi.invoice_number,
  pi.issue_date,
  pi.total_amount,
  pi.balance_amount,
  pi.status,
  pi.category
FROM public.proto_invoices pi
CROSS JOIN params p
WHERE pi.workspace_company_id = p.workspace_company_id
  AND pi.company_id = p.proto_company_id
  AND pi.is_active IS TRUE
  AND pi.invoice_number LIKE 'ZETA:CCV1:%'
  AND pi.issue_date >= DATE '2026-01-01'
  AND pi.issue_date < DATE '2026-02-01'
ORDER BY pi.issue_date, pi.invoice_number;

-- --- Consulta 2: enero 2026 con saldo > 0 (pendientes según Copilot) ---
WITH params AS (
  SELECT
    '00000000-0000-4000-8000-000000000000'::uuid AS workspace_company_id,
    '00000000-0000-4000-8000-000000000001'::uuid AS proto_company_id
)
SELECT
  pi.id,
  pi.invoice_number,
  pi.issue_date,
  pi.total_amount,
  pi.balance_amount,
  pi.status
FROM public.proto_invoices pi
CROSS JOIN params p
WHERE pi.workspace_company_id = p.workspace_company_id
  AND pi.company_id = p.proto_company_id
  AND pi.is_active IS TRUE
  AND pi.invoice_number LIKE 'ZETA:CCV1:%'
  AND pi.issue_date >= DATE '2026-01-01'
  AND pi.issue_date < DATE '2026-02-01'
  AND ABS(COALESCE(pi.balance_amount, 0)) > 0.000001
ORDER BY pi.balance_amount DESC, pi.invoice_number;

-- --- Consulta 3: saldo cero pero no paid (anomalía post-saldos; excluye cancelled) ---
WITH params AS (
  SELECT
    '00000000-0000-4000-8000-000000000000'::uuid AS workspace_company_id,
    '00000000-0000-4000-8000-000000000001'::uuid AS proto_company_id
)
SELECT
  pi.id,
  pi.invoice_number,
  pi.issue_date,
  pi.balance_amount,
  pi.status
FROM public.proto_invoices pi
CROSS JOIN params p
WHERE pi.workspace_company_id = p.workspace_company_id
  AND pi.company_id = p.proto_company_id
  AND pi.is_active IS TRUE
  AND pi.invoice_number LIKE 'ZETA:CCV1:%'
  AND pi.issue_date >= DATE '2026-01-01'
  AND pi.issue_date < DATE '2026-02-01'
  AND ABS(COALESCE(pi.balance_amount, 0)) <= 0.000001
  AND pi.status IS DISTINCT FROM 'paid'
  AND pi.status IS DISTINCT FROM 'cancelled'
ORDER BY pi.invoice_number;
