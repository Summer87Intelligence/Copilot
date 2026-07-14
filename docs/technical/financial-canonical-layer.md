# Financial Canonical Layer (FASE 0)

> Capa canónica única para las métricas financieras del Copilot.
> Código: `lib/financial/canonical/`. Fuente de labels: `lib/copilot-financial-metrics-contract.ts`.

## 1. Propósito

Eliminar las definiciones duplicadas e inconsistentes de "saldo pendiente",
"saldo atrasado", "cobrado" y "ventas" que hoy conviven entre **Hoy, Cartera,
Finanzas, Cliente 360 y Reportes**. La capa provee:

- **Contratos** (`types.ts`): tipos explícitos, sin nombres ambiguos.
- **Contexto** (`report-context.ts`): interpretación única de período / corte / piso 2026.
- **Builders puros** (`sales.ts`, `collections.ts`, `debt.ts`, `aging.ts`): funciones
  testeables sin I/O.
- **Snapshot de cobranza** (`collections-snapshot.ts`): expone aplicado y
  registrado juntos sin mezclarlos.
- **API única** (`summary.ts` → `buildCanonicalFinancialSummary`): métricas por moneda + diagnósticos.

FASE 0 es **fundación + contrato + un consumidor de bajo riesgo**. No migra Hoy /
Cartera / Finanzas / Cliente 360 / Reportes en masa.

## 2. Glosario y definiciones exactas

| Concepto | Builder / campo | Ancla temporal | Fórmula |
|---|---|---|---|
| **Ventas emitidas netas** | `sales.issuedNet` | `issue_date` en período | Σ(facturas activas no-NC) − Σ(NC del período) |
| **Cobrado aplicado** | `sales.appliedCollected` | período | `max(0, issuedNet − pendingAtCutoff de esas ventas)` |
| **Pendiente de ventas al corte** | `sales.pendingAtCutoff` | corte | Σ(`balance_amount>0`) de las ventas del período |
| **Cobrado registrado** | `registeredCollections.registeredCollections` | `receipt_date` en período | Σ(`proto_receipts.amount`) |
| **Saldo pendiente (stock)** | `debt.pendingBalance` | corte | Σ(`balance_amount>0`) de facturas no-NC con `issue_date ≤ cutoff` |
| **Saldo atrasado (stock)** | `debt.overdueBalance` | corte | subconjunto con `due_date < cutoff` |
| **Saldo al día (stock)** | `debt.currentBalance` | corte | `pendingBalance − overdueBalance` |
| **Aging por vencimiento** | `aging.*` | corte | balance abierto distribuido por días de atraso desde `due_date` |

### Cobrado aplicado ≠ Cobrado registrado

- **Aplicado** (`sales.appliedCollected`): cuánto de lo **emitido en el período**
  quedó saldado al corte. Es un residual contable, **no** son recibos ingresados
  en el mes.
- **Registrado** (`registeredCollections`): recibos por `receipt_date` dentro del
  período. Puede incluir cobros de facturas de meses anteriores.

Nunca exponer ninguno simplemente como "Cobrado".

## 3. Fuentes de datos

- Facturas: `proto_invoices` → `CanonicalInvoiceInput` (subconjunto estructural de
  `InvoiceInput` de `copilot-financial-reconciliation.ts`).
- Recibos: `proto_receipts` → `CanonicalReceiptInput`.
- NC: `is_credit_note` resuelto por el caller con `isCreditNoteFromMetadata`.
- Cuotas: cuando existan (`proto_invoice_installments`), el caller expande cada
  cuota abierta a una fila (`due_date` + `balance` propios). El aging opera sobre
  balance abierto por cuota — ver test Caso 6.

## 4. Reglas temporales y de moneda

- `MIN_FINANCIAL_DATE = 2026-01-01`: todo comprobante anterior se excluye de KPIs
  (se reporta en `diagnostics.excludedByMinFinancialDate`).
- **STOCK** (deuda / atraso / aging) se mide al `cutoffDate`.
  **PERÍODO** (ventas / cobranza) se mide en `[periodStart, periodEnd]`.
  Nunca se mezclan sin nombres diferenciados.
- **UYU y USD siempre separados.** No hay consolidación implícita.
  `consolidateCanonicalToUsd` exige `exchangeRate` explícito y visible; sin TC, lanza.
- **Aging por `due_date`.** Nunca `issue_date` como sustituto de vencimiento.
  Facturas sin `due_date` resoluble → tratadas como "al día" y contabilizadas en
  `debt.balanceWithoutDueDate`.

