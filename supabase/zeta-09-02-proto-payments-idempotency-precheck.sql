-- =============================================================================
-- ZETA-09-02 PRE-CHECK — ejecutar ANTES de aplicar zeta-09-02 migration
-- =============================================================================
-- 1. Duplicados activos (cualquier payment_number)
SELECT workspace_company_id, payment_number, COUNT(*) AS cnt
FROM public.proto_payments
WHERE payment_number IS NOT NULL
GROUP BY workspace_company_id, payment_number
HAVING COUNT(*) > 1;

-- 2. Duplicados Zeta (todos los estados)
SELECT workspace_company_id, payment_number, COUNT(*) AS cnt
FROM public.proto_payments
WHERE payment_number LIKE 'ZETA:PAG:%'
GROUP BY workspace_company_id, payment_number
HAVING COUNT(*) > 1;

-- 3. Duplicados Zeta activos (bloquean el unique parcial)
SELECT workspace_company_id, payment_number, COUNT(*) AS cnt
FROM public.proto_payments
WHERE payment_number LIKE 'ZETA:PAG:%'
  AND is_active IS TRUE
GROUP BY workspace_company_id, payment_number
HAVING COUNT(*) > 1;

-- 4. payment_number nulos (columna es NOT NULL; debe ser 0)
SELECT COUNT(*) AS null_payment_number_count
FROM public.proto_payments
WHERE payment_number IS NULL;

-- 5. Total pagos Zeta
SELECT COUNT(*) AS zeta_payments_total
FROM public.proto_payments
WHERE payment_number LIKE 'ZETA:PAG:%';

-- 6. Pagos manuales (muestra; no bloquean índice parcial)
SELECT COUNT(*) AS manual_payments_total
FROM public.proto_payments
WHERE payment_number IS NOT NULL
  AND payment_number NOT LIKE 'ZETA:PAG:%';
