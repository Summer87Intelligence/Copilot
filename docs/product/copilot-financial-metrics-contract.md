# Copilot — Contrato de Métricas Financieras

> Versión: 2026-06-08  
> Audiencia: equipo de producto, ingeniería, QA.  
> Autoridad: este documento define la fuente semántica única para cada métrica. Cualquier label, tooltip o cálculo que difiera de lo aquí definido es una inconsistencia.

---

## Regla fundacional

**Cada métrica tiene una única fuente de verdad.** Los módulos consumen esa fuente; no la recalculan. Si dos pantallas muestran "lo mismo" con números distintos, una de ellas está usando la métrica equivocada o necesita un disclaimer que explique la diferencia.

---

## Las 9 métricas canónicas

### 1. Deuda activa (`deuda_activa`)

| Atributo | Valor |
|----------|-------|
| **Definición** | Saldo pendiente activo de clientes, dedupeado (sin filas shadow Zeta/saldos pendientes), con `balance_amount > 0` |
| **Fórmula** | `SUM(proto_invoices.balance_amount) WHERE balance_amount > 0 AND category != 'Zeta / saldos pendientes'`, agrupado por `currency_code` |
| **Fuente** | `lib/copilot-clients-portfolio.ts` → `lib/zeta/zeta-operational-debt-dedup.ts` |
| **Moneda** | Separada UYU / USD. Nunca sumadas. |
| **Scope temporal** | Corriente (hoy) |
| **Campos** | `ClientPortfolioRow.debt_uyu` / `debt_usd` |
| **Label UI permitido** | "Clientes por cobrar", "Deuda total", "Saldo pendiente activo" |
| **Label prohibido** | "Deuda total activa y del período" (mezcla con deuda_periodo) |
| **Módulos consumidores** | Hoy (money card Clientes por cobrar), Hoy (tabla deudores), Rutas/clientes-riesgo, Alertas |

**Cuándo puede diferir de otra métrica:**
- Difiere de `deuda_periodo`: deuda_activa es el *stock total al día*; deuda_periodo es el *flujo dentro de un rango seleccionado*.
- Difiere de Finanzas snapshot `receivables_risk_weighted`: el snapshot aplica ponderación por probabilidad de cobro.

---

### 2. Deuda vencida (`deuda_vencida`)

| Atributo | Valor |
|----------|-------|
| **Definición** | Subset de deuda activa cuya fecha de vencimiento (`due_date`) ya pasó |
| **Fórmula** | `sumCarteraAgingOverdue(agingByCurrency)` — suma buckets 31_60 + 61_90 + 90_plus. Fallback: `portfolio.overdue_uyu` / `overdue_usd` si aging no disponible |
| **Fuente primaria** | `lib/copilot-cartera-aging-totals.ts` (`sumCarteraAgingOverdue`) |
| **Fuente fallback** | `ClientPortfolioRow.overdue_uyu` / `overdue_usd` |
| **Moneda** | Separada UYU / USD |
| **Scope temporal** | Corriente |
| **Label UI permitido** | "Deuda vencida", "Saldo vencido >30 días", "Vencido >30 días", "Deuda crítica +30 días" |
| **Módulos consumidores** | Hoy (card Clientes por cobrar, subvalor vencido), Hoy (columna Vencido en tabla), Alertas, Rutas/clientes-riesgo |

**Invariante:** `deuda_vencida ≤ deuda_activa` por moneda, siempre.

**Nota sobre la doble fuente:** La fuente primaria (aging Cartera) y la fuente fallback (portfolio.overdue_uyu) pueden producir valores levemente distintos porque el aging se construye desde el motor de reconciliación mientras que el portfolio usa la clasificación operativa directa. El modo de fuente activo se determina en `resolveOverdueDisplaySemantics()`.

---

### 3. Deuda del período (`deuda_periodo`)

| Atributo | Valor |
|----------|-------|
| **Definición** | Facturas emitidas dentro del rango Desde/Hasta seleccionado que siguen pendientes al cierre del rango |
| **Fórmula** | `report.currencies[currency].pendingAtCutoff` — extraído por `carteraPeriodActivityFromReport()` |
| **Fuente** | `lib/copilot-hoy-scopes.ts` → `lib/copilot-financial-reconciliation.ts` |
| **Moneda** | Separada UYU / USD |
| **Scope temporal** | Depende del rango Desde/Hasta |
| **Label UI permitido** | "Por cobrar al cierre del período", "Pendiente al corte del rango" |
| **Módulos consumidores** | Hoy (sección actividad del período), Cartera (con filtro de rango) |

**Cuándo puede diferir de Hoy:**  
Cartera con rango seleccionado muestra deuda_periodo. Hoy sin filtro muestra deuda_activa. Son conceptos distintos. Si el usuario necesita comparar, Cartera debe aclarar con tooltip: *"Puede diferir de Hoy porque esta vista aplica el rango seleccionado."*

---

### 4. Facturado del período (`facturado_periodo`)

