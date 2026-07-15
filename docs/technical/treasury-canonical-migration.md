# Migración canónica de Tesorería (FASE-4)

Estado: implementado. Base: `d86025d` (FASE-3).

Objetivo: eliminar la dependencia **estructural** de Tesorería sobre
`bank_reconciliation_movements` como fuente operativa de caja, encapsulándola en un
**único punto de transición**, sin cambiar ningún resultado financiero.

## 1. Arquitectura — antes vs después

**Antes:** `treasury-intelligence-service` importaba el repositorio legacy
`bank-reconciliation-movement-repository` directamente para alimentar la proyección
de caja, alertas e insights.

**Después:** lee el banco a través de `lib/treasury/canonical/treasury-bank-source`
(`loadTreasuryCashflowBankMovements`), la **única puerta** de lectura legacy para el
cashflow. El resultado es idéntico; solo cambia el origen.

## 2. Separación conceptual

| Módulo | Representa | No representa |
| --- | --- | --- |
| Banco | movimientos importados (`bank_movements`, capa canónica) | caja |
| Tesorería | posición y proyección de caja, compromisos, recurrentes, programados | el extracto bancario |
| Finanzas | KPIs financieros | — |
| Cobranza | facturas, recibos, deuda | — |

## 3. Matriz de consumidores

| Consumidor | Fuente actual | Nueva fuente | Riesgo | Acción |
| --- | --- | --- | --- | --- |
| `treasuryIntelligenceBundle` (proyección/alertas/insights, server) | repo legacy directo | `loadTreasuryCashflowBankMovements` (punto único) | Bajo | **Migrado** |
| `cash-position` route → `treasury-cash-opening-balance-service` | solo manual cash | sin cambios | Ninguno | Sin cambio |
| `treasury-bank-panel` + `use-treasury-workspace` (client) | API legacy `/treasury/bank-reconciliation-movements` | sin cambios | Ninguno | Legacy feature, retiro posterior |
| `bank-reconciliation-movement-service` / `-import-service` + 4 rutas API | CRUD tabla legacy | sin cambios | Ninguno | Legacy feature, retiro posterior |
| `treasury-reconciliation-match`, mappers, types, validation | shape legacy | sin cambios | Ninguno | Se conservan |
| `buildTreasuryDashboard` | (sin llamador operativo) | — | Ninguno | No wired |

## 4. Adaptadores

`lib/treasury/canonical/treasury-bank-source.ts`:

- `loadTreasuryCashflowBankMovements(supabase, workspaceId)` — única lectura legacy
  para cashflow. Devuelve las filas **sin transformar** ⇒ resultado idéntico.
- `buildTreasuryLegacyBankSnapshot(rows)` — vista canónica (read-only) de las mismas
  filas vía la capa bancaria canónica. **No se suma a la caja.** UYU/USD separados.

## 5. Compatibilidad / resultado idéntico

La proyección histórica cuenta ciertos movimientos bancarios en el cashflow
(`shouldCountBankInCashflow`). Se preserva exactamente. La única fila legacy real
está en estado `ignored` (2026-05-13, UYU, debit, 1500) ⇒ aporta **0** al cashflow.
El diff real (`scripts/audit-treasury-canonical-diff.ts`) confirma `NO_DIFFERENCE`.

## 6. Fórmula de caja / proyección

Sin cambios: opening balances desde manual cash, obligaciones/recurrentes/programados
y banco intactos. Solo se centralizó el origen del banco.

## 7. Performance

Cada snapshot se construye una sola vez por request (`treasuryIntelligenceBundle`
arma proyección/alertas/insights de una carga). El adaptador hace **una** query al
banco legacy (misma que antes); sin N+1, sin doble lectura, sin doble conteo.

## 8. Dependencias eliminadas / temporales

- **Eliminada:** import directo del repositorio legacy en el servicio de caja.
- **Temporal (encapsulada):** `treasury-bank-source` sigue leyendo
  `bank_reconciliation_movements` para preservar el resultado. Punto único de retiro.
- **Legacy feature restante (fuera de alcance FASE-4):** subsistema de conciliación
  bancaria (servicios CRUD, import, 4 rutas API, panel, match) que **posee** la tabla.

## 9. Plan de retiro definitivo del legacy

1. FASE-4 (hecho): punto único de transición para el cashflow.
2. Redefinir la proyección para que **Banco no alimente Caja** (Banco ≠ Caja); la
   conciliación pasa a leer la capa canónica `bank_movements`.
3. Migrar el panel/servicios de conciliación a `bank_movements`.
4. Deprecar el repositorio/servicios legacy y, por último, la tabla
   `bank_reconciliation_movements`. No se elimina nada en esta fase.

## 10. Verificación

`npx tsx scripts/audit-treasury-canonical-diff.ts` → `OVERALL: NO_DIFFERENCE`.
Tests: `lib/treasury/canonical/treasury-bank-source.test.ts` (identidad de resultado,
UYU/USD, banco ignored = 0, snapshot único, fuente única). Ver también la doc de la
[capa financiera canónica](./financial-canonical-layer.md) y
[la capa bancaria canónica](./canonical-bank-movements.md).
