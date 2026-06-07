-- =============================================================================
-- Backfill: ledger_opening_balance_uyu / ledger_opening_balance_usd
--
-- Fuente: PDFs Zeta "Estado de Cuenta" generados el 07/06/2026.
--   UYU: 250218923-U1-EstadosCuentaClientes-2026-06-07-17-14-30-9170.pdf
--   USD: 250218923-U1-EstadosCuentaClientes-2026-06-07-17-13-46-68245.pdf
--
-- Propósito:
--   Fijar los saldos anteriores detectados en los PDFs Zeta (fila "Saldo anterior...")
--   para clientes cuya historia pre-2026 no está en proto_receipts/proto_invoices.
--
-- Cómo usar:
--   1. Abrir Supabase → SQL Editor.
--   2. (Opcional) filtrar por workspace: descomentar el filtro AND pc.workspace_company_id = '...'
--      y reemplazar con el UUID del workspace. Obtenerlo con:
--        SELECT DISTINCT workspace_company_id FROM proto_companies LIMIT 5;
--   3. Ejecutar el script completo.
--   4. Ejecutar la consulta de verificación al final.
--
-- Idempotencia:
--   El script es idempotente: re-ejecutar solo sobreescribe si el valor cambia.
--   Para resetear a NULL: UPDATE proto_companies SET ledger_opening_balance_uyu = NULL WHERE ...;
--
-- Matching:
--   Compara contra: name, company_name, "RazonSocial", "Nombre".
--   No falla si el cliente no se encuentra (0 rows updated = sin match).
--
-- CORRECCIONES respecto al backfill anterior (2026-06-07):
--   ALKITODO UYU: 14640 → 29280 (valor anterior era el monto de una cuota, no el saldo total)
--   Aquatech UYU: 6832 → 16592
--   ARROYAL SOCIEDAD ANONIMA UYU: 24400 → 48800
--   Consumidor Final USD: -28 → 399 (signo y magnitud incorrectos)
-- =============================================================================

BEGIN;

-- ── UYU ───────────────────────────────────────────────────────────────────────

WITH target_uyu (client_name, amount) AS (
  VALUES
  -- Confirmados en PDFs Zeta 07/06/2026
  ('Estudio Fletcher SAS',               -700::numeric),
  ('ALKITODO',                          29280::numeric),  -- CORRECCIÓN: era 14640
  ('Aquatech',                          16592::numeric),  -- CORRECCIÓN: era 6832
  ('ARROYAL SOCIEDAD ANONIMA',          48800::numeric),  -- CORRECCIÓN: era 24400
  ('Barraca de Fuegos',                 42944::numeric),
  ('Botica del Señor SRL',                -20::numeric),
  -- Nuevos (detectados en auditoría masiva 07/06/2026)
  ('Dura Villar Santiago Gabriel',      19520::numeric),
  ('Florencia Caitan Gallo',           -10600::numeric),
  ('Lombardo Silva Asociadas',          14720::numeric),
  ('María Magdalena Antognazza Scarone', 1830::numeric),
  ('MORAES IRIBARREN JUAN MANUEL',       4880::numeric),
  ('MOVEX',                               240::numeric),
  ('PESSOLANO GALLO MATIAS FRANCIS',    15860::numeric),
  ('PRESTIS SAS',                      -12009::numeric),
  ('Remiplat SA',                      193248::numeric),
  ('Reyes Peña Ana Lucia',              17080::numeric),
  ('Siempre Conviene S.A.S.',           30000::numeric),
  ('Steineck y Steineck SH',            24160::numeric),
  ('Tsunami',                            7320::numeric),
  ('Varios',                            -7320::numeric)
),
matched_uyu AS (
  SELECT DISTINCT ON (pc.id)
    pc.id,
    t.amount,
    t.client_name
  FROM target_uyu t
  JOIN proto_companies pc ON (
    lower(trim(coalesce(pc.name, '')))            = lower(trim(t.client_name))
    OR lower(trim(coalesce(pc.legal_name, '')))   = lower(trim(t.client_name))
    OR lower(trim(coalesce(pc."RazonSocial", ''))) = lower(trim(t.client_name))
    OR lower(trim(coalesce(pc."Nombre", '')))      = lower(trim(t.client_name))
  )
  WHERE pc.id != pc.workspace_company_id   -- excluir la empresa del workspace
    -- AND pc.workspace_company_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'  -- filtrar por tenant
)
UPDATE proto_companies AS pc
SET    ledger_opening_balance_uyu = m.amount
FROM   matched_uyu m
WHERE  pc.id = m.id
  AND  (pc.ledger_opening_balance_uyu IS DISTINCT FROM m.amount);