### Buckets canónicos de atraso

`current` · `overdue_1_7` · `overdue_8_14` · `overdue_15_30` · `overdue_31_plus`
(reutilizan los umbrales de `lib/copilot/operating-aging.ts`).

## 5. API

```ts
import { buildCanonicalFinancialContext, buildCanonicalFinancialSummary }
  from "@/lib/financial/canonical";

const context = buildCanonicalFinancialContext({
  workspaceId, periodStart: "2026-07-01", periodEnd: "2026-07-31",
}); // cutoff = periodEnd por defecto; minFinancialDate = 2026-01-01

const summary = buildCanonicalFinancialSummary({ context, invoices, receipts });
// summary.byCurrency: [{ currency, sales, registeredCollections, debt, aging }]
// summary.diagnostics: exclusiones por moneda nula / pre-2026
```

Builders individuales también exportados: `buildCanonicalSalesMetrics`,
`buildCanonicalRegisteredCollectionsMetrics`, `buildCanonicalDebtMetrics`,
`buildCanonicalAgingMetrics`.

### Snapshot canónico de cobranza (FASE 2)

```ts
import { buildCanonicalCollectionsSnapshot } from "@/lib/financial/canonical";

const snapshot = buildCanonicalCollectionsSnapshot({ context, invoices, receipts });
```

Salida por moneda:

```ts
{
  applied: {
    issuedNetInPeriod,
    pendingBalanceAtCutoffForPeriodSales,
    appliedCollectionsAtCutoff,
    appliedCollectionRate,
  },
  registered: {
    registeredCollectionsInPeriod,
    receiptCountInPeriod,
  },
}
```

`applied` responde “cuánto de lo vendido en el período quedó saldado al corte”.
`registered` responde “cuántos recibos/monto fueron registrados por fecha de
recibo”. No hay matching recibo↔factura ni FIFO implícito.

## 6. Invariantes garantizadas por tests

- `aging.total === debt.pendingBalance` (mismo universo de facturas).
- `sales.appliedCollected === max(0, issuedNet − pendingAtCutoff)`.
- `collections-snapshot` mantiene `applied` y `registered` separados y emite
  diagnóstico si el aplicado bruto queda negativo.
- Casos 1–5: buckets de atraso por días desde `due_date`.
- Caso 6: cuotas — aging solo sobre balance abierto.
- Caso 7: recibo de julio de factura de junio → cobrado registrado julio, **no** ventas julio.
- Caso 8: factura julio / cobro agosto → ventas julio, aplicado 0 al corte, registrado agosto.
- Caso 9: NC reduce `issuedNet`.
- Caso 10: UYU/USD separados.
- Caso 11: pre-2026 excluidas + diagnóstico.
- Caso 12: `currency_code` nulo excluido + diagnóstico.

Tests:
- `lib/financial/canonical/canonical-financial-layer.test.ts`.
- `lib/financial/canonical/collections-snapshot.test.ts`.

## 7. Diferencia con motores existentes (inventario)

| Motor | Rol | Estado frente a la capa |
|---|---|---|
| `copilot-financial-reconciliation.ts` (`generateFinancialConsistencyReport`) | Motor de cartera (issued/pending/collected/aging contable 0-30/31-60/…) | **Se mantiene** como motor de producción. La capa canónica es la nueva API que futuros consumidores adoptarán. |
| `lib/copilot/operating-aging.ts` | Clasificación por `due_date` (buckets operativos) | **Reutilizado** por `aging.ts` y `debt.ts`. Fuente única de umbrales. |
| `lib/financial/canonical-debt-metrics.ts` | Rollup deuda activa/vencida (portfolio + aging) | Convive; a migrar a `buildCanonicalDebtMetrics`. |
| `lib/collection-aging/collection-aging-model.ts` | Aging por **`issue_date`** (cobranza) | **Semánticamente divergente** (issue_date, no due_date). Candidato a retiro tras migración. |
| `lib/copilot-cartera-cards-source.ts` (`portfolioResolvedAmount`) | Cobrado aplicado a nivel cartera | Equivalente a `sales.appliedCollected`; a unificar. |
| `lib/reports/net-sales-report` | Ventas netas por cliente del período | **Reutilizado** como fuente canónica de ventas de Top Clientes. |

## 8. Diferencia stock vs período (recordatorio)

- `deuda_activa` / `deuda_vencida` / aging → **stock** al corte.
- `facturado_periodo` / `cobrado_periodo` / `cobrado_aplicado` → **actividad** del rango.

