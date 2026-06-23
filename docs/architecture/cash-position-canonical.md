# ADR-0012 — Motor Canónico de Caja Disponible

## Estado
Aceptada

## Fecha
2026-06-23

## Contexto

Existían cuatro implementaciones distintas de "caja disponible" en el codebase:

| Motor | Función | API | Estado |
|---|---|---|---|
| **Tesorería** | `calculateCashPosition()` | `/api/copilot/treasury/cash-position` | **Canónico** |
| **Finanzas** | `historicalCashNet()` | `/api/copilot/financial-snapshot` | Retenido — concepto distinto |
| `getCashStatus()` | `lib/copilot-financial-intelligence.ts` | `/api/copilot/cash-status-amounts` | **ELIMINADO** (dead code) |
| `dashboard-data.ts` | Datos hardcodeados | N/A | Confinado a legacy/fixtures |

La auditoría TREASURY-CANONICAL-CASH-AUDIT-001 (2026-06-23) determinó que HOY, Dashboard y
Tesorería ya utilizaban el motor canónico. `getCashStatus()` era dead code con cero callers.
`dashboard-data.ts` no llegaba a usuarios reales en producción.

## Decisión

**`calculateCashPosition()` via `GET /api/copilot/treasury/cash-position` es la fuente única
de verdad para "caja disponible operativa"** en todos los módulos de producción.

`historicalCashNet()` / `realized.cash_net` se retiene para Finanzas como indicador de
"neto acumulado Zeta" — un concepto distinto, correctamente labelado.

---

## Motor canónico — Tesorería

### Función

```typescript
// lib/treasury/treasury-cash-position.ts
calculateCashPosition(params: {
  openingBalance: number;
  effectiveDate: string;         // fecha base del saldo inicial
  movements: PlannedCashMovement[];
  zetaReceipts: ProtoReceipt[];
}): CashPositionByCurrency
```

### Fórmula

```
availableCash =
    openingBalance                    // saldo inicial configurado por el usuario en Tesorería
  + collectedFromClients              // Σ(proto_receipts.amount WHERE receipt_date >= effectiveDate)
  + Σ(movements WHERE type = income)
  - Σ(movements WHERE type = expense)
  + Σ(movements WHERE type = adjustment, signed)
  + Σ(movements WHERE type = transfer, net de ambas patas)
```

Solo se incluyen movimientos con `status = 'active'`. Solo cobros Zeta posteriores al
`effectiveDate` (los anteriores se asumen ya reflejados en el `openingBalance`).

### Tablas DB

| Tabla | Rol |
|---|---|
| `planned_cash_opening_balances` | Saldo inicial y fecha base por moneda y tenant |
| `planned_cash_movements` | Ingresos, egresos, ajustes y transferencias manuales |
| `proto_receipts` | Cobros sincronizados desde Zeta (post-baseline) |

### Separación de monedas

UYU y USD se calculan **siempre por separado**. Nunca se mezclan ni convierten.
El resultado es un array `CashPositionByCurrency[]`.

### API

```
GET /api/copilot/treasury/cash-position
→ requireCopilotModuleAccess(request, "tesoreria")
→ treasuryCashPositionGet(supabase, tenantCompanyId)
→ calculateCashPosition()
→ { positions: CashPositionByCurrency[], openingBalances: ... }
```

### Consumidores en producción

| Módulo | Componente | Campo |
|---|---|---|
| Hoy | `HoyMoneyCards` | `pulse.currentStateBlocks[n].cashAvailable` |
| Dashboard | `dashboard-page-client.tsx` | `extractDashboardCurrencyData().cajaDisponible` |
| Tesorería | `TesoreriaCashCards` | `CashPositionByCurrency.availableCash` |

---

## Motor histórico — Finanzas (neto acumulado Zeta)

### Función

```typescript
// lib/copilot-financial-primitives.ts
historicalCashNet(
  receipts: ProtoReceipt[],
  payments: ProtoPayment[]
): number
// = Σ(proto_receipts.amount, all time) - Σ(proto_payments.amount, all time)
```

### Selector

```typescript
// lib/copilot-financial-snapshot-selectors.ts
snapshotCashNet(snapshot) = snapshot.realized?.cash_net ?? snapshot.available_cash
```

### Tablas DB

| Tabla | Rol |
|---|---|
| `proto_receipts` | Todos los cobros históricos sincronizados (desde COPILOT_OPERATIONAL_START_DATE) |
| `proto_payments` | Todos los pagos históricos sincronizados |

### Cuándo usarlo