-- ── USD ───────────────────────────────────────────────────────────────────────

WITH target_usd (client_name, amount) AS (
  VALUES
  -- Confirmados en PDFs Zeta 07/06/2026
  ('ACQUAGARDEN',                    30.35::numeric),
  ('Atántico Solution',               -122::numeric),
  ('Consumidor Final',                 399::numeric),   -- CORRECCIÓN: era -28
  ('Dilmostar S.A',                    366::numeric),
  ('DOBSURA CORPORATION SA',        -298.90::numeric),
  -- Nuevos (detectados en auditoría masiva 07/06/2026)
  ('Domingo Pizzinat srl',             122::numeric),
  ('HECTOR MARTIN DIAZ AMARILLA',   329.40::numeric),
  ('Isaias Rodriguez',               127.72::numeric),
  ('Margot Morales',                   915::numeric),
  ('Maria Eva Pose',                 170.80::numeric),
  ('Mill Vonmetzen Karin',             366::numeric),
  ('Olmos Silveira Paula Cristina',  463.60::numeric),
  ('RIOS ESPINOSA ALBERTO DANIEL',  -199.95::numeric),
  ('SELLERUY SAS',                    2597::numeric),
  ('Suprasur S.A.',                    610::numeric),
  ('Trexys Consultores S.A.S.',      1171.20::numeric),
  ('Vilcabamba SRL',                  1115::numeric)
),
matched_usd AS (
  SELECT DISTINCT ON (pc.id)
    pc.id,
    t.amount,
    t.client_name
  FROM target_usd t
  JOIN proto_companies pc ON (
    lower(trim(coalesce(pc.name, '')))            = lower(trim(t.client_name))
    OR lower(trim(coalesce(pc.legal_name, '')))   = lower(trim(t.client_name))
    OR lower(trim(coalesce(pc."RazonSocial", ''))) = lower(trim(t.client_name))
    OR lower(trim(coalesce(pc."Nombre", '')))      = lower(trim(t.client_name))
  )
  WHERE pc.id != pc.workspace_company_id
    -- AND pc.workspace_company_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'  -- filtrar por tenant
)
UPDATE proto_companies AS pc
SET    ledger_opening_balance_usd = m.amount
FROM   matched_usd m
WHERE  pc.id = m.id
  AND  (pc.ledger_opening_balance_usd IS DISTINCT FROM m.amount);

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (ejecutar después del COMMIT o por separado)
-- Muestra todos los clientes con opening balance configurado.
-- =============================================================================

SELECT
  name,
  "RazonSocial",
  ledger_opening_balance_uyu AS ob_uyu,
  ledger_opening_balance_usd AS ob_usd,
  workspace_company_id
FROM public.proto_companies
WHERE ledger_opening_balance_uyu IS NOT NULL
   OR ledger_opening_balance_usd IS NOT NULL
ORDER BY name;

-- =============================================================================
-- DIAGNÓSTICO: clientes objetivo NO encontrados
-- Si algún nombre de la lista no aparece en la consulta de VERIFICACIÓN,
-- usar esta query para inspeccionar:
-- =============================================================================

/*
SELECT
  id,
  name,
  company_name,
  "RazonSocial",
  "Nombre",
  workspace_company_id
FROM public.proto_companies
WHERE lower(trim(coalesce(name, company_name, "RazonSocial", "Nombre", '')))
  ILIKE '%fletcher%'   -- reemplazar con el nombre a buscar
ORDER BY name;
*/