## 9. Corrección incluida en FASE 0 — Top Clientes

**Bug:** `build-top-clients-report-model.ts` usaba `portfolio.billing_uyu/usd`
(facturación **lifetime**) con un label de mes → mostraba acumulado histórico
etiquetado como período.

**Fix:** `netSales` ahora proviene de **ventas netas emitidas dentro del período**
(`issue_date`) vía `buildNetSalesReportModel` (fuente canónica). Deuda y atraso
siguen siendo stock actual del portfolio. Rutas JSON y PDF actualizadas; copy del
PDF corregida ("Ventas netas emitidas en {mes}" en vez de "Facturación acumulada").

## 10. Mapa de migración gradual (pendiente, próximas fases)

Orden recomendado (menor a mayor riesgo):

1. **Reportes** restantes (debtors, collections, executive) → `buildCanonicalDebtMetrics` / `buildCanonicalAgingMetrics`.
2. **Cliente 360** (Finanzas tab) → aging canónico.
3. **Cartera** → `buildCanonicalFinancialSummary` reemplazando `canonical-debt-metrics` + cards-source.
4. **Dashboard / Hoy** → últimos, por ser los más consumidos.
5. Retirar `collection-aging-model` (aging por issue_date) tras validar equivalencia.

## 11. Funciones legacy a retirar (tras migración)

- `collection-aging-model.ts` (aging por `issue_date`).
- Aliases deprecados en `copilot-financial-reconciliation.ts`:
  `totalInvoiced`, `totalPending`, `totalCollected` (semántica dual).
- Cálculo billing-lifetime en Top Clientes (ya removido).

## 12b. FASE 1 — Debt units, cuotas y migración de aging

### Arquitectura de debt units

`buildCanonicalDebtUnits` (`debt-units.ts`) es la **fuente única** que convierte
facturas + cuotas en **unidades vencibles atómicas** (`CanonicalDebtUnit`). Toda
métrica de deuda/aging deriva de estas unidades vía `metrics-from-units.ts`.
Cliente 360, Cartera y Hoy **no expanden cuotas por su cuenta**.

```ts
const { units, diagnostics, diagnosticCounts } = buildCanonicalDebtUnits({
  invoices, installments, context,
  includeAllIssueDates, // true en consumidores cuyo universo ya viene acotado (Cliente 360)
});
const debt  = buildCanonicalDebtMetricsFromUnits(units, "UYU", cutoff);
const aging = buildCanonicalAgingMetricsFromUnits(units, "UYU", cutoff);
```

### Prioridad de vencimiento

1. **Cuota abierta** de `proto_invoice_installments` (`cuota_saldo > 0`, `cuota_vencimiento`).
2. **Vencimiento de factura** (`due_date`) cuando no hay cuotas abiertas.
3. **Sin vencimiento confiable** → unidad con `dueDate = null`: cuenta como
   pendiente pero **no** como atrasada + diagnóstico.

Reglas: si una factura tiene cuotas abiertas, se emite **una unidad por cuota** y
**no** la unidad de factura (sin doble conteo). Una cuota pagada no participa.
Nunca se inventa un vencimiento.

### Tratamiento de fechas y datos faltantes

- `dueDate` ausente/ inválido → pending, sin aging (bucket `current`),
  `balanceWithoutDueDate` lo contabiliza.
- Vence exactamente en `cutoff` → al día (`daysLate = 0`).

### Diagnósticos (`CanonicalDebtDiagnosticCode`)

| Código | Tratamiento |
|---|---|
| `missing_currency` | Excluida de totales monetarios + diagnóstico. |
| `missing_due_date` | Incluida en pending; no clasificada como atrasada. |
| `invalid_due_date` | Igual que missing; se registra el intento. |
| `installment_balance_mismatch` | Se usan las cuotas reales; se emite diagnóstico (no se corrige el dato, no se oculta). |
| `negative_open_balance` | No genera unidad; se diagnostica (no se normaliza sin regla validada). |
| `invoice_without_company` | Se incluye en saldo; se diagnostica. |

Los diagnósticos están disponibles y testeados; no todos se exponen en UI. Ninguna
factura desaparece silenciosamente.

### Invariantes (testeadas)

- `saldo pendiente = saldo al día + saldo atrasado`.
- `suma de buckets = saldo pendiente clasificable`.
- `saldo atrasado = Σ buckets de atraso`.
- `saldo pendiente = saldo clasificable + saldo sin vencimiento` (unidades sin due_date).
- Sin cuotas, el aging por unidad es idéntico al aging por factura (paridad FASE 0).