| Atributo | Valor |
|----------|-------|
| **Definición** | Facturas emitidas dentro del rango, neto de notas de crédito |
| **Fórmula** | `issuedInPeriod - creditNoteAmount = issuedInPeriodNet` |
| **Fuente** | `lib/copilot-hoy-scopes.ts` → `lib/copilot-cartera-cards-source.ts` |
| **Moneda** | Separada UYU / USD |
| **Scope temporal** | Período seleccionado |
| **Label UI permitido** | "Facturado del período", "Facturado" |
| **Módulos consumidores** | Hoy (actividad del período), Hoy (card ejecutiva UYU/USD) |

---

### 5. Cobrado registrado (`cobrado_periodo`)

| Atributo | Valor |
|----------|-------|
| **Definición** | Recibos registrados en el rango. Puede superar facturado si hay cobros de facturas de períodos anteriores |
| **Fórmula** | `SUM(receipts.amount) WHERE receipt_date BETWEEN from AND to`, agrupado por currency |
| **Fuente** | `lib/copilot-hoy-scopes.ts` → `lib/copilot-financial-reconciliation.ts` |
| **Moneda** | Separada UYU / USD |
| **Scope temporal** | Período seleccionado |
| **Label UI permitido** | "Cobrado registrado", "Recibos registrados" |
| **Módulos consumidores** | Hoy (actividad del período), Hoy (card ejecutiva UYU/USD) |

**Aviso obligatorio en UI cuando `cobrado_periodo > facturado_periodo`:**  
*"Cobraste más de lo facturado en el período porque hay cobros de facturas anteriores."*

**Diferencia con `cobrado_aplicado`:** cobrado_periodo = recibos registrados en el rango por `receipt_date`. cobrado_aplicado = ventas emitidas en el período saldadas al corte. Pueden diferir legítimamente.

---

### 6. Cobrado aplicado (`cobrado_aplicado`)

| Atributo | Valor |
|----------|-------|
| **Definición** | Cobros imputados contra facturas emitidas en el rango. Residual: `facturado − pendiente al cierre` |
| **Fórmula** | `max(0, issuedInPeriodNet - pendingAtCutoff)` — implícito en `portfolioResolvedAmount` |
| **Fuente** | `lib/copilot-cartera-cards-source.ts` (`portfolioResolvedAmount`) |
| **Moneda** | Separada UYU / USD |
| **Scope temporal** | Período seleccionado |
| **Label UI permitido** | "Cobrado aplicado" |
| **Módulos consumidores** | Hoy (operatingResult implícito), Cartera (reconciliación) |

---

### 7. Caja disponible (`caja_disponible`)

| Atributo | Valor |
|----------|-------|
| **Definición** | Dinero disponible en Tesorería: saldo apertura + cobros Zeta posteriores + ingresos manuales − egresos manuales |
| **Fórmula** | `openingBalance + collectedFromClients + manualIncome - manualExpense + adjustments + transfersNet` |
| **Fuente** | `lib/treasury/treasury-cash-position.ts` (`calculateCashPosition`) |
| **Moneda** | Separada por `CashPositionByCurrency.currency` |
| **Scope temporal** | Corriente |
| **Campos** | `CashPositionByCurrency.availableCash` |
| **Label UI permitido** | "Caja disponible", "Dinero disponible" |
| **Label prohibido** | "Neto acumulado" (ese es el snapshot cashNet, concepto distinto), "Caja neta" |
| **Módulos consumidores** | Hoy (card Caja disponible), Hoy (proyección), Tesorería |

**IMPORTANTE:** `caja_disponible` (Treasury) ≠ `snapshotCashNet` (Finanzas).  
- `caja_disponible`: saldo real de Tesorería, basado en movimientos configurados.  
- `snapshotCashNet` (Finanzas "Neto acumulado"): cobros registrados − pagos de proto_payments, combinado UYU+USD. Es un flujo acumulado del motor, no el saldo bancario.

---

### 8. Caja después de pagos (`caja_despues_pagos`)

| Atributo | Valor |
|----------|-------|
| **Definición** | Caja disponible menos pagos programados en próximos 30 días. Negativo = déficit |
| **Fórmula** | `safeCash30d = availableCash - TreasuryOutflowSummary.next30Days` (por moneda) |
| **Fuente** | `lib/copilot-hoy-treasury.ts` (`buildHoyProjection30dBlocks`) |
| **Moneda** | Separada por moneda |
| **Scope temporal** | Rolling 30 días desde hoy |
| **Campos** | `HoyProjection30dBlock.safeCash30d` |
| **Label UI permitido** | "Caja después de pagos", "Cobertura 30 días" |
| **Acento visual** | critical (rojo) si `safeCash30d < 0`; adjusted (ámbar) si cobertura tensa; comfortable (verde) si cubre |
| **Módulos consumidores** | Hoy (card Caja después de pagos), Hoy (proyección 30d), ExecutiveSummaryCard (flag cashAfterPaymentsCritical) |

---

### 9. Estado global del sistema (`estado_global`)

