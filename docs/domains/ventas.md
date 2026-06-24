# Dominio Ventas

## Fuente base

`proto_invoices` sincronizada desde Zeta ventas detalladas.

## Motor canónico

`lib/copilot-financial-reconciliation.ts` → `generateFinancialConsistencyReport()`

## Métrica canónica

ID: `facturado_periodo` (ver `lib/copilot-financial-metrics-contract.ts`)
Campo: `issuedInPeriodNet` = `issuedInPeriod - creditNoteAmount`
Label visible: **"Ventas del período"**

## Fórmula

```
Ventas del período =
  facturas activas emitidas en rango (is_active=true, issue_date IN [from, to])
  - notas de crédito del período (cfe_tipo 102/103 vía zeta_metadata)
  - shadows de saldos Zeta duplicados contra CCV1 (dedupZetaSaldosShadowsAgainstCcv1)
  - anuladas/canceladas (status: void | cancelled | anulada)
```

Separado por moneda. **Nunca consolidar UYU/USD sin tipo de cambio explícito.**

## Shadows Zeta y dedup

Filas con `invoice_number = "ZETA:{RegistroId}"` y `category = "Zeta / saldos pendientes"` son
filas de pendiente operativo insertadas cuando el pipeline falla en encontrar el CCV1 canónico.
Si existe un par CCV1 (`invoice_number = "ZETA:CCV1:*"`) con mismo cliente/fecha/moneda/importe,
la fila shadow es un duplicado y debe excluirse antes de acumular ventas.

Función canónica de dedup para reporting:
`dedupeZetaShadowInvoicesForReporting()` en `lib/copilot-zeta-invoice-report-dedup.ts`

## Consumidores

| Módulo | Función | Dedup aplicado |
|--------|---------|----------------|
| Dashboard (KPI) | `buildDashboardSummaryData()` | Sí (motor canónico) |
| Dashboard PDF | `buildDashboardSummaryPdfModel()` | Sí (hereda de summary) |
| Hoy | `carteraPeriodActivityFromReport()` | Sí (motor canónico) |
| Cartera | `buildCurrencyIndex()` | Sí (motor canónico) |
| Finanzas CEO | `buildMonthlySalesYear()`, `buildAnnualSalesYtd()` | Sí (desde fix 1b91caa) |
| Monthly Trends | `buildFinancialMonthlyTrends()`, `buildFinancialTrendDashboard()` | Sí (desde fix 1b91caa) |
| Net Sales Report | `buildNetSalesReportModel()` | Sí (`dedupeZetaShadowInvoicesForReporting`) |

## Invariante verificada

Para cualquier mes 2026, por moneda:

```
reconciliation.issuedInPeriodNet
  === CEO/trends.netSales
  === NetSalesReport.netSales
```

Verificado con `temp-audits/ventas-canonical-diff.ts` post fix `1b91caa`.
Resultado: 12/12 meses × 2 monedas con Δ = 0.

## Labels por contexto

| Contexto | Label correcto |
|----------|---------------|
| KPI de período | "Ventas del período" |
| Cobros de período | "Cobrado del período" |
| Pendiente de período | "Pendiente del período" |
| Efectividad | "Cobrado del período / Facturado neto" (fórmula) |
| Históricos / trends / charts | "Ventas" |
| Reportes Net Sales | "Ventas netas" |
| YTD acumulado | "Ventas acumuladas" (alias aceptado) |
| Contexto estrictamente contable | "Facturado" o "Facturación" aceptable |

## No usar para ventas

- `portfolio_debt` / `deuda_activa` — es deuda total activa, no ventas del período
- `deuda_vencida` — subset vencido, no ventas
- recibos/cobros brutos — son cobros, no ventas
- `cash_position` / `manual_cash_movements` — son movimientos de caja
- datos sin dedup de shadows aplicado

## Divergencias conocidas

Ninguna activa. Ver `docs/vendors/z/KNOWN-DIVERGENCES.md` para divergencias a nivel Zeta.