### Consumidores migrados / pendientes (FASE 1)

| Consumidor | Estado | Nota |
|---|---|---|
| **Cliente 360** (`client-360-aging.ts`) | ✅ migrado | Deriva de debt units; carga cuotas reales (`proto_invoice_installments`), degrada a nivel factura sin regresión. |
| `canonical/debt.ts` + `aging.ts` | ✅ migrado | Delegan en debt units. |
| **Cartera** (`copilot-cartera-cards-source`, `computeInvoiceCurrencyBreakdown`) | ⏳ pendiente | `overdue_*` ya es por `due_date`; unificar a debt units. |
| **Reportes de deudores** | ⏳ pendiente | Unificar aging a debt units. |
| **Hoy** (`hoy-debt-breakdown`) | ⏳ pendiente | **Aún usa `issue_date`** para atraso — reemplazar por canonical. |
| `collection-aging-model` | ⛔ deprecado | Ver §12c. |

### Comparación legacy vs canónico en Summer87

Estado: **pendiente de ejecución con dataset real** (no incluida en este commit
para no mezclar lectura de producción con el cambio de código). La verificación
read-only de la columna `deleted_at` sí se ejecutó (APLICADA Y VERIFICADA).
Método recomendado para la continuación: correr el modelo legacy y el canónico
sobre el mismo snapshot por moneda y clasificar diferencias
(CORRECCIÓN ESPERADA / DIFERENCIA DE DATOS / REGRESIÓN / CAMBIO SEMÁNTICO).
Diferencia esperada principal: **Hoy** (issue_date → due_date) y clientes con
**cuotas reales** (aging por cuota vs factura).

## 12c. Deprecación de `collection-aging-model`

`lib/collection-aging/collection-aging-model.ts` mide antigüedad por `issue_date`
— **no** días de atraso. Marcado `@deprecated`. No usar para deuda/atraso
operativo. Consumidores fuera de alcance aún vivos: `copilot-cobranza-summary`,
`clientes-a-gestionar`, `computeInvoiceCurrencyBreakdown` (`collection_overdue_*`).
Guardia arquitectónica: `collection-aging-deprecation.test.ts` impide nuevos
imports desde módulos migrados (capa canónica + Cliente 360). Se retirará cuando
quede sin consumidores.

## 12d. FASE 1B — Snapshot, loader y migración de Hoy / Deudores

### `buildCanonicalDebtSnapshot` (fuente agregada única)

`snapshot.ts` construye las debt units UNA vez y expone por moneda
(`metrics` + `aging` + `units`), por cliente (`byCompany`), diagnósticos y la
regla de clientes con atraso. Ningún módulo reagrega unidades por su cuenta.

```ts
const snap = buildCanonicalDebtSnapshot({ invoices, installments, context, includeAllIssueDates });
// snap.byCurrency / snap.byCompany / snap.diagnostics
// snap.overdueClientsByCurrency / snap.overdueClientsAnyCurrency
```

### Loader compartido (batch, sin N+1)

`lib/financial/canonical-debt-loader.ts`:
- `invoiceRowToCanonical(row)` — mapea `proto_invoices` → entrada canónica.
- `fetchCanonicalInstallments(client, wid, invoiceIds)` — carga cuotas **en batch**
  (chunks de 300 ids), degrada a `[]` si la tabla no existe. **Nunca** una query
  por factura ni por cliente. Cliente 360 lo usa (reemplazó su fetch inline).

### Regla única de clientes con atraso (§10)

Un cliente cuenta como “con atraso” **por moneda** si `overdueBalance > 0` en esa
moneda (no cuenta facturas ni cuotas; no se duplica). `overdueClientsAnyCurrency`
es la **unión** de `companyId` entre monedas (para un total general).

### Consumidores migrados (FASE 1B)

| Consumidor | Antes | Después |
|---|---|---|
| **Hoy** `hoy-debt-breakdown` | atraso/estado por **`issue_date`** (0-30/31-90/>90) | atraso/estado por **`due_date`** vía `classifyOperatingDelay` (Con deuda/Atrasada/Crítica). Vence hoy → al día. |
| **Reportes de deudores** `compute-currency-overdue-aging` | due_date con **fallback `issue_date`** | solo `due_date`; sin fallback. Saldo sin vencimiento no cuenta como atrasado. |
| **Cliente 360** | (FASE 1) | usa loader compartido de cuotas. |

