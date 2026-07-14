# Movimientos bancarios canónicos y política histórica (FASE-3)

Estado: implementado. Commit base: `5a14e7a` (FASE-2).

## 1. Problema

Coexistían dos sistemas bancarios:

- `bank_movements` — sistema actual (importación Santander PDF/Excel, conciliación,
  asociación de ingresos, alias, dedupe, filtros, tareas operativas).
- `bank_reconciliation_movements` — legacy de Tesorería (ZETA-11).

Riesgos: duplicados, totales divergentes, conciliaciones distintas, tareas
automáticas sobre movimientos históricos y ambigüedad sobre la fuente oficial.

## 2. Decisión (respaldada por auditoría real read-only)

| Métrica | `bank_movements` | `bank_reconciliation_movements` |
| --- | --- | --- |
| Filas | **951** | **1** |
| Rango fechas | 2026-01-02 → 2026-07-10 | 2026-05-13 |
| Monedas | UYU + USD (0 sin moneda) | UYU (0 sin moneda) |
| Entradas / salidas | 448 / 503 | 0 / 1 |
| Conciliados / pendientes | 8 / 943 | 0 / 0 |
| Histórico (< 2026-07-01) | 894 | 1 |
| Operativo (>= corte) | 57 | 0 |
| Consumidores | Banco (import, conciliación, ingresos, alias, dedupe, tareas) | Tesorería (proyección, dashboard, match, panel) |
| Escritura | R/W | R/W (repo, sin uso activo) |

Cross-source duplicate probe (`date + abs(amount) + currency + direction`): **0 coincidencias**.

**Fuente oficial: `bank_movements`.**
**Legacy read-only durante transición: `bank_reconciliation_movements`.**

Operativo por moneda: USD 17 (8 in / 9 out) · UYU 40 (16 in / 24 out).
Histórico por moneda: USD 382 · UYU 512.

## 3. Política temporal

`BANK_OPERATIONAL_START_DATE = "2026-07-01"` — centralizada en
`lib/bank/canonical/historical-policy.ts`. No dispersar el literal.

- `movement_date < corte` ⇒ **histórico**.
- `movement_date >= corte` ⇒ **operativo** (2026-07-01 inclusive es operativo).

El histórico permanece visible/buscable/conciliable manualmente, pero:

- no se mezcla por defecto en métricas operativas,
- no genera tareas automáticas,
- no genera alertas operativas,
- no aparece como pendiente reciente,
- no afecta proyecciones.

### `isHistorical`: derivado (no persistido)

Se optó por campo **derivado** (`movement_date < corte`) en lugar de una columna
`is_historical`. Justificación: el corte es único y estable, las consultas ya
filtran por `movement_date` (índice `bank_movements_ws_date_idx`), el volumen es
bajo (~1k filas) y no hay necesidad de override manual por fila. No se requiere
migración. Si en el futuro se necesita override manual o índices dedicados por
histórico, se puede persistir en una fase posterior.

## 4. Capa canónica (`lib/bank/canonical/`)

```
historical-policy.ts   BANK_OPERATIONAL_START_DATE + helpers de clasificación
types.ts               CanonicalBankMovement, snapshot, diagnósticos, reporte
adapters/
  bank-movements.ts    bank_movements → canonical (+ diagnósticos)
  legacy-reconciliation.ts  bank_reconciliation_movements → canonical
dedup.ts               fingerprint + classifyDuplicate + detectCrossSourceDuplicates
snapshot.ts            buildCanonicalBankSnapshot (por moneda, op vs hist, sin doble conteo)
report.ts              buildBankActivityReportModel
index.ts               barrel
```

### Contrato

`CanonicalBankMovement` = `direction` (`inflow`/`outflow`) + `amount` absoluto.
Nunca importe con signo ambiguo. `currency` ∈ {UYU, USD}. UYU y USD nunca se suman.

### Fingerprint / dedup

`buildBankMovementFingerprint` combina `fecha + moneda + dirección + importe +
cuenta + descripción normalizada`. `fecha + importe` por sí solo **no** es
duplicado. Clasificación: `exact | high | medium | none`. Nunca borra registros.

Política de fuente combinada: `bank_movements` primaria; legacy solo cuando no
existe equivalente canónico; se marca el origen; los duplicados legacy
(exact/high) se excluyen del total del snapshot para no doble contar.

### Diagnósticos

`missing_currency`, `missing_movement_date`, `invalid_amount`, `missing_account`,
`probable_cross_source_duplicate`, `conflicting_reconciliation_status`,
`unsupported_legacy_record`, `historical_operational_mismatch`. Contables,
testeados, sin datos sensibles.

## 5. Cambios por módulo

- **Banco** (`/copilot/movimientos-bancarios`): filtro **Alcance**
  Operativos / Históricos / Todos (default **Operativos**); badge **Histórico** en
  la tabla; KPIs de resumen calculados solo sobre operativos.
- **Tareas / Hoy** (workbook): el conteo bancario proviene de
  `loadBankMovementReconciliationList`, que ahora aplica el corte operativo por
  defecto (`gte BANK_OPERATIONAL_START_DATE`). Los históricos no generan tareas ni
  alertas. Opt-in vía `?scope=all` / `?include_historical=1`.
- **Tesorería**: no se fusiona. Sigue leyendo `bank_reconciliation_movements` por
  sus repositorios/tipos existentes. Banco = movimientos importados + conciliación;
  Tesorería = posición y planificación de caja. Un movimiento bancario importado no
  equivale automáticamente a un movimiento de caja contabilizado.

## 6. Seguridad / RLS

Ambas tablas tienen RLS por `workspace_id = copilot_current_workspace_company_id()`
y trigger `force_workspace`. No se ampliaron permisos. La capa canónica es de solo
lectura sobre datos ya autorizados por RLS.

## 7. Diff real

`scripts/audit-canonical-bank-diff.ts` (read-only) compara por moneda las cuatro
vistas y clasifica: `NO_DIFFERENCE`, `EXPECTED_HISTORICAL_EXCLUSION`,
`EXPECTED_LEGACY_DIFFERENCE`, `DATA_QUALITY`, `DUPLICATE_RISK`,
`IMPLEMENTATION_DEFECT`. No imprime datos sensibles.

## 8. Estrategia de retiro del legacy

`bank_reconciliation_movements` queda read-only. Cuando Tesorería migre su
proyección/dashboard a la capa canónica (fase posterior), se podrá deprecar el
repositorio legacy y, finalmente, la tabla. No se elimina nada en esta fase.
