# Banco — Regla permanente: el saldo de cuenta nunca es parte de un movimiento

**Estado: regla arquitectónica permanente del módulo Banco (importación bancaria).**
Aplica a todo banco y todo formato de extracto, presentes y futuros — no es una
corrección puntual de Santander PDF, es un principio del pipeline de importación.

## Regla funcional

La información correspondiente al **saldo de la cuenta bancaria** (el monto que
queda en la cuenta después de un movimiento, o al abrir/cerrar un extracto) **no
forma parte de un movimiento bancario**. Un movimiento es una operación puntual
(fecha, importe, dirección, referencia, contraparte); el saldo es un atributo de
la **cuenta**, no de la operación.

Por lo tanto, durante cualquier importación de extractos (PDF, Excel, o
cualquier formato futuro), toda referencia al saldo debe eliminarse durante la
**normalización**, antes de persistir el movimiento — para todos los bancos
actuales y futuros.

### Debe eliminarse

- Saldo final / Saldo final: <valor>
- Saldo inicial
- Saldo disponible
- Saldo contable
- Nuevo saldo
- Balance
- Closing balance
- Opening balance
- Available balance
- Ledger balance
- Cualquier variante equivalente detectada (nuevos bancos suman su variante al
  helper único — ver "Reutilización" abajo, nunca duplicando lógica).

También se elimina el **valor numérico del saldo cuando aparece duplicado**
inmediatamente antes o después de esas expresiones (patrón real de extractos
Santander: la columna "saldo corrido" de la fila se repite después de la
etiqueta de cierre).

**Ejemplo real:**

```
Entrada:
24/07/2026 499897 CREDITO OPERACION EN BANCA DIGITAL ... 122,00 5.969,41 Saldo final 5.969,41

Resultado:
24/07/2026 499897 CREDITO OPERACION EN BANCA DIGITAL ... 122,00
```

### Debe conservarse (nunca se toca)

- fecha
- descripción comercial / concepto
- referencia / número de operación
- importe real del movimiento
- moneda
- dirección (ingreso/egreso)
- banco
- cliente identificado
- cualquier otro dato útil para conciliación

## Principio arquitectónico

La eliminación del saldo se hace **una única vez, en la capa de
normalización/importación** — nunca como responsabilidad de otra capa. En
concreto:

- **No depende de** frontend, permisos, usuario, rol, CSS, ni de ninguna
  sanitización visual posterior. El dato simplemente **no se persiste** como
  parte del movimiento — no es algo que se oculte después de guardado.
- Corre **antes de persistir**, en el builder compartido por todos los
  importadores: `buildMovementInsertFromPreview`
  (`lib/bank-movements/santander-bank-statement-import-service.ts`).
- No altera la identidad de deduplicación del movimiento (`dedupe_key`,
  `canonical_fingerprint`, `fingerprint_v1` siguen calculándose sobre el texto
  original del parser, sin sanear) — así un extracto ya importado antes de
  esta regla se sigue reconociendo como duplicado si se reimporta.

Es distinto (y complementario, no redundante) de la capa de privacidad por
scope (`lib/bank-movements/bank-movement-balance-privacy.ts`), que resuelve un
problema diferente: el campo **estructurado** `metadata.balance` (saldo
corrido, numérico, usado para validar consistencia fila a fila) sigue
existiendo y sigue siendo legítimo para lectores con acceso completo — solo se
oculta para el scope `inflow_readonly`. La regla de esta página es sobre
**texto libre embebido en la descripción**, y aplica siempre, para todos.

## Reutilización — un único helper

`sanitizeBankMovementDescription` (`lib/bank-movements/sanitize-bank-movement-
description.ts`) es el **único** helper de normalización de descripciones
bancarias del proyecto. Todo importador debe reutilizarlo — está prohibido
duplicar expresiones regulares o lógica de limpieza de saldo en otro archivo.

**Consumidores actuales** (ambos vía `buildMovementInsertFromPreview`, el
mismo builder para los dos):

- Santander PDF (`santander-pdf-parser.ts` / `santander-pdf-statement-parser.ts`)
- Santander Excel consolidado (`santander-excel-consolidated-parser.ts`)

**Cualquier banco o formato nuevo** (otro banco, otro país, CSV, OFX, API
bancaria directa, etc.) que se integre a futuro **debe** producir movimientos
con la forma `SantanderParsedBankMovement`-equivalente y pasar por
`buildMovementInsertFromPreview` (o un builder que reutilice explícitamente
`sanitizeBankMovementDescription`) — nunca persistir directamente sin pasar
por esta normalización.

## Datos históricos

Los registros ya persistidos **antes** de que esta regla existiera pueden
tener el patrón contaminando `raw_description` (confirmado con extractos
reales de julio 2026: 5 filas de 1032 en `bank_movements`, la última fila de
cada extracto — el bug estaba en cómo el parser PDF arma el bloque de texto
crudo del último movimiento, sin una fecha siguiente que lo corte).

Estos casos se tratan **siempre** mediante un proceso de limpieza controlado y
auditado: SELECT read-only de auditoría → backup lógico → UPDATE acotado por
id + valor exacto → validación → COMMIT/ROLLBACK explícito. Nunca un UPDATE
masivo ni automático. Ver
`supabase/bank-movements-strip-embedded-balance-raw-description.sql` como
plantilla real ya aplicada.

La normalización hacia adelante (este documento) y la limpieza de datos
históricos son procesos **separados** — corregir el importador nunca implica
que los datos ya importados quedaron corregidos solos.

## Cobertura de tests

`lib/bank-movements/sanitize-bank-movement-description.test.ts` — variantes en
español e inglés, con/sin dos puntos, saltos de línea, moneda UYU/USD pegada a
la etiqueta, orden alterado por OCR, valor duplicado antes/después, y casos de
no-regresión (referencias numéricas legítimas, importes cercanos a una
etiqueta de saldo que no deben tocarse).

`lib/bank-movements/santander-bank-statement-import-service.test.ts` — prueba
de extremo a extremo con el fixture real que reproduce el bug histórico
(PDF) y un caso sintético defensivo (Excel), confirmando que el resultado
final persistido (`description` + `raw_description`) queda limpio y el
importe real no se altera.
