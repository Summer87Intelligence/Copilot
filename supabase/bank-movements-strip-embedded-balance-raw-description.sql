-- =============================================================================
-- Limpieza histórica CONTROLADA y REVERSIBLE — Banco / Movimientos bancarios
-- =============================================================================
--
-- OBJETIVO
-- Eliminar de `bank_movements.raw_description` cualquier texto de saldo
-- ("Saldo final", "Saldo inicial", "Saldo disponible", "Saldo contable",
-- "Nuevo saldo", "Balance", más el valor numérico duplicado inmediatamente
-- asociado) que quedó embebido por un bug ya corregido del parser PDF
-- (`buildMovementInsertFromPreview` ahora sanea todo antes de persistir —
-- ver `lib/bank-movements/sanitize-bank-movement-description.ts`). Este
-- archivo SOLO corrige los registros que ya existían ANTES de ese fix.
--
-- NO SE EJECUTA SOLO. Generado para que lo apliques manualmente vos.
--
-- ¡¡¡ IMPORTANTE — NO CORRAS ESTE ARCHIVO DE UNA SOLA VEZ !!!
-- El SQL no puede "pausarte" solo — si pegás el archivo entero en un cliente
-- que ejecuta todo de corrido, el COMMIT del Paso B se dispara igual sin que
-- llegues a mirar las validaciones del Paso C. Ejecutalo en este orden,
-- PARANDO entre cada paso:
--   1. Paso A completo (backup) → confirmá el count = 5.
--   2. Paso B: BEGIN + los 5 UPDATE (hasta antes del COMMIT) → NO sigas.
--   3. Corré manualmente las 3 queries de validación del Paso C.
--   4. Recién ahí: si las 3 validaciones cierran bien, ejecutá el COMMIT;
--      si algo no cierra, ejecutá ROLLBACK en su lugar.
--
-- -----------------------------------------------------------------------------
-- 1) TABLA Y COLUMNA AFECTADAS
-- -----------------------------------------------------------------------------
-- Tabla:   public.bank_movements
-- Columna: raw_description (único campo con el texto sucio en los 5 casos
--          encontrados — `description` ya estaba limpia en los 5).
-- Ninguna otra tabla ni columna se toca: no `metadata`, no `amount`, no
-- `direction`, no `movement_date`, no `currency`, no `bank_reference`, no
-- `description`, no `bank_statement_imports`, no ninguna otra tabla.
--
-- -----------------------------------------------------------------------------
-- 2) CANTIDAD DE REGISTROS
-- -----------------------------------------------------------------------------
-- Total en bank_movements (todas las empresas):        1032
-- Con patrón de saldo embebido (auditoría re-confirmada
-- el mismo día de este archivo, ejecutada como SELECT
-- de solo lectura, sin cambios):                          5
-- Todas las 5 filas pertenecen al mismo workspace:
--   040321ff-10fd-4da3-aeca-f1865f879986
--
-- -----------------------------------------------------------------------------
-- 3) SELECT DE AUDITORÍA — CORRÉ ESTO PRIMERO, DE FORMA INDEPENDIENTE
-- -----------------------------------------------------------------------------
-- Read-only. Confirmá que devuelve exactamente estas 5 filas (mismos ids)
-- antes de seguir. Si aparecen MÁS de 5 filas o ids distintos, DETENÉTE — la
-- limpieza de abajo está armada para estos 5 registros puntuales, no es
-- genérica.
--
-- select
--   id,
--   workspace_id,
--   description            as descripcion_original,
--   raw_description         as raw_description_original,
--   movement_date,
--   amount,
--   currency,
--   direction,
--   bank_reference
-- from bank_movements
-- where description ilike '%saldo%'
--    or raw_description ilike '%saldo%'
--    or description ilike '%balance%'
--    or raw_description ilike '%balance%'
-- order by movement_date;
--
-- -----------------------------------------------------------------------------
-- EJEMPLOS REALES — ANTES / PROPUESTO DESPUÉS (mismos 5 registros)
-- -----------------------------------------------------------------------------
-- id faf17bf4-72ae-443c-a7d7-c217e2a0efb3 (USD 122,00, inflow, 2026-07-24):
--   ANTES:
--     24/07/2026
--     499897 CREDITO
--     OPERACION EN
--     BANCA DIGITAL
--     TEASY
--     BACCINO/DOMING
--     O PIZZINAT
--     SOCIEDAD
--     RESPONSABILIDAD
--     LIMITADA
--     122,00 5.969,41
--     Saldo final 5.969,41
--   DESPUÉS:
--     24/07/2026 499897 CREDITO OPERACION EN BANCA DIGITAL TEASY BACCINO/DOMING O PIZZINAT SOCIEDAD RESPONSABILIDAD LIMITADA 122,00
--
-- id 8f9455c6-0246-4f0c-92b3-6750a21f49e6 (USD 900,00, outflow, 2026-07-20):
--   ANTES:  "...TFCG SUMMER87\n-900,00 5.436,46\nSaldo final 5.436,46"
--   DESPUÉS: "...TFCG SUMMER87 -900,00"
--
-- (Los otros 3 casos siguen el mismo patrón — ver el UPDATE de cada uno más
-- abajo, con su valor "antes" completo en la cláusula WHERE.)
--
-- El importe real (122,00 / -900,00 / etc.), la fecha, la dirección, la
-- moneda y la referencia de banco NUNCA cambian — se ve en que ninguno de
-- los UPDATEs de abajo toca esas columnas.
--
-- =============================================================================
-- PASO A — BACKUP LÓGICO (corré esto ANTES de la transacción de limpieza)
-- =============================================================================
-- Tabla de respaldo permanente con el estado exacto de las 5 filas antes de
-- tocarlas. Sobrevive aunque la transacción de limpieza ya haya hecho COMMIT
-- — es la base del procedimiento de reversión POST-COMMIT (Paso D).

