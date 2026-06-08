-- =============================================================================
-- POST-DEPLOY CLEANUP — diferencias residuales audit:zeta-pdf-parity
-- SOLO PROPUESTA. Ejecutar SELECT de verificación antes de cualquier UPDATE.
-- NO aplicar en producción sin confirmar contra Zeta live / PDF.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) DIFF_OPENING (11 clientes) — historial pre-2026 duplica ledger_opening_balance
--
-- Causa: ledger_opening_balance_* ya contiene el "Saldo anterior" del PDF Zeta,
-- pero las facturas pre-2026-01-01 siguen activas en proto_invoices.
-- getPreviousBalance() usa running balance pre-período → opening ≈ 2× PDF.
--
-- Clientes: sin movimientos en 2026; solo saldo estático en PDF.
-- Acción segura: archivar facturas pre-período (is_active=false), NO borrar.
-- -----------------------------------------------------------------------------

-- Verificación previa (debe mostrar delta = net pre-2026 por cliente):
/*
SELECT c."Codigo", c."RazonSocial",
       c.ledger_opening_balance_uyu AS ob_uyu,
       c.ledger_opening_balance_usd AS ob_usd,
       COUNT(i.id) FILTER (WHERE i.issue_date < '2026-01-01') AS inv_pre_2026,
       COALESCE(SUM(i.total_amount) FILTER (WHERE i.issue_date < '2026-01-01'), 0) AS debe_pre_2026
FROM proto_companies c
LEFT JOIN proto_invoices i ON i.company_id = c.id AND i.is_active = true
WHERE c."Codigo" IN ('60','67','121','158','85','125','149','151','157','170','171')
  AND c.workspace_company_id = :workspace_id
GROUP BY c.id
ORDER BY c."Codigo"::int;
*/

-- Archivar facturas pre-2026 solo para clientes con opening ledger cargado
-- y sin actividad en período 2026 (validado en diagnóstico 2026-06-08).
/*
UPDATE proto_invoices i
SET is_active = false,
    archived_at = COALESCE(archived_at, now()),
    updated_at = now()
FROM proto_companies c
WHERE i.company_id = c.id
  AND c.workspace_company_id = :workspace_id
  AND c."Codigo" IN ('60','67','121','158','85','125','149','151','157','170','171')
  AND i.issue_date < '2026-01-01'
  AND i.is_active = true
  AND (
    (c."Codigo" IN ('60','67','121','158') AND c.ledger_opening_balance_usd IS NOT NULL)
    OR (c."Codigo" IN ('85','125','149','151','157','170','171') AND c.ledger_opening_balance_uyu IS NOT NULL)
  );
*/

-- -----------------------------------------------------------------------------
-- B) Nirmex UYU (cod 90) — recibo duplicado mayo 2026
--
-- Copilot tiene dos recibos por 17.080:
--   A-753 / ZETA:COB:2716 / 2026-05-15  ← extra (no en PDF Zeta)
--   A-771 / ZETA:COB:2736 / 2026-05-20  ← en PDF Zeta
--
-- Acción: confirmar en Zeta QueryComprobantes que 2716 no existe/está anulado;
-- luego archivar el recibo local duplicado.
-- -----------------------------------------------------------------------------

-- Verificación:
/*
SELECT id, receipt_number, reference, amount, receipt_date, is_active, notes
FROM proto_receipts r
JOIN proto_companies c ON c.id = r.company_id
WHERE c."Codigo" = '90'
  AND c.workspace_company_id = :workspace_id
  AND r.receipt_date BETWEEN '2026-05-01' AND '2026-05-31'
  AND r.amount = 17080
ORDER BY r.receipt_date;
*/

-- Archivar solo si Zeta live confirma ausencia/anulación de RegistroId 2716:
/*
UPDATE proto_receipts r
SET is_active = false,
    archived_at = COALESCE(archived_at, now()),
    updated_at = now()
FROM proto_companies c
WHERE r.company_id = c.id
  AND c."Codigo" = '90'
  AND c.workspace_company_id = :workspace_id
  AND r.receipt_number = 'ZETA:COB:2716';
*/

-- -----------------------------------------------------------------------------
-- C) Trexys USD (cod 182) — recibo A614 / 690.47 faltante
--
-- PDF Zeta: 2026-03-09 A614 H=690.47
-- DB local: sin recibo marzo 2026 (solo ene, feb, may).
--
-- Acción: re-sync recibos Zeta (NO SQL manual). Ejemplo:
--   npx tsx scripts/audit-zeta-receipts-divergence.ts --mes 3 --anio 2026
-- Luego sync pipeline habitual de collection receipts para cliente 182.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- D) PRESTIS UYU (cod 185) — factura mar/2026 faltante (~9.760)
--
-- Secuencia local: A2712 (feb-03), A2743 (feb-05), salto → A2837 (abr-03).
-- PDF Zeta: 14 movimientos; Copilot: 13. Falta CCV1 ~2026-03-04 D=9760.
--
-- Acción: re-sync facturas Zeta cliente 185 / rango mar-2026:
--   npx tsx scripts/audit-zeta-invoice-drift.ts (o sync CCV1 incremental)
-- NO inventar fila manual sin RegistroId Zeta.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- E) Dolby UYU (cod 187) — redondeo centavos (no requiere SQL)
--
-- debe: 122.205 vs 122.206,10 (Δ 1,10)
-- haber: 123.205 vs 123.205,61 (Δ 0,61)
-- final: -1.000 vs -999,51 (Δ 0,49)
-- Causa: micro-facturas con centavos en CCV1 vs enteros en PDF parseado.
-- Clasificación: WARNING / rounding menor — no bloqueante.
-- -----------------------------------------------------------------------------
