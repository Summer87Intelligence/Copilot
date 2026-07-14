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

Loader de datos (I/O, fuera del dir puro): `lib/financial/canonical-debt-loader.ts`
(`invoiceRowToCanonical`, `fetchCanonicalInstallments` — carga cuotas en batch).
| `metric-definitions.ts` | Puente al diccionario de labels (`copilot-financial-metrics-contract`). |
| `index.ts` | Barrel público. Importar siempre desde aquí. |

## Reglas

- UYU y USD **nunca** se suman sin `exchangeRate` explícito.
- STOCK (deuda/aging) al `cutoff`; PERÍODO (ventas/cobranza) en `[from, to]`.
- Aging por `due_date`, nunca `issue_date`.
- `MIN_FINANCIAL_DATE = 2026-01-01` excluye comprobantes previos.
- Funciones puras, sin I/O. Toda entrada normalizada por `internal.ts`.

Tests: `canonical-financial-layer.test.ts` (casos 1–12 + invariantes).