CREATE TABLE IF NOT EXISTS bank_movements_saldo_cleanup_backup_20260725 AS
SELECT
  id,
  workspace_id,
  description,
  raw_description,
  movement_date,
  amount,
  currency,
  direction,
  bank_reference,
  updated_at,
  now() AS backed_up_at
FROM bank_movements
WHERE id IN (
  '8f9455c6-0246-4f0c-92b3-6750a21f49e6',
  'bf5d9c3b-68d8-4d02-9f6b-86ffc1b79db0',
  '5480d223-1180-4243-afb8-1eea703a7152',
  'faf17bf4-72ae-443c-a7d7-c217e2a0efb3',
  'a7c8aa66-e636-4116-ba31-9e3b2298a80b'
);

-- Verificá que capturó exactamente 5 filas antes de seguir:
--   select count(*) from bank_movements_saldo_cleanup_backup_20260725;
-- Debe dar 5. Si da 0 o menos de 5, DETENÉTE — no continúes al Paso B.

-- =============================================================================
-- PASO B — TRANSACCIÓN DE LIMPIEZA (acotada a estos 5 ids, guardada por valor exacto)
-- =============================================================================
-- Cada UPDATE incluye `AND raw_description = '<valor sucio exacto>'`: es un
-- no-op si la fila ya cambió (por este mismo script corrido antes, o por
-- cualquier otro motivo) — nunca sobrescribe un valor distinto al auditado.

BEGIN;

UPDATE bank_movements
SET raw_description = '20/07/2026 362629 DEBITO OPERACION EN BANCA DIGITAL TFCG SUMMER87 -900,00'
WHERE id = '8f9455c6-0246-4f0c-92b3-6750a21f49e6'
  AND raw_description = '20/07/2026
362629 DEBITO
OPERACION EN
BANCA DIGITAL
TFCG SUMMER87
-900,00 5.436,46
Saldo final 5.436,46';

UPDATE bank_movements
SET raw_description = '23/07/2026 4992 DEBITO A CONFIRMAR BANRED COMPRA 088594 - MONTEVIDEO/BAR FACAL VIS3 - -964,66'
WHERE id = 'bf5d9c3b-68d8-4d02-9f6b-86ffc1b79db0'
  AND raw_description = '23/07/2026
4992 DEBITO A
CONFIRMAR
BANRED COMPRA
088594 -
MONTEVIDEO/BAR
FACAL VIS3 -
-964,66 713.574,18
Saldo final 713.574,18';

UPDATE bank_movements
SET raw_description = '24/07/2026 3679 DEBITO A CONFIRMAR BANRED COMPRA 510325 - MONTEVIDEO/DLO *ARCOS DORADOS UY VIS3 - -184,32'
WHERE id = '5480d223-1180-4243-afb8-1eea703a7152'
  AND raw_description = '24/07/2026
3679 DEBITO A
CONFIRMAR
BANRED COMPRA
510325 -
MONTEVIDEO/DLO
*ARCOS DORADOS
UY VIS3 -
-184,32 709.689,76
Saldo final 709.689,76';

UPDATE bank_movements
SET raw_description = '24/07/2026 499897 CREDITO OPERACION EN BANCA DIGITAL TEASY BACCINO/DOMING O PIZZINAT SOCIEDAD RESPONSABILIDAD LIMITADA 122,00'
WHERE id = 'faf17bf4-72ae-443c-a7d7-c217e2a0efb3'
  AND raw_description = '24/07/2026
