# Banco — Parser de extractos Santander PDF

**FASE BANK-V3-APPLY-PDF-IMPORT-FIX-AND-DEMO-READY-001 (2026-07-21)** — reproducción y corrección
del import de PDF contra dos extractos reales de julio 2026 (cuenta USD `005101107711` y cuenta
UYU `000001211749`). Este documento describe el pipeline actual, el bug real encontrado, y los
campos nuevos que el parser expone.

> **Regla permanente relacionada:** el saldo de cuenta nunca es parte de un
> movimiento — ver
> [`bank-import-balance-normalization.md`](./bank-import-balance-normalization.md).
> El bug de "pérdida silenciosa del último movimiento" de más abajo es la
> causa raíz real de por qué "Saldo final X" terminaba embebido en
> `raw_text`; la normalización que lo limpia antes de persistir vive en
> `sanitizeBankMovementDescription` (helper único, no específico de este
> parser).

## Pipeline

```
Buffer (upload)
  → extractTextFromPdfBuffer()        lib/treasury/santander-pdf-text-extract.server.ts
    (pdf-parse → pdfjs-dist internamente; extracción LINEAL de texto, no por coordenadas X/Y)
  → normalizeSantanderPdfExtractedText()  lib/bank-movements/santander-pdf-parser.ts
    (repara fechas partidas, une líneas de descripción, retira el marcador de página de pdf-parse)
  → parseSantanderBankStatementText()     lib/bank-movements/santander-pdf-parser.ts
    → isSantanderPdfStatementText / parseSantanderPdfMetadata / parseSantanderPdfMovements
      lib/treasury/santander-pdf-statement-parser.ts
    → annotateBalanceAndDedup() (saldo por fila + fingerprint de deduplicación)
  → SantanderBankStatementParseResult (movements + balance_validation)
```

**Decisión de esta fase:** se mantuvo la extracción lineal existente (no se migró a un parser
pdfjs con coordenadas X/Y). Reproducido contra los dos PDF reales, el pipeline lineal ya
reconstruye correctamente fechas partidas, referencias partidas y descripciones multilínea vía
`parseSantanderPdfRowsByDateBlocks` (agrupación por bloques que empiezan con fecha). El único
defecto real encontrado no era de estrategia de extracción sino un caso de borde puntual (ver
abajo). Migrar a pdfjs por coordenadas queda como mejora futura opcional, no como corrección
necesaria — evita riesgo adicional en una fase con plazo de demo el mismo día.

## Bug real encontrado y corregido: pérdida silenciosa del último movimiento

**Síntoma:** al reproducir el import contra los dos PDF reales, cada extracto perdía
exactamente su último movimiento real (el inmediatamente anterior a "Saldo final").

**Causa raíz:** `pdf-parse` intercala un marcador de salto de página entre páginas
(`-- N of M --`, ej. `-- 6 of 6 --`) que no es contenido del extracto. El acumulador de líneas
por movimiento (`movementFromDateBlockStr`, en `lib/treasury/santander-pdf-statement-parser.ts`)
solo cortaba el bloque al encontrar la fecha del movimiento siguiente o las líneas
"saldo informado"/"movimientos en tránsito" — pero el **último** movimiento del extracto no
tiene una fecha siguiente que lo limite, así que el marcador de página y la línea
"Saldo final X" quedaban fusionados dentro de su descripción. Como `isBalanceRow()` reconoce
"saldo final" en la descripción, ese movimiento —real, con monto y referencia válidos— se
descartaba en silencio del resultado final.

**Corrección (dos capas, ambas necesarias):**
1. El marcador `-- N of M --` se retira como ruido puro en `normalizeSantanderPdfExtractedText()`
   (no es contenido bancario, es un artefacto de `pdf-parse` entre páginas).
2. `movementFromDateBlockStr()` ahora también corta el bloque al encontrar "saldo inicial" o
   "saldo final" (antes solo cortaba en "saldo informado"/"movimientos en tránsito") — defensa
   en profundidad, para que ninguna variante de este patrón vuelva a fusionar un movimiento real
   con la línea de saldo de cierre.

**Verificación:** tras el fix, ambos extractos reales reconcilian a la centésima:
`saldo_inicial + entradas − salidas = saldo_final` exacto (UYU: `531.696,06 + 516.193,47 −
363.721,23 = 684.168,30`; USD: `7.099,87 + 11.174,01 − 12.837,42 = 5.436,46`). Antes del fix,
faltaba 1 movimiento por cuenta y el saldo no cuadraba.