| Atributo | Valor |
|----------|-------|
| **Definición** | Estado operativo global derivado de múltiples señales: healthy / attention / critical |
| **Fórmula** | `critical` si `riskBand === 'critical'` OR `coverageRatio < 0.5` OR `highRiskCount >= 3`; `attention` si `riskBand === 'high'` OR `coverageRatio < 1.0` OR `overdueCount > 0`; `healthy` en caso contrario |
| **Fuente** | `lib/copilot-today-business-pulse.ts` (`determineStatus`) |
| **Señales de entrada** | snapshotRiskBand, snapshotCoverageRatio, portfolio.highRiskClients, portfolio.overdueClients |
| **Moneda** | N/A |
| **Label UI permitido** | "Estado del sistema", "Salud del negocio", "Estado" |
| **Módulos consumidores** | Hoy (badge ExecutiveSummaryCard), Hoy (hero headline), Hoy (drawer tones) |

**Señales que contribuyen al estado (deben ser visibles en el popover):**

| Señal | Fuente | CTA |
|-------|--------|-----|
| Deuda vencida de clientes | Cartera aging | Ver Cartera |
| Caja después de pagos | Tesorería | Ver Tesorería |
| Ratio de cobertura financiera | Financial snapshot | Ver Finanzas |
| Clientes de alto riesgo | Portfolio | Ver Clientes críticos |

---

## Reglas de integridad UYU/USD

1. **Nunca sumar UYU + USD** en métricas de deuda, caja o cobros. Son monedas distintas sin conversión.
2. **Los campos legacy** `total_debt`, `overdue_debt`, `total_billing` en `ClientPortfolioRow` son mixed-currency y **no deben usarse para display**.
3. **El financial snapshot** (Finanzas) combina monedas por diseño. Siempre debe acompañarse del disclaimer: *"Estimación operativa — combina UYU y USD sin conversión de tipo de cambio."*
4. **Un cliente con deuda en UYU y USD** genera dos filas en la tabla de deudores. El conteo de clientes únicos se deduplica por `company_id`.

---

## Navegación requerida entre módulos

| Desde | Hacia | Label CTA | Estado |
|-------|-------|-----------|--------|
| Hoy → Clientes con deuda | `/copilot/cartera` | "Ver toda la cartera" | ✅ Existe |
| Hoy → Alertas atención | `/copilot/clientes?filter=attention` | "Ver clientes con atención" | ✅ Existe |
| Hoy → Caja después de pagos | `/copilot/tesoreria` | "Ver Tesorería" | ✅ Existe |
| Cartera → Cliente 360 | `/copilot/clientes/{company_id}` | "Ver ficha" | ✅ Existe (via deepLink) |
| Finanzas → Tesorería | `/copilot/tesoreria` | "Ver caja y pagos" | ✅ Existe |
| Alertas/deuda vencida → Cartera filtrada | `/copilot/cartera?filter=overdue` | "Ver clientes vencidos" | ✅ Existe |
| Estado sistema popover → módulo relacionado | varies | CTA por señal | ✅ Existe |

---

## Divergencias por diseño (no son bugs)

| Módulo A | Métrica A | Módulo B | Métrica B | Razón |
|----------|-----------|----------|-----------|-------|
| Hoy | deuda_activa (stock total) | Cartera con filtro | deuda_periodo (flujo en rango) | Scope temporal diferente — cartera tiene filtro de rango |
| Hoy | caja_disponible (treasury) | Finanzas | snapshotCashNet (motor) | Fuentes distintas por diseño: treasury = saldo bancario configurado; snapshot = flujo de proto_payments |
| Hoy | cobrado_periodo (recibos brutos) | Cartera | cobrado_aplicado (imputación) | cobrado_periodo puede > cobrado_aplicado si hay cobros de facturas anteriores |
| Hoy | deuda_vencida (aging primary) | Portfolio | overdue_uyu (clasificación directa) | Fuente aging vs portfolio — leemente puede diferir; `resolveOverdueDisplaySemantics()` selecciona la prioritaria |

---

## Anti-patterns a evitar

- ❌ Sumar `total_debt` (UYU+USD mezclados) y mostrarlo como "deuda total"
- ❌ Mostrar `snapshotCashNet` como "Caja disponible" — son cosas distintas
- ❌ Comparar `deuda_activa` con `deuda_periodo` sin aclarar que el scope temporal es diferente
- ❌ Un alert de "deuda vencida" que apunta a clientes que no están en la tabla de Hoy
- ❌ Un estado "critical" cuando todas las señales están OK

---

## Contrato TypeScript

Ver `lib/copilot-financial-metrics-contract.ts` para:
- `METRIC_ID` — identificadores canónicos
- `METRIC_LABEL` — labels visibles autorizados
- `CANONICAL_METRICS` — definición completa de cada métrica
- `CURRENCY_INTEGRITY_RULES` — reglas de integridad moneda
- `REQUIRED_NAVIGATION_CTAS` — CTAs de navegación requeridas
- `SYSTEM_STATE_SIGNALS` — señales del popover de estado