499897 CREDITO
OPERACION EN
BANCA DIGITAL
TEASY
BACCINO/DOMING
O PIZZINAT
SOCIEDAD
RESPONSABILIDAD
LIMITADA
122,00 5.969,41
Saldo final 5.969,41';

UPDATE bank_movements
SET raw_description = '23/07/2026 489998 CREDITO OPERACION EN BANCA DIGITAL T--/GASPERI FABRAS JONATHAN MAXIMILIANO 30,00'
WHERE id = 'a7c8aa66-e636-4116-ba31-9e3b2298a80b'
  AND raw_description = '23/07/2026
489998 CREDITO
OPERACION EN
BANCA DIGITAL
T--/GASPERI
FABRAS JONATHAN
MAXIMILIANO
30,00 5.847,41
Saldo final 5.847,41';

-- =============================================================================
-- PASO C — VALIDÁ ACÁ, TODAVÍA DENTRO DE LA MISMA TRANSACCIÓN (sin COMMIT)
-- =============================================================================
-- Corré estas 3 queries EN LA MISMA SESIÓN/TRANSACCIÓN, antes de decidir
-- COMMIT o ROLLBACK:

-- (1) Deben ser 0 filas — ningún patrón de saldo debe quedar:
--   select count(*) from bank_movements
--   where description ilike '%saldo%' or raw_description ilike '%saldo%'
--      or description ilike '%balance%' or raw_description ilike '%balance%';

-- (2) Deben ser exactamente 5 filas modificadas y ninguna otra columna
--     distinta a raw_description debe diferir del backup:
--   select b.id,
--          b.raw_description as antes,
--          m.raw_description as despues,
--          (m.amount = b.amount)               as amount_ok,
--          (m.direction = b.direction)         as direction_ok,
--          (m.movement_date = b.movement_date) as fecha_ok,
--          (m.currency = b.currency)           as moneda_ok,
--          (m.bank_reference = b.bank_reference) as referencia_ok,
--          (m.description = b.description)     as descripcion_sin_cambios_ok
--   from bank_movements_saldo_cleanup_backup_20260725 b
--   join bank_movements m on m.id = b.id;
--   -- Las columnas *_ok deben ser TODAS true, y `despues` no debe contener "saldo".

-- (3) Confirmá que solo se tocaron estos 5 ids (nada más en el workspace o
--     en otros):
--   select count(*) from bank_movements
--   where updated_at > now() - interval '5 minutes'
--     and id not in (
--       '8f9455c6-0246-4f0c-92b3-6750a21f49e6',
--       'bf5d9c3b-68d8-4d02-9f6b-86ffc1b79db0',
--       '5480d223-1180-4243-afb8-1eea703a7152',
--       'faf17bf4-72ae-443c-a7d7-c217e2a0efb3',
--       'a7c8aa66-e636-4116-ba31-9e3b2298a80b'
--     );
--   -- Debe dar 0.

-- SI (1) da 0, (2) tiene todo en true, y (3) da 0 → seguí a COMMIT.
-- SI CUALQUIERA falla → ROLLBACK (no COMMIT).

-- Para confirmar (ejecutar SOLO si las 3 validaciones de arriba salieron bien):
COMMIT;

-- Para deshacer en su lugar, en vez del COMMIT de arriba (mientras la
-- transacción sigue abierta en la misma sesión):
-- ROLLBACK;

-- =============================================================================
-- PASO D — REVERSIÓN POST-COMMIT (solo si ya hiciste COMMIT y necesitás deshacer)
-- =============================================================================
-- El ROLLBACK de arriba SOLO funciona antes del COMMIT. Si ya confirmaste y
-- más adelante encontrás un problema, restaurá desde el backup del Paso A:
--
-- BEGIN;
-- UPDATE bank_movements m
-- SET raw_description = b.raw_description
-- FROM bank_movements_saldo_cleanup_backup_20260725 b
-- WHERE m.id = b.id;
-- -- Validá que volvió a los valores originales, después:
-- COMMIT;
--
-- =============================================================================
-- PASO E — LIMPIEZA DE LA TABLA DE BACKUP (opcional, manual, cuando estés conforme)
-- =============================================================================
-- Una vez que confirmaste el resultado y ya no la necesitás:
--   DROP TABLE bank_movements_saldo_cleanup_backup_20260725;
-- No se ejecuta automáticamente — queda como respaldo hasta que vos decidas
-- borrarla.