Para análisis histórico del acumulado de cobros y pagos registrados en Zeta.
**Label correcto en UI: "Neto acumulado" — NUNCA "Caja disponible".**

---

## Diferencias entre los dos motores

| Aspecto | Motor Tesorería (operativo) | Motor Finanzas (histórico Zeta) |
|---|---|---|
| Saldo inicial manual | ✅ Incluido | ❌ No incluido |
| Movimientos manuales | ✅ Incluidos | ❌ No incluidos |
| Cobros Zeta | ✅ Solo post-baseline | ✅ Todos (histórico completo) |
| Egresos manuales | ✅ Incluidos | ❌ Solo proto_payments (Zeta) |
| Monedas | Separadas (UYU / USD) | Sin separar por defecto |
| Scope temporal | Desde effectiveDate configurado | Desde COPILOT_OPERATIONAL_START_DATE |
| Pregunta que responde | "¿Cuánto dinero tengo hoy?" | "¿Qué cobré y pagué históricamente en Zeta?" |

---

## Invariantes

### Consistencia entre módulos (debe cumplirse siempre)

```
Hoy.availableCash[UYU]       ===
Dashboard.cajaDisponible[UYU] ===
Tesorería.availableCash[UYU]

// Los tres consumen GET /api/copilot/treasury/cash-position
// y leen CashPositionByCurrency.availableCash
```

Si estos tres valores divergen, hay un bug — probablemente una llamada
directa a proto_receipts/proto_payments que evita el motor canónico.

### Divergencia esperada (no es un bug)

```
Tesorería.availableCash !== Finanzas.realized.cash_net

// Divergen cuando:
//   (a) openingBalance ≠ 0 (usuario configuró saldo inicial)
//   (b) Σ(planned_cash_movements.income) ≠ 0 (hay ingresos manuales)
//   (c) effectiveDate > COPILOT_OPERATIONAL_START_DATE (baseline posterior al inicio)
```

Esta divergencia es **intencional y correcta**. Miden conceptos distintos.

---

## Dead code eliminado

Los siguientes artefactos fueron eliminados en TREASURY-CASH-DEADCODE-001 (2026-06-23):

| Archivo eliminado | Razón |
|---|---|
| `lib/copilot-financial-intelligence.ts` | `getCashStatus()` — cero callers en producción |
| `app/api/copilot/cash-status-amounts/route.ts` | Ruta sin callers; semánticamente duplica `historicalCashNet` |
| `loadCashStatusAmountRows()` en `lib/data/proto-analytics-read-repository.ts` | Solo usada por la ruta eliminada |
| Entrada `["/api/copilot/cash-status-amounts", "tesoreria"]` en `copilot-api-module-map.ts` | Ruta ya no existe |
| Entrada en `scripts/patch-copilot-api-rbac.mjs` | Idem |

---

## Guía para nuevos módulos

Si un nuevo módulo necesita mostrar "caja disponible":

1. Llamar `GET /api/copilot/treasury/cash-position` — **NO** derivar de proto_receipts/proto_payments directamente.
2. Leer `CashPositionByCurrency.availableCash` para el valor operativo.
3. Mantener UYU y USD separados.
4. Usar el label "Caja disponible" solo para este valor.

Si necesita el acumulado histórico Zeta para análisis:

1. Llamar `GET /api/copilot/financial-snapshot`.
2. Leer `snapshot.realized.cash_net` via `snapshotCashNet(snapshot)`.
3. Labelar como "Neto acumulado" o "Neto Zeta histórico" — **NUNCA** "Caja disponible".

---

## Riesgo conocido: saldo inicial no configurado

Si un tenant no configura `openingBalance` en Tesorería, `collectedFromClients = 0`
(no se cuentan cobros Zeta) y `availableCash` refleja solo los movimientos manuales.
El valor resultante puede subestimar la caja real.

**Mitigación:** UX prompt en Tesorería para configurar saldo inicial.
No es un bug del motor — es una dependencia de configuración del usuario.

## Alternativas consideradas

1. Unificar en un solo motor (proto_receipts + movimientos manuales + opening balance):
   descartado porque los dos motores tienen semánticas genuinamente distintas y audiencias distintas.

2. Deprecar `historicalCashNet()` completamente:
   descartado porque Finanzas lo necesita para análisis acumulado y está correctamente labelado.

3. Crear un endpoint unificado que sirva ambos conceptos:
   descartado por complejidad innecesaria y riesgo de confusión futura.

## Criterio de revisión

Revisar si se introduce un nuevo módulo que necesite caja disponible.
Revisar si el tenant muestra valores inconsistentes entre Hoy/Dashboard/Tesorería.