### Política de cuotas y mismatch

- Factura con cuotas abiertas → aging por cuota; sin cuotas → por factura.
- Cuota pagada excluida; cuota parcial → solo saldo abierto.
- `installment_balance_mismatch` → diagnóstico; se usan las cuotas reales, **no**
  se inventa una cuota residual. (Si datos reales lo exigieran, se implementaría
  una unidad `invoice_residual` con `dueDate: null` que suma a pendiente pero no a
  atraso; hoy no es necesaria.)

### Comparación Summer87 legacy vs canónico (read-only)

Script: `scripts/audit-canonical-debt-diff.ts` (read-only, sin datos sensibles).
Ejecutado a **cutoff 2026-07-14** tras FASE 1C (438 facturas procesadas sobre
518 cargadas; 0 cuotas reales en el workspace):

| Métrica | Legacy (issue) | Canónico (due) | Δ | Clasificación |
|---|---|---|---|---|
| Pending UYU | 343.427 | 343.427 | 0 | `NO_DIFFERENCE` |
| Current UYU | 0 | 313.067 | +313.067 | `EXPECTED_SEMANTIC_CHANGE` |
| Overdue UYU | 343.427 | 30.360 | -313.067 | `EXPECTED_SEMANTIC_CHANGE` |
| Unclassified UYU | 0 | 0 | 0 | `NO_DIFFERENCE` |
| Overdue clients UYU | 15 | 3 | -12 | `EXPECTED_SEMANTIC_CHANGE` |
| Pending USD | 10.600,66 | 10.600,66 | 0 | `NO_DIFFERENCE` |
| Current USD | 0 | 7.478,60 | +7.478,60 | `EXPECTED_SEMANTIC_CHANGE` |
| Overdue USD | 10.600,66 | 3.122,06 | -7.478,60 | `EXPECTED_SEMANTIC_CHANGE` |
| Unclassified USD | 0 | 0 | 0 | `NO_DIFFERENCE` |
| Overdue clients USD | 21 | 8 | -13 | `EXPECTED_SEMANTIC_CHANGE` |

Diagnósticos: `missing_currency: 4` (**DATA_QUALITY** — facturas sin moneda,
excluidas de totales monetarios). Resto de códigos en 0. **Sin
`IMPLEMENTATION_DEFECT`.** Cuotas procesadas: 0; el soporte de cuotas está
implementado y cubierto por tests, pero no validado con cuotas reales Summer87.

### FASE 1C — Cartera migrada a aging operativo

`buildCarteraOperatingAging` (`lib/copilot/cartera-operating-aging.ts`) proyecta
un **snapshot único por request** desde `buildCanonicalDebtSnapshot` para Cartera.
El endpoint `GET /api/copilot/financial-reconciliation` devuelve:

```ts
{
  ok: true,
  report,          // actividad del período + compat legacy
  operatingAging,  // stock operativo por due_date
  meta
}
```

Fuente de datos:
- facturas: mismo universo operacional deduplicado de Cartera
  (`selectOperationalDebtInvoicesForSummation`);
- cuotas: `proto_invoice_installments` en batch cuando existen;
- cutoff de stock: `report.operationalPeriod.end`;
- período de actividad: permanece en `report.periodStart/periodEnd`.

Superficies migradas:

| Superficie | Fuente anterior | Fuente FASE 1C |
|---|---|---|
| Cards de saldo pendiente | `report.currencies.pendingAtCutoff` | `operatingAging.byCurrency.pendingBalance` con fallback temporal |
| Aging analytics | buckets contables del reporte | `operatingAging.byCurrency.buckets` |
| Explorer / tabla | `dominantAgingRange` + `staleClients` | `operatingAging.byCompany` para estado/orden/filtros; saldos desde el mismo payload cuando aplica |
| Top deudores / drawer | `staleClients.dominantAgingRange` | `operatingAging.byCompany` + join de nombres desde `staleClients` |

Buckets visibles: **Al día**, **1–7 días de atraso**, **8–14 días de atraso**,
**15–30 días de atraso**, **+30 días de atraso**.

`saldo sin vencimiento` (`unclassifiedDueDateBalance`) queda fuera de “Al día”.
Invariante testeada:

```text
saldo pendiente = al día clasificable + saldo atrasado + saldo sin vencimiento
```

`invoiceCount` visible en buckets cuenta **facturas únicas**, no cuotas. Si una
factura tiene tres cuotas abiertas en el mismo bucket, el bucket muestra 1 factura
y `debtUnitCount=3` queda disponible solo para auditoría.

