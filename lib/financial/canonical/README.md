# `lib/financial/canonical/`

Capa canónica única de métricas financieras. Documentación completa:
[`docs/technical/financial-canonical-layer.md`](../../../docs/technical/financial-canonical-layer.md).

## Uso

```ts
import {
  buildCanonicalFinancialContext,
  buildCanonicalFinancialSummary,
} from "@/lib/financial/canonical";

const context = buildCanonicalFinancialContext({
  workspaceId,
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31", // cutoff = periodEnd por defecto
});

const summary = buildCanonicalFinancialSummary({ context, invoices, receipts });
```

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `types.ts` | Tipos canónicos (moneda, buckets, métricas, contexto, entradas). |
| `report-context.ts` | Construcción/validación de `CanonicalFinancialContext`. |
| `currency.ts` | Reexport de conversión probada + guards de separación UYU/USD. |
| `internal.ts` | Helpers de filtrado compartidos (no exportar fuera de la capa). |
| `sales.ts` | `buildCanonicalSalesMetrics` — ventas del período (`issue_date`). |
| `collections.ts` | `buildCanonicalRegisteredCollectionsMetrics` — recibos (`receipt_date`). |
| `debt-units.ts` | `buildCanonicalDebtUnits` — **fuente única** de unidades vencibles (factura/cuota) + diagnósticos. |
| `metrics-from-units.ts` | `buildCanonicalDebtMetricsFromUnits`, `buildCanonicalAgingMetricsFromUnits`. |
| `debt.ts` | `buildCanonicalDebtMetrics` — deuda stock al corte (delega en debt units). |
| `aging.ts` | `buildCanonicalAgingMetrics` — aging por vencimiento (delega en debt units). |
| `snapshot.ts` | `buildCanonicalDebtSnapshot` — vista agregada compartida (byCurrency/byCompany/diagnósticos/clientes con atraso). |
| `summary.ts` | `buildCanonicalFinancialSummary` — API única por moneda + diagnósticos. |
| `../canonical-debt-loader.ts` | Loader de datos I/O (`invoiceRowToCanonical`, `fetchCanonicalInstallments` — carga cuotas en batch). |
| `metric-definitions.ts` | Puente al diccionario de labels (`copilot-financial-metrics-contract`). |
| `index.ts` | Barrel público. Importar siempre desde aquí. |

## Reglas

- UYU y USD **nunca** se suman sin `exchangeRate` explícito.
- STOCK (deuda/aging) al `cutoff`; PERÍODO (ventas/cobranza) en `[from, to]`.
- Aging por `due_date`, nunca `issue_date`.
- `MIN_FINANCIAL_DATE = 2026-01-01` excluye comprobantes previos.
- Funciones puras, sin I/O. Toda entrada normalizada por `internal.ts`.

Tests: `canonical-financial-layer.test.ts` (casos 1–12 + invariantes).

## Consumidores migrados

- Cliente 360: `lib/copilot/client-360-aging.ts`.
- Hoy / Deudores: usan clasificación por `due_date` sin fallback a emisión.
- Cartera FASE 1C: `lib/copilot/cartera-operating-aging.ts`.

`buildCarteraOperatingAging` consume `buildCanonicalDebtSnapshot` y expone un
payload serializable para cards, aging analytics, explorer, tabla y top deudores:

- cinco buckets operativos: Al día, 1–7, 8–14, 15–30, +30 días de atraso;
- `unclassifiedDueDateBalance` para saldo pendiente sin fecha de vencimiento;
- `byCompany` para estado/filtros/top deudores sin `dominantAgingRange`;
- `invoiceCount` visible = facturas únicas; `debtUnitCount` = cuotas/unidades para auditoría.

Cuotas: soporte implementado y testeado por fixtures; Summer87 audit
`2026-07-14` procesó 0 cuotas reales, por lo que aún no hay validación con datos
reales del tenant.

Tests de Cartera:

- `lib/copilot/cartera-operating-aging.test.ts`
- `lib/copilot/cartera-operating-aging.consistency.test.ts`

Diff read-only:

```powershell
node --env-file=.env.local --import tsx scripts/audit-canonical-debt-diff.ts
```

El script no imprime nombres ni identificadores sensibles; reporta solo agregados
por moneda y clasificaciones (`NO_DIFFERENCE`, `EXPECTED_SEMANTIC_CHANGE`,
`DATA_QUALITY`, `IMPLEMENTATION_DEFECT`, `SCOPE_DIFFERENCE`).

Resultado Summer87 `2026-07-14`: `Pending` sin diferencia por moneda; cambio
semántico esperado en `Current`, `Overdue`, buckets operativos y clientes con
atraso por migrar de `issue_date` a `due_date`; `Unclassified` en 0; diagnósticos
sin `IMPLEMENTATION_DEFECT`.
