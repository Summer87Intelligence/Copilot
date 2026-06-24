# Dominio Cobranza — tasas y efectividad

## Familias canónicas (ratio)

Definidas en `lib/copilot-financial-metrics-contract.ts` → `COLLECTION_RATE_METRICS`.

| ID | Familia | Label | Fórmula | Pregunta |
|----|---------|-------|---------|----------|
| `applied_collection_rate` | **A** | Cobranza efectiva aplicada | `portfolioResolvedAmount / issuedInPeriodNet` | ¿Qué % de lo emitido en el período quedó resuelto al corte? |
| `registered_collection_rate` | **B** | Cobros registrados / ventas | `collectedInPeriod / issuedInPeriodNet` | ¿Cuánto entró por recibos en el período respecto a lo emitido? |
| `promise_fulfillment_rate` | **D** | Cumplimiento de promesas | `promisesKept / promisesClosed` | ¿Qué tan efectiva fue la gestión operativa? |
| `debt_recovery_rate` | **C** | Recuperación de deuda | `recovered / outstandingDebt` | ¿Cuánto de la deuda vencida se recuperó? |

**No mezclar familias.** A y B pueden diferir en el mismo mes (recibos de facturas anteriores, mes parcial, imputación al corte).

## Labels prohibidos (ambiguos)

- "Cobranza efectiva" sin calificador
- "Efectividad de cobros"
- "Tasa de cobranza" (usar A o B con label explícito)

## Consumidores por familia

### A — Cobranza efectiva aplicada

| Módulo | Campo / ratio |
|--------|----------------|
| Dashboard | `efectividad` en `extractDashboardCurrencyData` |
| Hoy | `%` junto a Cobrado aplicado |
| Dashboard PDF | `efectividad` |
| Finanzas panorama | `collectionRate` en `buildPanoramaCurrencySlice` |

### B — Cobros registrados / ventas

| Módulo | Campo / ratio |
|--------|----------------|
| Cartera | `collectedInPeriod / issuedInPeriodNet` |
| Finanzas trends | `collectionRate` en `buildFinancialTrendDashboard` |
| Cobranza hub | montos "Cobros este mes" (sin ratio) |
| Reporte PDF cobros | lista de recibos |

### D — Cumplimiento de promesas

| Módulo | Campo |
|--------|-------|
| Cobranza hub | `promiseFulfillmentRate` |

### C — Recuperación de deuda

| Módulo | Campo |
|--------|-------|
| Cliente 360 | `historicalRecoveryRate` |
| Decision engine | `recovery_rate_pct` |

## Relación con ventas

Ventas del período = `issuedInPeriodNet` (ver `docs/domains/ventas.md`). Todas las tasas A y B usan el mismo denominador.

## Historial operativo

`/api/copilot/cobranza/history` alimenta montos B (cobros registrados por `receipt_date`). No calcula ratio en UI del hub.