Legacy restante:
- `collection_overdue_*` (issue_date) en `computeInvoiceCurrencyBreakdown` sigue
  vivo para el modelo de cobranza, fuera de deuda/atraso operativo.
- `report.agingByCurrency` permanece en el payload por compatibilidad y auditoría,
  pero Cartera operativa ya no lo renderiza.
- Retiro propuesto: FASE 1D/2, después de migrar consumidores de cobranza que aún
  dependen del aging por emisión.

### FASE 2 — Cobrado aplicado vs cobrado registrado

FASE 2 separa el contrato visible y técnico de cobranza en dos familias:

| Concepto | Campo explícito | Fuente | Fecha | Pregunta que responde |
|---|---|---|---|---|
| Cobrado aplicado | `appliedCollectionsAtCutoff` | ventas netas + saldo pendiente | `issue_date` + cutoff | ¿Cuánto de lo vendido en el período quedó saldado al corte? |
| Cobrado registrado | `registeredCollectionsInPeriod` | `proto_receipts.amount` | `receipt_date` | ¿Cuánto se registró como recibo en el período? |

El motor de reconciliación conserva aliases legacy (`totalCollected`,
`collectedInPeriod`, `collectionEffectiveness`) por compatibilidad, pero expone
campos explícitos para consumidores nuevos. `buildCanonicalCollectionsSnapshot`
es el snapshot puro reutilizable y agrega diagnósticos:

```ts
missing_invoice_currency
missing_receipt_currency
invalid_receipt_date
invalid_receipt_amount
negative_applied_collections
applied_collection_rate_over_100
receipt_without_company
unsupported_receipt_status
```

Limitación Zeta vigente: la relación exacta `recibo ↔ factura` no está expuesta
por API certificada. Por eso `Cobrado aplicado` se lee desde el estado de las
ventas emitidas y `Cobrado registrado` desde el libro de recibos. Pueden diferir
legítimamente por timing, cobros de deuda anterior o ventas cobradas después del
corte.

Consumidores migrados en FASE 2:

| Consumidor | Antes | Después |
|---|---|---|
| Collections report preview/PDF | `Total cobrado` sobre recibos | `Cobrado registrado` / `Recibos registrados` |
| Finanzas detalle aplicado | `Cobrado` + copy de recibos | `Cobrado aplicado` + fuente ventas/saldo |
| Hoy situación financiera | `Cobrado acumulado` sobre recibos | `Cobros registrados acumulados` |
| Cliente 360 por factura | `Cobrado según Zeta` | `Cobrado aplicado según Zeta` |
| Dashboard Ventas vs Cobros | `Cobrado` | `Cobrado aplicado` |

Diff read-only FASE 2:

Script: `scripts/audit-canonical-collections-diff.ts`.

| Período | Moneda | Ventas emitidas | Pendiente | Aplicado | Registrado | Diferencia | Recibos | % aplicado | Clasificación |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 2026-07-01→2026-07-14 | UYU | 1.307.357,50 | 555.734 | 751.623,50 | 378.888 | 372.735,50 | 11 | 57,49% | `DATA_QUALITY` |
| 2026-07-01→2026-07-14 | USD | 20.182,96 | 14.853,50 | 5.329,46 | 2.844,68 | 2.484,78 | 9 | 26,41% | `DATA_QUALITY` |
| 2026-06-01→2026-06-30 | UYU | 737.702,50 | 49.880 | 687.822,50 | 725.091 | -37.268,50 | 30 | 93,24% | `DATA_QUALITY` |
| 2026-06-01→2026-06-30 | USD | 10.551,48 | 1.230,10 | 9.321,38 | 6.942,28 | 2.379,10 | 19 | 88,34% | `DATA_QUALITY` |

Volumen auditado: 593 facturas cargadas y 356 recibos cargados. Diagnóstico:
`missing_invoice_currency: 4`. Sin `IMPLEMENTATION_DEFECT`.

## 12. Riesgos y limitaciones Zeta

- `balance_amount` se sincroniza por cron cada ~3 h; refleja estado actual, no el
  cierre exacto de un `cutoff` pasado (ver `docs/vendors/z/KNOWN-DIVERGENCES.md` DIV-004).
- Cuotas reales (`proto_invoice_installments`) aún no integradas en los builders
  a nivel de datos: el aging por cuota depende de que el caller expanda las filas.
- Opening balance / NC pre-período: fuera del alcance de esta capa (los maneja el
  motor de reconciliación).
