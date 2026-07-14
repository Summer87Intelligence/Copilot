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

## 6. Invariantes garantizadas por tests

- `aging.total === debt.pendingBalance` (mismo universo de facturas).
- `sales.appliedCollected === max(0, issuedNet − pendingAtCutoff)`.
- Casos 1–5: buckets de atraso por días desde `due_date`.
- Caso 6: cuotas — aging solo sobre balance abierto.
- Caso 7: recibo de julio de factura de junio → cobrado registrado julio, **no** ventas julio.
- Caso 8: factura julio / cobro agosto → ventas julio, aplicado 0 al corte, registrado agosto.
- Caso 9: NC reduce `issuedNet`.
- Caso 10: UYU/USD separados.
- Caso 11: pre-2026 excluidas + diagnóstico.
- Caso 12: `currency_code` nulo excluido + diagnóstico.

Test: `lib/financial/canonical/canonical-financial-layer.test.ts`.

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

## 12. Riesgos y limitaciones Zeta

- `balance_amount` se sincroniza por cron cada ~3 h; refleja estado actual, no el
  cierre exacto de un `cutoff` pasado (ver `docs/vendors/z/KNOWN-DIVERGENCES.md` DIV-004).
- Cuotas reales (`proto_invoice_installments`) aún no integradas en los builders
  a nivel de datos: el aging por cuota depende de que el caller expanda las filas.
- Opening balance / NC pre-período: fuera del alcance de esta capa (los maneja el
  motor de reconciliación).