## Bug adicional encontrado por la nueva validación de saldo: `Math.abs()` en el saldo

Al implementar la validación de saldo por fila (ver abajo), se detectaron 5 mismatches en el
extracto USD real que no eran errores de parseo: el extracto legítimamente entra en saldo
**negativo** un momento del mes (antes de una transferencia entre cuentas combinadas que lo
regulariza el mismo día). El código forzaba `Math.abs()` sobre el saldo extraído,
ocultando el signo negativo real. Corregido en `lib/treasury/santander-pdf-statement-parser.ts`
(`movementFromColumns` y `movementFromDateBlockStr`): el saldo ahora preserva el signo tal como
aparece en el texto del banco.

## Campos nuevos del parser (`SantanderParsedBankMovement`)

Todos opcionales (el productor Excel consolidado, `santander-excel-consolidated-parser.ts`, no
los completa — fuera de alcance esta fase, que es específicamente sobre el importador PDF):

| Campo | Qué es |
|---|---|
| `payer_name_raw` / `payer_name_normalized` / `payer_token` | Identidad del pagador/beneficiario extraída con heurística de mejor esfuerzo (patrones `NRR:<dígitos>`, `TRF. PLAZA-`, `RECIBIDA`). Solo campos estructurados del parser — **sin persistencia ni aprendizaje esta fase**. |
| `embedded_reference` | La referencia (`reference`/`documentNumber`) cuando tiene forma de operación de transferencia (`LR`/`TR`/`TT`/`LE` + dígitos). |
| `nrr` | Número de referencia de red del banco, cuando está presente en la descripción. |
| `balance_before` / `balance_check` | Saldo antes de la fila y resultado de validar `saldo_anterior + crédito − débito = saldo_actual` (tolerancia 0,01). `"ok" \| "mismatch" \| "unknown"`. |
| `operation_group_key` | Agrupa principal + comisión de una misma operación **sin fusionarlos en un movimiento**: `cuenta\|moneda\|fecha\|referencia[\|NRR...]`. `null` cuando no hay referencia real — nunca se agrupa por nombre o monto solamente. Verificado con los 3 ejemplos reales de la fase (transferencia + comisión con referencia `TT`, transferencia + comisión con referencia `LE`+NRR, crédito recibido + su propia comisión con referencia `TR`). |
| `dedup_fingerprint` | Fingerprint de deduplicación recomendado: `cuenta+moneda+fecha+referencia_normalizada+tipo+débito+crédito+descripción_normalizada+ocurrencia`. **No reemplaza** el `external_id` real usado en producción (`buildSantanderMovementExternalId`, sin cambios esta fase para no invalidar la deduplicación de extractos ya importados) — es un campo adicional, más completo, disponible para un futuro cambio de esquema si se decide separadamente. |

`SantanderBankStatementParseResult.balance_validation` (opcional) resume la validación de todo
el extracto: `ok`, `opening_balance`, `closing_balance_expected`, `closing_balance_computed`,
`difference`, `row_mismatches_count`. Nunca se "corrige" un monto para forzar el cuadre — un
mismatch se reporta, no se oculta ni se silencia.

## Deduplicación real (sin cambios de esquema esta fase)

`buildSantanderMovementExternalId()` (`lib/treasury/santander-statement-parser.ts`) sigue siendo
el `external_id` real usado por CSV/Excel/PDF para deduplicar en `bank_movements`. Se auditó y
**no se modificó**: cambiar su fórmula invalidaría silenciosamente la deduplicación de todo lo ya
importado (un extracto re-subido dejaría de reconocerse como duplicado). El nuevo
`dedup_fingerprint` es un campo adicional del parser, no el mecanismo de deduplicación productivo.

## Limitación conocida: datos ya importados antes de este fix

Movimientos importados a `bank_movements` **antes** de este fix pueden tener su `description`
contaminada con el marcador `-- N of M --` (se observó en datos productivos reales de la
bandeja Ingresos: ej. `"... /DOCTOR -- 2 of 4 --"`). El fix solo aplica a **futuras** importaciones;
no se ejecutó ninguna limpieza retroactiva de datos ya importados en esta fase (fuera de alcance:
requeriría una migración de datos separada y autorizada).
