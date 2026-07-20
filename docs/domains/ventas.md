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
| Recibos del período | "Cobrado registrado" |
| Ventas saldadas al corte | "Cobrado aplicado" |
| Pendiente de período | "Pendiente del período" |
| Cobranza efectiva aplicada (A) | `portfolioResolvedAmount / issuedInPeriodNet` — ver `docs/domains/cobranza.md` |
| Cobros registrados / ventas (B) | `collectedInPeriod / issuedInPeriodNet` — ver `docs/domains/cobranza.md` |
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

## Ejecutivo vs Vendedor (confirmado 2026-07-20 — FASE SALES-SELLER-DOCUMENT-LEVEL-CONFIRMATION-001)

Dos roles distintos, nunca confundibles:

| Rol | Alcance | Tabla | Se gestiona en |
|---|---|---|---|
| **Ejecutivo** | Responsable del **cliente** (cartera, relación comercial continua) | `sales_client_salespersons` (vigencia por fecha) | Ventas → Ejecutivos, Cliente 360 |
| **Vendedor** | Responsable del **comprobante/ticket completo** (quién hizo esa operación puntual) | `sales_document_salespersons`, `UNIQUE(workspace_id, document_id)` | Ventas → Detalle, Cliente 360 |

**Regla definitiva:** el vendedor se asigna al comprobante completo, nunca a una línea o servicio individual. Un comprobante con varias líneas (ej. ticket A-3032: Gestión Redes Sociales, Gestión Publicitaria, Automatización LinkedIn, HTML, Simulador IA + Email) comparte un único vendedor para todas sus líneas — la línea es solo el detalle comercial (artículo/servicio) dentro del comprobante, no tiene vendedor independiente.

Identidad exclusiva: **`document_id`** (`proto_invoices.id`, UUID). Nunca número visible, serie, descripción, línea, índice de posición ni fingerprint de contenido — ver `DIV-CONT-011` en `KNOWN-DIVERGENCES.md` (Zeta no expone un identificador de línea estable; por eso mismo no se modela vendedor por línea).

**UI (Ventas → Detalle):** las líneas de un mismo `document_id` se agrupan visualmente; se muestra un único selector de Vendedor en la primera línea; las líneas hermanas muestran "Incluido en este comprobante" (nunca un selector duplicado con el mismo valor). Actualización optimista, sin recarga completa, sin resetear scroll/filtros/búsqueda, revalidación de métricas debounced en background.

**Métricas (`buildSellerSalesSummary`):** cuentan y atribuyen por **documento**, nunca por línea — un comprobante de 5 líneas con total $68.320 cuenta como 1 operación de $68.320 para su vendedor, jamás 5 operaciones ni $341.600.

**Notas de crédito:** nunca muestran selector de vendedor, nunca cuentan como operación vendida, solo reducen el neto del bucket correspondiente.

## Divergencias conocidas

`DIV-CONT-011` (Zeta no expone número de línea estructurado) — **cerrada 2026-07-20 como no requerida**: el modelo de vendedor es por documento completo, no por línea, así que la ausencia del campo no bloquea nada. Ver `docs/vendors/z/KNOWN-DIVERGENCES.md`.
