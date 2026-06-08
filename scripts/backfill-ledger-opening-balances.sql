-- =============================================================================
-- Backfill: ledger_opening_balance_uyu / ledger_opening_balance_usd
--
-- Fuente: PDFs Zeta "Estado de Cuenta" exportados 07/06/2026 20:41–20:42
--   UYU: audits/zeta/250218923-U1-EstadosCuentaClientes-2026-06-07-20-41-38-11888.pdf
--   USD: audits/zeta/250218923-U1-EstadosCuentaClientes-2026-06-07-20-42-15-31709.pdf
--
-- Período PDF: 01/01/2026 – 31/12/2026
-- Valores = fila "Saldo anterior..." del PDF (audit:zeta-pdf-parity).
--
-- CORRECCIÓN vs backfill anterior (2026-06-07 tarde):
--   El backfill previo duplicó openings (usó saldo post-primer-movimiento en lugar
--   de "Saldo anterior"). Ejemplos corregidos:
--     Remiplat 107: 193248 → 96624
--     ARROYAL 169: 48800 → 24400
--     ALKITODO 174: 29280 → 14640
--     Aquatech 162: 16592 → 6832
--     Lombardo 155: 14720 → 80
--     Consumidor Final 1 USD: 399 → -28
--     Vilcabamba 137 USD: 1115 → -679.60
--     Margot Morales 74 / Mill Vonmetzen 150: limpiar (PDF opening = 0)
--
-- Matching: por proto_companies."Codigo" (Zeta) — más fiable que nombre.
--
-- Idempotente: re-ejecutar solo actualiza filas donde el valor difiere.
-- =============================================================================

BEGIN;

-- ── UYU ───────────────────────────────────────────────────────────────────────

WITH target_uyu (codigo, amount) AS (
  VALUES
  ('38',   -700::numeric),      -- Estudio Fletcher SAS
  ('15',   -20::numeric),       -- Botica del Señor SRL
  ('43',   -10600::numeric),    -- Florencia Caitan Gallo
  ('78',   1830::numeric),      -- María Magdalena Antognazza Scarone
  ('85',   4880::numeric),      -- MORAES IRIBARREN
  ('107',  96624::numeric),     -- Remiplat SA
  ('125',  24160::numeric),     -- Steineck y Steineck SH
  ('149',  17080::numeric),     -- Reyes Peña Ana Lucia
  ('151',  42944::numeric),     -- Barraca de Fuegos
  ('155',  80::numeric),        -- Lombardo Silva Asociadas
  ('157',  19520::numeric),     -- Dura Villar Santiago Gabriel
  ('160',  240::numeric),       -- MOVEX
  ('161',  30000::numeric),     -- Siempre Conviene S.A.S.
  ('162',  6832::numeric),      -- Aquatech / Legoland
  ('169',  24400::numeric),     -- ARROYAL SOCIEDAD ANONIMA
  ('170',  7320::numeric),      -- Tsunami
  ('171',  15860::numeric),     -- PESSOLANO GALLO
  ('174',  14640::numeric),     -- ALKITODO
  ('185',  -12009::numeric),    -- PRESTIS SAS
  ('200',  -7320::numeric)      -- Varios
),
matched AS (
  SELECT pc.id, t.amount, t.codigo
  FROM target_uyu t
  JOIN proto_companies pc ON trim(pc."Codigo") = t.codigo
  WHERE pc.id != pc.workspace_company_id
    -- AND pc.workspace_company_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
)
UPDATE proto_companies AS pc
SET ledger_opening_balance_uyu = m.amount
FROM matched m
WHERE pc.id = m.id
  AND pc.ledger_opening_balance_uyu IS DISTINCT FROM m.amount;

-- Limpiar UYU erróneos (opening PDF = 0 → NULL)
UPDATE proto_companies AS pc
SET ledger_opening_balance_uyu = NULL
WHERE trim(pc."Codigo") IN ('13','36','144','156','90','59','110','187')
  AND pc.ledger_opening_balance_uyu IS NOT NULL
  AND pc.id != pc.workspace_company_id;

-- ── USD ───────────────────────────────────────────────────────────────────────

WITH target_usd (codigo, amount) AS (
  VALUES
  ('1',    -28::numeric),       -- Consumidor Final
  ('2',    30.35::numeric),     -- ACQUAGARDEN
  ('31',   366::numeric),       -- Dilmostar S.A
  ('33',   -298.90::numeric),   -- DOBSURA CORPORATION SA
  ('34',   122::numeric),       -- Domingo Pizzinat srl
  ('60',   329.40::numeric),    -- HECTOR MARTIN DIAZ AMARILLA
  ('67',   127.72::numeric),    -- Isaias Rodriguez
  ('77',   170.80::numeric),    -- Maria Eva Pose
  ('109',  -199.95::numeric),   -- RIOS ESPINOSA ALBERTO DANIEL
  ('121',  2597::numeric),       -- SELLERUY SAS
  ('129',  610::numeric),       -- Suprasur S.A.
  ('137',  -679.60::numeric),   -- Vilcabamba SRL
  ('158',  463.60::numeric),     -- Olmos Silveira Paula Cristina
  ('181',  -122::numeric),      -- Atántico Solution
  ('182',  1171.20::numeric)    -- Trexys Consultores S.A.S.
),
matched AS (
  SELECT pc.id, t.amount, t.codigo
  FROM target_usd t
  JOIN proto_companies pc ON trim(pc."Codigo") = t.codigo
  WHERE pc.id != pc.workspace_company_id
)
UPDATE proto_companies AS pc
SET ledger_opening_balance_usd = m.amount
FROM matched m
WHERE pc.id = m.id
  AND pc.ledger_opening_balance_usd IS DISTINCT FROM m.amount;

-- Limpiar USD erróneos (PDF opening = 0 → NULL)
UPDATE proto_companies AS pc
SET ledger_opening_balance_usd = NULL
WHERE trim(pc."Codigo") IN ('74','150','35','78','83','90','106','114','178','188','190','191','192','187')
  AND pc.ledger_opening_balance_usd IS NOT NULL
  AND pc.id != pc.workspace_company_id;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================

SELECT
  "Codigo",
  name,
  ledger_opening_balance_uyu AS ob_uyu,
  ledger_opening_balance_usd AS ob_usd
FROM public.proto_companies
WHERE ledger_opening_balance_uyu IS NOT NULL
   OR ledger_opening_balance_usd IS NOT NULL
ORDER BY "Codigo"::int NULLS LAST;
