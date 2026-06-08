# Auditoría Financiera Integral — QA-001

**Fecha:** 2026-06-08  
**Alcance:** `/copilot/hoy`, `/copilot/clientes`, `/copilot/clientes/[id]`, `/copilot/cartera`, `/copilot/finanzas`, `/copilot/tesoreria`, `/copilot/alertas`  
**Metodología:** Lectura exhaustiva de código fuente (pages, API routes, libraries). Sin acceso a datos live.

---

## 1. Arquitectura de Fuentes de Verdad

### Tablas Supabase

| Tabla | Propósito | Campos clave |
|---|---|---|
| `proto_invoices` | Facturas de clientes (Zeta sync) | `balance_amount`, `total_amount`, `currency_code`, `issue_date`, `due_date`, `due_date_source`, `status`, `is_active`, `zeta_metadata` |
| `proto_receipts` | Recibos de cobranza (Zeta sync) | `amount`, `currency_code`, `receipt_date`, `status`, `company_id` |
| `proto_companies` | Empresas/clientes | `id`, `name`, `is_active` |
| `proto_invoice_installments` | Cuotas de facturas (ZETA-08) | `invoice_id`, `cuota_saldo`, `cuota_vencimiento`, `cuota_total` |
| `proto_payments` | Pagos operativos manuales | `amount`, `payment_date`, `category` |
| `treasury_manual_cash_movements` | Movimientos manuales de caja | `amount`, `movementType`, `currencyCode`, `movementDate` |
| `treasury_opening_balances` | Saldos iniciales de tesorería | `currency`, `amount`, `effectiveDate` |
| `treasury_planned_cash_obligations` | Obligaciones de caja programadas | `amount`, `due_date`, `status` |
| `proto_tax_obligations` | Obligaciones fiscales | `estimated_amount`, `confirmed_amount`, `due_date`, `status`, `tax_type` |
| `copilot_notifications` | Centro de alertas | `type`, `severity`, `amount`, `currency`, `read_at` |
| `zeta_sync_state` | Estado de sincronización Zeta | `resource_flow`, `last_success_at`, `bootstrap_completed` |

### Motores de cálculo

| Motor | Archivo | Propósito |
|---|---|---|
| Reconciliación | `lib/copilot-financial-reconciliation.ts` | Motor principal: currencies, aging, staleness, orphans |
| Dashboard | `lib/copilot-financial-dashboard-metrics.ts` | KPIs ejecutivos multi-cliente |
| Snapshot/Liquidez | `lib/copilot-financial-engine.ts` | Liquidez proyectada + flujo de caja |
| Portfolio clientes | `lib/copilot-clients-portfolio.ts` | Cartera comercial por cliente |
| Deuda actual cliente | `lib/copilot-client-current-debt-summary.ts` | Deuda actual de un cliente específico |
| Caja | `lib/treasury/treasury-cash-position.ts` | Posición de caja tesorería |
| Dedup operacional | `lib/zeta/zeta-operational-debt-dedup.ts` | Eliminación de shadow invoices Zeta |

---

## 2. Análisis por Pantalla

### 2.1 `/copilot/hoy`

**Archivo:** `app/copilot/hoy/page.tsx`

**Llamadas API (paralelas con `Promise.allSettled`):**
1. `GET /api/copilot/rutas-hub` → snapshot + portfolio (hub)
2. `GET /api/copilot/financial-reconciliation?mode=all_outstanding` → estado cartera actual
3. `GET /api/copilot/financial-reconciliation?mode=period_only&period_start=X&period_end=Y` → actividad del período
4. `GET /api/copilot/treasury/scheduled-payments?include_summary=1&horizon_days=30` → pagos programados
5. `GET /api/copilot/treasury/cash-position` → posición de caja
6. `GET /api/copilot/treasury/manual-cash-movements` → movimientos manuales

**Métricas mostradas y su origen:**

| Métrica | Query | Origen |
|---|---|---|
| Deuda vencida | `reconCurrentResult.report.agingByCurrency` | `all_outstanding` → `proto_invoices (balance_amount > 0, is_active=true, issue_date >= 2026-01-01)` |
| Cobrado a la fecha | `reconCurrentResult.report.currencies[code].totalCollected` | Derivado: `max(0, totalInvoiced - totalPending)` — **NO desde recibos** |
| Deuda al día (corriente) | `sumCarteraAgingCurrent(report.agingByCurrency)` | Aging bucket "0_30" del all_outstanding |
| Facturado en período | `periodReportCurrencies` | `period_only` → facturas en `[period_start, period_end]` |
| Caja disponible | `treasuryCashPositions[].availableCash` | `openingBalance + collected + manualIncome - manualExpense` |
| Pagos programados (30d) | `treasuryOutflowSummaries` | `treasury_planned_cash_obligations` + `treasury_scheduled_payments` |

### 2.2 `/copilot/clientes`

**Archivo:** `app/copilot/clientes/page.tsx`  
**Función de carga:** `fetchClientPortfolioLoad()` → `lib/copilot-client-portfolio-fetch.ts`

**Tabla origen principal:** `proto_invoices` + `proto_companies` + `proto_contacts`  
**Filtros:** `is_active=true`, `issue_date >= 2026-01-01`, excluye `is_credit_note`, excluye voided  
**Dedup:** `selectOperationalDebtInvoicesForSummation()` — elimina shadow rows `category = "Zeta / saldos pendientes"`

**Métricas en cards superiores (siempre globales, ignoran filtros de vista):**

| Métrica | Cálculo | Origen |
|---|---|---|
| Clientes activos | `load.rows.length` | Portfolio completo |
| Con deuda activa | `rows.filter(r => r.debt_uyu > 0 || r.debt_usd > 0).length` | `proto_invoices.balance_amount > 0` por cliente |
| Vencidos | `rows.filter(r => (r.overdue_uyu ?? 0) > 0 || (r.overdue_usd ?? 0) > 0).length` | `due_date < hoy` por cliente |
| Sin contacto | `rows.filter(r => !r.has_contact_data).length` | `proto_contacts` |

**Campos de portfolio (`ClientPortfolioRow`):**

| Campo | Fuente | Nota |
|---|---|---|
| `debt_uyu` / `debt_usd` | `proto_invoices.balance_amount` | Per-currency, post-dedup |
| `overdue_uyu` / `overdue_usd` | `balance_amount` donde `due_date < hoy` | Per-currency |
| `total_debt` | Suma mixta UYU+USD | **LEGACY** — no usar para reportes |
| `billing_uyu` / `billing_usd` | `proto_invoices.total_amount` | Per-currency |

### 2.3 `/copilot/clientes/[id]`

**Archivo:** `app/copilot/clientes/[companyId]/page.tsx`  
**Componente:** `CopilotClient360View`

**Fuente de deuda actual:** `lib/copilot-client-current-debt-summary.ts`  
- Tabla: `proto_invoices` (dataset completo del cliente, activas e inactivas)  
- Regla: `pendingAmount = max(0, balance_amount ?? total_amount)`  
- Excluye: voided, `total_amount <= 0`, moneda indeterminable  
- **NO usa recibos** — deuda calculada desde balances de facturas

**Estado de cuenta:** `lib/copilot-client-account-statement.ts`  
- Vista "Por factura": muestra cada factura con `balance_amount` de Zeta  
- Vista "Cuenta corriente": ledger cronológico  

### 2.4 `/copilot/cartera`

**Archivo:** `app/copilot/cartera/page.tsx` → `components/copilot/cartera-shell.tsx`  
**API:** `GET /api/copilot/financial-reconciliation?mode=period_only&period_start=X&period_end=Y`  
**Motor:** `generateFinancialConsistencyReport()` en `lib/copilot-financial-reconciliation.ts`

**Queries ejecutadas (paralelas):**

```sql
-- Facturas
SELECT id, company_id, currency_code, total_amount, balance_amount, status,
       updated_at, issue_date, due_date, due_date_source, zeta_metadata
FROM proto_invoices
WHERE workspace_company_id = {tenantId}
  AND is_active = true
  AND issue_date >= '2026-01-01'
ORDER BY id ASC

-- Recibos
SELECT id, company_id, currency_code, amount, receipt_date, status
FROM proto_receipts
WHERE workspace_company_id = {tenantId}
  AND is_active = true
  AND receipt_date >= '2026-01-01'
  AND receipt_date <= {period_end}   -- solo en mode=period_only
ORDER BY receipt_date ASC, id ASC

-- Cuotas
SELECT invoice_id, currency_code, cuota_saldo, cuota_total, cuota_vencimiento
FROM proto_invoice_installments
WHERE workspace_company_id = {tenantId}
ORDER BY cuota_vencimiento ASC, id ASC

-- Empresas
SELECT id, name FROM proto_companies
WHERE workspace_company_id = {tenantId} AND is_active = true

-- Sync state
SELECT resource_flow, last_success_at, bootstrap_completed
FROM zeta_sync_state
WHERE company_id = {tenantId}
```

**Métricas calculadas por `generateFinancialConsistencyReport()`:**

| Campo | Fórmula | Moneda |
|---|---|---|
| `totalInvoiced` | Σ `total_amount` facturas no-voided en `[periodStart, periodEnd]` | Por moneda |
| `totalPending` | Σ `balance_amount > 0` de TODAS las facturas hasta `periodEnd` | Por moneda |
| `previousPending` | `pendingAtCutoff - issuedInPeriod` | Por moneda |
| `totalCollected` | `round2(max(0, totalInvoiced - totalPending))` | Por moneda |
| `collectedInPeriod` | Σ `proto_receipts.amount` en período | Por moneda — DATO REAL |
| `collectionEffectiveness` | `collectedInPeriod / totalInvoiced` (si invoiced > 0) | Por moneda |
| `openingBalance` | `issued_pre - collected_pre - creditNotes_pre` | Por moneda |

**Aging:** Buckets `0_30 / 31_60 / 61_90 / 90_plus` desde `due_date`  
- Si `due_date_source = 'zeta_cuotas_v1'` → fecha real  
- Si `due_date_source = 'synthetic_30d'` → `issue_date + 30d`  
- `agingSource` = `'real' | 'synthetic' | 'mixed' | 'none'`

### 2.5 `/copilot/finanzas`

**Archivo:** `app/copilot/finanzas/page.tsx`  
**Motor principal:** `getFinancialSnapshot()` → `lib/copilot-financial-engine.ts`

**Fuentes de datos:**

| Fetch | Destino | Endpoint/función |
|---|---|---|
| Snapshot de liquidez | `snapshot` | `getFinancialSnapshot()` → `/api/copilot/financial-snapshot` |
| Obligaciones fiscales | `taxObligations` | `getProtoTaxObligations()` → `proto_tax_obligations` |
| Facturas (modo cobertura) | `invoiceRows` | `getProtoInvoices()` → `proto_invoices (all active)` |
| Pagos (modo cobertura) | `paymentRows` | `getProtoPayments()` → `proto_payments` |
| Alertas predictivas | `predictiveHint` | `getFinancialPredictiveAlerts()` |

**Métricas del panorama de liquidez (`FinancialSnapshotApiV1`):**

| Métrica UI | Selector | Cálculo en motor |
|---|---|---|
| Neto acumulado | `snapshotCashNet(snapshot)` | Σ `proto_receipts` − Σ `proto_payments` |
| Cobranza esperada | `snapshotReceivablesRiskWeighted(snapshot)` | Σ (`balance_amount × collection_probability`) de facturas abiertas |
| Egresos proyectados | `snapshotExpectedOutflowsTotal(snapshot)` | `proto_payments` futuros + `proto_tax_obligations` en 30d |
| Balance proyectado | `snapshotLiquidityBalance(snapshot)` | `cashNet + receivablesWeighted − expectedOutflows` |
| Cobertura de pagos | `snapshotCoverageRatio(snapshot)` | `(cashNet + receivables) / expectedOutflows` |
| Facturado (desglose) | `snapshot.by_currency[code].invoiced` | Σ `total_amount` facturas activas |
| Pendiente (desglose) | `snapshot.by_currency[code].pending` | Σ `balance_amount > 0` |
| Vencido (desglose) | `snapshot.by_currency[code].overdue` | Σ `balance_amount` donde `due_date < hoy` |

**Obligaciones fiscales:**

| Métrica | Cálculo |
|---|---|
| Próximas (45 días) | `due_date` en `[hoy, hoy+45]` y `status != 'paid'` |
| Vencidas | `due_date < hoy` OR `status = 'overdue'` |
| Estimado 30 días | Σ `estimated_amount` de pendientes en `[hoy, hoy+30]` |

### 2.6 `/copilot/tesoreria`

**Archivo:** `app/copilot/tesoreria/page.tsx` → `components/copilot/tesoreria/tesoreria-shell.tsx`

**APIs de tesorería:**

| Endpoint | Propósito | Tabla |
|---|---|---|
| `GET /treasury/cash-position` | Posición de caja actual | `treasury_opening_balances` + `treasury_manual_cash_movements` |
| `GET /treasury/planned-cash-obligations` | Obligaciones programadas | `treasury_planned_cash_obligations` |
| `GET /treasury/scheduled-payments` | Pagos programados | `treasury_scheduled_payments` |
| `GET /treasury/manual-cash-movements` | Movimientos manuales | `treasury_manual_cash_movements` |
| `GET /treasury/bank-reconciliation-movements` | Movimientos bancarios | `treasury_bank_reconciliation_movements` |
| `GET /treasury/alerts` | Alertas de caja | Motor `treasury-alert-engine.ts` |
| `GET /treasury/projection` | Proyección 30d | Motor `treasury-cash-projection.ts` |

**Fórmula caja disponible:**
```
availableCash[currency] =
  openingBalance[currency]
  + collectedFromClients[currency]   ← de Cartera (opcional)
  + manualIncome[currency]
  - manualExpense[currency]
  + adjustments[currency]
  + transfersNet[currency]
```

**Filtros:** Solo movimientos `is_active=true`, `shouldCountManualCashInCashflow(m)=true`, con `baselineDate` respetado por moneda.

### 2.7 `/copilot/alertas`

**Archivo:** `app/copilot/alertas/page.tsx`  
**Hook:** `useCopilotNotifications()` → `GET /api/copilot/notifications`  
**Tabla:** `copilot_notifications`

**Métricas derivadas de las notificaciones:**

| Métrica | Tipo de notificación |
|---|---|
| No leídas | `!read_at` |
| Críticas | `severity = 'critical'` |
| Vencimientos | `type IN ('treasury_payment_due', 'treasury_payment_overdue')` |
| Cobros recibidos | `type = 'collection_received'` |
| Clientes con alertas | `type IN ('client_overdue', 'new_debtor')` |
| Alertas sistema | `type IN ('sync_changes_detected', 'sync_failed', 'cash_risk_detected', 'copilot_action_suggested', 'notification_digest')` |

**Importante:** Las métricas de Alertas son event-driven (notificaciones), no calculadas en tiempo real desde `proto_invoices`. Son conteos de eventos, no balances.

---

## 3. Matriz de Consistencia

> **Leyenda:** ✅ Consistente | ⚠️ Diferencia intencional documentada | ❌ Diferencia problemática | — No aplica

### 3.1 DEUDA TOTAL (Pendiente de cobro)

| Pantalla | Query | Tabla | Filtros | Moneda | Período |
|---|---|---|---|---|---|
| **Hoy** | Σ `balance_amount > 0` (aging buckets) | `proto_invoices` | `is_active=true, issue_date >= 2026-01-01` | Por moneda | `all_outstanding` (sin corte) |
| **Cartera** | Σ `balance_amount > 0` (totalPending) | `proto_invoices` | `is_active=true, issue_date >= 2026-01-01` | Por moneda | `all_outstanding` o `period_only` |
| **Clientes lista** | Σ `balance_amount > 0` por cliente | `proto_invoices` | `is_active=true, issue_date >= 2026-01-01, no shadow rows` | Por moneda (debt_uyu/debt_usd) | All outstanding |
| **Clientes [id]** | Σ `max(0, balance_amount ?? total_amount)` | `proto_invoices` | Activas + inactivas (para historial completo) | Por moneda | All outstanding |
| **Finanzas** | Σ `balance_amount > 0` | `proto_invoices` | `is_active=true` | Por moneda | All outstanding |
| **Tesorería** | No muestra deuda total de facturas | — | — | — | — |

**Resultado:** ⚠️ **Diferencia documentada entre Clientes [id] y el resto.**

`copilot-client-current-debt-summary.ts` procesa el dataset completo (activas e inactivas) para "deuda real histórica". Todas las demás pantallas usan `is_active=true`. Esto puede mostrar saldo mayor en el detalle del cliente versus la vista de cartera.

**Acción recomendada:** Documentar explícitamente en la UI del detalle de cliente que "Deuda actual incluye facturas archivadas con saldo pendiente". Agregar nota en `copilot-client-current-debt-summary.ts` como advertencia visible.

---

### 3.2 DEUDA VENCIDA

| Pantalla | Base de vencimiento | Fuente | Nota |
|---|---|---|---|
| **Hoy** | `due_date` (real o sintético) | `agingByCurrency` de reconciliación `all_outstanding` | Aging buckets `0_30/31_60/61_90/90_plus` |
| **Cartera** | `due_date` (real o sintético) | `agingByCurrency` reconciliación `period_only` | Igual que Hoy pero con período filtrado |
| **Clientes lista** | `due_date < hoy` | `loadClientPortfolioSourceRows` | Campo `overdue_uyu/overdue_usd` |
| **Clientes [id]** | `due_date` o `issue_date + 30d` | `buildClientCurrentDebtSummary` | Aging por cliente |
| **Finanzas** | `due_date < hoy` | `snapshot.by_currency[code].overdue` | Motor snapshot independiente |
| **Dashboard metrics** | `issue_date` only (no due_date) | `copilot-financial-dashboard-metrics.ts` | **DIFERENTE: no usa due_date** |

**Resultado:** ❌ **Diferencia problemática detectada.**

`copilot-financial-dashboard-metrics.ts` (usado en el hub/rutas-hub) calcula aging desde `issue_date` únicamente, ignorando `due_date`. El resto de las pantallas usa `due_date` (real de Zeta cuando disponible, o sintético +30d). Esto provoca que el mismo cliente pueda aparecer como "vencido a 45 días" en Cartera pero "vencido a 75 días" en el dashboard del Hub.

**Acción recomendada:** Alinear `copilot-financial-dashboard-metrics.ts` para usar `due_date` cuando `due_date_source = 'zeta_cuotas_v1'`, idéntico al motor de reconciliación.

---

### 3.3 CLIENTES CON DEUDA

| Pantalla | Cálculo | Fuente |
|---|---|---|
| **Clientes lista** | `rows.filter(r => r.debt_uyu > 0 \|\| r.debt_usd > 0).length` | Portfolio load |
| **Cartera** | `staleClients.filter(c => pendingByCurrency > 0).length` | Reconciliation report |
| **Hoy** | No muestra count directo | — |

**Resultado:** ⚠️ **Diferencia de definición.**

Cartera usa `staleClients` (clientes con deuda que pueden incluir solo los que tienen facturas detectadas en el reporte), mientras Clientes usa el portfolio completo incluyendo clientes derivados de facturas sin `proto_companies` row. El count puede diferir cuando hay clientes "Vía facturación" (sin company row).

---

### 3.4 CLIENTES VENCIDOS

| Pantalla | Cálculo | Fuente |
|---|---|---|
| **Clientes lista** | `rows.filter(r => (r.overdue_uyu ?? 0) > 0 \|\| (r.overdue_usd ?? 0) > 0).length` | Portfolio load (proto_invoices) |
| **Alertas** | `tabCounts.clientes` (notifications `client_overdue` + `new_debtor`) | `copilot_notifications` |

**Resultado:** ❌ **Diferencia estructural — fuentes completamente distintas.**

Las alertas son eventos disparados por el motor de notificaciones (basado en reglas), no un conteo en tiempo real desde `proto_invoices`. El número de alertas de "cliente vencido" NO corresponde al número de clientes vencidos en el portfolio. Esta diferencia es estructural e intencional, pero debe documentarse para el usuario.

---

### 3.5 COBRADO

| Pantalla | Fórmula | Fuente | Tipo |
|---|---|---|---|
| **Hoy** (carteraCollectedToDate) | `max(0, totalInvoiced - totalPending)` | `report.currencies[code].totalCollected` | **Derivado de facturas** |
| **Cartera cards** | `max(0, totalInvoiced - totalPending)` | `CurrencyReconciliation.totalCollected` | **Derivado de facturas** |
| **Cartera (collectedInPeriod)** | Σ `proto_receipts.amount` en período | `CurrencyReconciliation.collectedInPeriod` | **Real desde recibos** |
| **Finanzas (Neto acumulado)** | Σ `proto_receipts` − Σ `proto_payments` | `snapshotCashNet` | **Cash-flow (diferente)** |
| **Finanzas cobertura** | Σ `proto_receipts.amount × collection_probability` | `snapshotReceivablesRiskWeighted` | **Esperado ponderado** |
| **Clientes [id]** | `totalInvoiced - totalPending` | `copilot-client-current-debt-summary.ts` | **Derivado de facturas** |

**Resultado:** ❌ **Diferencias múltiples — tres definiciones distintas de "cobrado".**

1. **Cobrado derivado** (`totalCollected = invoiced - pending`): usado en cards de Cartera, Hoy, Clientes. Es una aproximación calculada desde balances de facturas, no desde recibos reales.
2. **Cobrado real** (`collectedInPeriod = Σ receipts`): disponible en el motor de reconciliación pero NO expuesto en las cards principales. Solo accesible a través de `report.collectedInPeriod`.
3. **Neto acumulado** (`cashNet = receipts - payments`): usado en Finanzas panorama. Incluye pagos a proveedores, es una métrica de flujo de caja diferente.

**Acción recomendada CRÍTICA:** Las cards de Cartera y Hoy deben mostrar `collectedInPeriod` (real desde recibos) como métrica primaria de "cobrado". El valor derivado `totalCollected` puede coexistir como métrica secundaria. Renombrar `totalCollected` → `estimatedCollected` en el tipo para claridad.

---

### 3.6 FACTURADO (Emitido)

| Pantalla | Fórmula | Período | Exclusiones |
|---|---|---|---|
| **Hoy** (período) | Σ `total_amount` facturas no-voided | `period_only` (período seleccionado) | Voided, NCs, pre-2026 |
| **Cartera** | Σ `total_amount` facturas no-voided | `period_only` (período seleccionado) | Voided, NCs, pre-2026 |
| **Finanzas (by_currency)** | Σ `total_amount` facturas activas | All outstanding | Voided, pre-2026 |
| **Clientes lista** | Σ `total_amount` por cliente | All outstanding | Shadow rows, voided, NCs |

**Resultado:** ⚠️ **Diferencia de período — intencional.**

Hoy y Cartera usan período filtrado. Finanzas y Clientes usan all outstanding. Al comparar "Facturado" entre pantallas con distintos períodos, los números diferirán. Esto es correcto semánticamente pero puede confundir al usuario.

---

### 3.7 SALDO PENDIENTE

Sinónimo de DEUDA TOTAL. Ver sección 3.1.

---

### 3.8 CAJA DISPONIBLE

| Pantalla | Fórmula | Tablas | Nota |
|---|---|---|---|
| **Hoy** | `openingBalance + collected + manualIncome - manualExpense + adjustments + transfers` | `treasury_opening_balances` + `treasury_manual_cash_movements` | Tesorería manual |
| **Tesorería** | Idéntica a Hoy | Ídem | Misma fuente |
| **Finanzas** | `snapshotCashNet = Σ receipts - Σ payments` | `proto_receipts` + `proto_payments` | **Motor diferente, tabla diferente** |

**Resultado:** ❌ **Diferencia estructural — dos definiciones de "caja".**

- **Tesorería/Hoy** define caja como: saldo inicial configurado + movimientos manuales. Es la caja operativa registrada en el módulo de tesorería.
- **Finanzas panorama** define caja como: todos los recibos Zeta menos todos los pagos registrados en `proto_payments`. Es un flujo de caja contable acumulado.

Ambas métricas son correctas para su propósito. El problema es que si un usuario compara "Caja disponible" entre Hoy y Finanzas, verá números diferentes. Los labels deben diferenciarse claramente.

**Acción recomendada:** En Finanzas, cambiar el label "Neto acumulado" a "Flujo neto acumulado (recibos − pagos)" para distinguirlo de "Caja disponible" de Tesorería.

---

### 3.9 CAJA DESPUÉS DE PAGOS (Proyectada)

| Pantalla | Fórmula | Horizonte |
|---|---|---|
| **Hoy/Tesorería** | `availableCash - scheduledOutflows30d` | 30 días (pagos programados) |
| **Finanzas** | `cashNet + receivablesWeighted - expectedOutflows` | 30 días (motor de proyección) |

**Resultado:** ⚠️ **Diferencia intencional — modelos diferentes.**

La caja proyectada de Tesorería es conservadora (caja real − compromisos firmes). La de Finanzas es forward-looking (incluye cobranza esperada ponderada). Ambas son válidas pero no deben compararse directamente.

---

## 4. Problemas Detectados

### P1 — CRÍTICO: Tres definiciones de "Cobrado" sin distinción visual

**Impacto:** Alto  
**Pantallas afectadas:** Hoy, Cartera, Finanzas  
**Descripción:** Las cards de "Cobrado" / "Cobranza efectiva" en Hoy y Cartera usan `totalCollected = invoiced - pending` (estimación derivada de balances de facturas). Finanzas usa `snapshotCashNet = receipts - payments` (flujo real). Cartera tiene acceso a `collectedInPeriod` (recibos reales) pero no lo usa como métrica principal en las cards. Un usuario puede ver tres números distintos para "lo cobrado" en el mismo período dependiendo de qué pantalla mire.

**Fix recomendado:**
- Exponer `collectedInPeriod` (recibos reales) como métrica primaria en las cards de Cartera y Hoy
- Renombrar `totalCollected` → `estimatedCollected` en el tipo `CurrencyReconciliation`
- Agregar tooltip explicando la diferencia cuando ambos valores están disponibles

---

### P2 — ALTO: Aging con base temporal diferente en Dashboard metrics

**Impacto:** Alto  
**Pantallas afectadas:** Rutas-hub, cualquier pantalla que consuma `copilot-financial-dashboard-metrics.ts`  
**Descripción:** `copilot-financial-dashboard-metrics.ts` calcula aging desde `issue_date` únicamente. El motor de reconciliación (`copilot-financial-reconciliation.ts`) usa `due_date` (real de Zeta o sintético). Para clientes con cuotas a 60+ días, la factura puede aparecer como "vencida a 30 días" en el dashboard del hub pero "sin vencer" en Cartera.

**Fix recomendado:** En `buildFinancialDashboardMetrics`, usar `due_date` cuando disponible, con fallback a `issue_date + 30d` (mismo patrón que el motor de reconciliación).

---

### P3 — ALTO: Clientes vencidos — fuentes incomparables

**Impacto:** Medio-Alto  
**Pantallas afectadas:** Clientes lista vs Alertas  
**Descripción:** "Clientes vencidos" en la pantalla Clientes se calcula en tiempo real desde `proto_invoices`. Las alertas de "cliente vencido" en Alertas son eventos históricos del motor de notificaciones. Un cliente puede aparecer en una lista pero no en la otra (si la alerta fue enviada antes de un pago parcial, o si el motor de notificaciones no disparó para ese cliente).

**Fix recomendado:** Agregar nota de UX en Alertas que indique "estas son alertas enviadas; para el estado actual ir a Clientes". No hay fix de código requerido pero la documentación de UX es necesaria.

---

### P4 — MEDIO: Deuda total diferente en Clientes [id] vs Cartera

**Impacto:** Medio  
**Pantallas afectadas:** Clientes [id] (detalle de cliente) vs Cartera  
**Descripción:** `copilot-client-current-debt-summary.ts` incluye facturas inactivas (`is_active=false`) en el cálculo de deuda del cliente para "reflejar deuda real histórica". El motor de reconciliación usa `is_active=true` únicamente. Si hay facturas archivadas con saldo pendiente > 0, el detalle del cliente mostrará más deuda que Cartera.

**Fix recomendado:** Agregar badge en la UI del detalle de cliente: "Incluye facturas archivadas con saldo pendiente" cuando `deuda_total_incluyendo_inactivas > deuda_total_activas`.

---

### P5 — MEDIO: Caja disponible — dos definiciones sin label diferenciado

**Impacto:** Medio  
**Pantallas afectadas:** Finanzas vs Hoy/Tesorería  
**Descripción:** "Neto acumulado" en Finanzas (= recibos − pagos) puede confundirse con "Caja disponible" en Tesorería (= saldo inicial + movimientos manuales). Son métricas fundamentalmente distintas.

**Fix recomendado:** En Finanzas, el label "Neto acumulado" es correcto pero agregar subtítulo "Cobros Zeta registrados − pagos operativos". En Hoy, mantener separadas las secciones de "Cartera" y "Tesorería" con headers claros.

---

### P6 — BAJO: Campos legacy mixed-currency en ClientPortfolioRow

**Impacto:** Bajo  
**Descripción:** `total_debt`, `total_billing`, `overdue_debt` están marcados en el código como `TODO: legacy mixed-currency aggregate`. Ninguna pantalla los usa para mostrar valores, pero existen en el tipo y podrían ser consumidos en reportes PDF.  

**Fix recomendado:** Verificar que `debtors-report.tsx` y `collections-report.tsx` usen los campos per-currency, no los legacy.

---

### P7 — BAJO: Notas de crédito — consistencia entre pantallas

**Impacto:** Bajo  
**Descripción:** 
- Motor de reconciliación: detecta NCs via `isCreditNoteFromMetadata(r.zeta_metadata)` y las trata separadamente
- Portfolio de clientes: usa `isCreditNoteFromMetadata()` en el dedup
- Clientes [id] estado de cuenta: muestra NCs como "factura" con metadata

Las NCs son consistentemente excluidas del `totalPending` (Zeta ajusta `balance_amount` a 0 para NCs aplicadas). No hay doble conteo detectado. El riesgo es que NCs no aplicadas (con `balance_amount > 0`) aparezcan como deuda en el aging.

---

## 5. Resumen de Doble Conteo / Duplicados

### Shadow invoices (Zeta `saldos_pendientes`)
**Estado:** ✅ Controlado  
`selectOperationalDebtInvoicesForSummation()` en `zeta-operational-debt-dedup.ts` excluye rows con `category = "Zeta / saldos pendientes"` antes de sumar. Aplica en portfolio clientes.

### Recibos duplicados
**Estado:** ✅ Controlado  
Pipeline Recibos usa upsert por `(workspace_company_id, payment_number)` con `ZETA:REC:{RegistroId}`. No puede duplicarse el mismo recibo Zeta. Recibos manuales tienen `payment_number` diferente.

### Facturas duplicadas (vouchers Zeta)
**Estado:** ✅ Controlado  
Pipeline usa upsert por `(workspace_company_id, invoice_number)`. El motor de reconciliación aplica `is_active=true` como filtro adicional.

### Notas de crédito
**Estado:** ✅ Controlado para NCs aplicadas  
NCs aplicadas tienen `balance_amount = 0` en Zeta. Motor las excluye de `totalPending`. Riesgo menor: NCs emitidas pero no aplicadas aún tendrán `balance_amount > 0` y aparecerán en el aging.

### Opening balance / período anterior
**Estado:** ⚠️ A verificar  
`openingBalance = issued_pre - collected_pre - creditNotes_pre`. Si hay recibos pre-período no sincronizados, el opening balance puede ser incorrecto. La calidad de este campo depende de la completitud del sync de recibos históricos.

---

## 6. Exclusiones y Filtros Globales

| Exclusión | Implementación | Alcance |
|---|---|---|
| Pre-2026 (`MIN_FINANCIAL_DATE = '2026-01-01'`) | Hard filter en todas las queries | Todas las pantallas |
| Facturas voided | `status IN ('paid','void','voided','canceled','cancelled','anulada','anulado','annulled','annul')` | Motor reconciliación + portfolio |
| Facturas inactivas | `is_active = true` | Todas excepto Clientes [id] (ver P4) |
| Shadow invoices Zeta | `category != "Zeta / saldos pendientes"` | Portfolio clientes únicamente |
| Notas de crédito | `is_credit_note = isCreditNoteFromMetadata(zeta_metadata)` | Reconciliación + portfolio |
| Recibos inactivos | `is_active = true` | Reconciliación |
| Pagos negativos/inválidos | `amount > 0` | Pipeline recibos y pagos |
| Facturas sin moneda | Contadas en `invoicesWithoutCurrency` pero excluidas de buckets | Motor reconciliación |

---

## 7. Período y Modo

| Pantalla | Modo | period_start | period_end | Impacto |
|---|---|---|---|---|
| Hoy — estado actual | `all_outstanding` | — | — | Incluye toda deuda histórica 2026 |
| Hoy — actividad período | `period_only` | Seleccionado | Seleccionado | Solo facturas del período |
| Cartera | `period_only` | Seleccionado | Seleccionado | Solo facturas del período |
| Finanzas snapshot | N/A (motor independiente) | — | hoy | All outstanding al corte de hoy |
| Clientes | All outstanding | — | — | Toda deuda 2026 |
| Tesorería | N/A (movimientos de caja) | — | — | Desde `effectiveDate` del saldo inicial |

---

## 8. Moneda

Todas las pantallas operan en **multi-moneda (UYU + USD por separado)**. No hay conversión automática entre monedas en ningún motor. Los campos legacy `total_debt`/`total_billing` en `ClientPortfolioRow` son mixtos (UYU+USD sin convertir) y están marcados como deprecated.

La métrica "Neto acumulado" en Finanzas es multi-moneda combinada (UYU+USD) y viene acompañada del disclaimer `METRIC_MIXED_CURRENCY_DISCLAIMER`.

---

## 9. Recomendaciones Priorizadas

| Prioridad | Problema | Acción | Estado |
|---|---|---|---|
| **P1 — CRÍTICO** | Tres definiciones de "Cobrado" | Exponer `collectedInPeriod` (recibos) como métrica primaria en Cartera y Hoy | ✅ CERRADO 2026-06-08 |
| **P2 — ALTO** | Aging desde `issue_date` en dashboard metrics | Alinear a usar `due_date` con fallback sintético | ✅ CERRADO 2026-06-08 |
| **P3 — ALTO** | Clientes vencidos: fuentes incomparables | Nota UX en Alertas diferenciando eventos de estado actual | ✅ CERRADO 2026-06-08 |
| **P4 — MEDIO** | Deuda mayor en Clientes [id] por incluir inactivas | Badge explicativo en UI del detalle de cliente | ABIERTO |
| **P5 — MEDIO** | Dos definiciones de "caja" sin label diferenciado | Clarificar subtítulos en Finanzas vs Tesorería | ABIERTO |
| **P6 — BAJO** | Campos legacy en reportes PDF | Verificar debtors/collections reports usan per-currency | ABIERTO |
| **P7 — BAJO** | NCs no aplicadas en aging | Sin acción urgente; documentar en KNOWN-DIVERGENCES.md | ABIERTO |
| **QA-002 D-1** | `by_currency.invoiced` all-time vs `issuedInPeriodNet` período en Finanzas | Label "Facturado histórico" + subtitle "Vista de posición total, sin filtro de período." + tooltip en panel "Desglose por moneda" | ✅ CERRADO EXPLAINED_DIFF 2026-06-08 |

### Detalle de fixes aplicados (2026-06-08)

**P1 — Cobrado unificado a `collectedInPeriod`**
- `lib/copilot-today-business-pulse.ts` → `carteraPeriodMetricsFromReport()`: antes `m.portfolioResolvedAmount`, ahora `m.collectedInPeriod`
- `components/copilot/executive-summary-cards.tsx` → `effectivenessCard()`: antes `portfolioResolvedAmount / netIssued`, ahora `collectedInPeriod / netIssued` (muestra "—" si no hay datos de recibos)
- `lib/copilot-financial-ux-copy.ts` → tooltip de efectividad actualizado: "Recibos cobrados / Facturado neto"
- `collectedAppliedCard` queda como métrica secundaria mostrando `portfolioResolvedAmount` (residuo derivado)

**P2 — Aging por `due_date`**
- `lib/copilot-financial-dashboard-metrics.ts`: aging ahora usa `parseRowYmd(inv, "due_date")`. Si `due_date` es null → `ageDays = null` → la factura NO entra en ningún bucket de aging ni en `oldestAgeDays` del deudor
- Antes: `issue_date` siempre producía un bucket (incluso para facturas sin vencimiento real); ahora solo facturas con `due_date` real contribuyen al aging

**P3 — Alertas label clarificado**
- `app/copilot/alertas/page.tsx`: banner de clientes vencidos ahora dice "N eventos generados por clientes vencidos" con nota "Eventos históricos del motor de alertas · Ver Cartera para el estado actual"
- CTA "Ver clientes vencidos →" apunta a `/copilot/cartera?filter=overdue` (sin cambio)

**QA-002 D-1 — Label "Facturado histórico" para snapshot all-time (2026-06-08)**
- `app/copilot/finanzas/page.tsx` → panel "Desglose por moneda":
  - Añadido subtitle: `"Vista de posición total, sin filtro de período."` (10px, muted)
  - `<dt>Facturado</dt>` → `<dt title="..." className="cursor-help underline decoration-dotted">Facturado histórico</dt>`
  - Tooltip: "Incluye todas las facturas activas históricas. Puede diferir del Facturado del período porque no aplica el rango Desde/Hasta."
- Diferencia D-1 ahora es visible para el usuario: label y contexto diferentes al Facturado del período

**Validaciones post-fix:**
- `npx tsc --noEmit` → ✅ limpio
- `npm test` → ✅ 3074/3074
- `npm run build` → ✅ sin errores
- `npx eslint` → ✅ limpio
- `audit:copilot-system-consistency` → ✅ 6 OK, 2 sin datos (pre-existentes)
- `audit:zeta-contract` → ✅ 0 BLOCKERs
- `audit:zeta-sync-health` → ⚠️ 1 error pre-existente (cron stalled, no relacionado)
- `audit:zeta-pdf-parity` → ⚠️ DIFF_HABER pre-existentes (fuera de alcance)

---

## 10. Estado de Consistencia por Métrica

| Métrica | Hoy | Cartera | Finanzas | Clientes | Tesorería | Consistencia |
|---|---|---|---|---|---|---|
| **DEUDA TOTAL** | ✅ all_outstanding | ✅ period_only | ✅ all_outstanding | ✅ all_outstanding | — | ⚠️ Período distinto intencional |
| **DEUDA VENCIDA** | ✅ due_date | ✅ due_date | ✅ due_date | ✅ due_date | — | ✅ Consistente post-P2 |
| **CLIENTES CON DEUDA** | — | ✅ staleClients | — | ✅ portfolio | — | ⚠️ Definición distinta (P3 análogo) |
| **CLIENTES VENCIDOS** | — | — | — | ✅ proto_invoices | — | ✅ Alertas clarificada post-P3 |
| **COBRADO** | ✅ collectedInPeriod | ✅ collectedInPeriod (primario) + portfolioResolved (secundario) | ❌ cashNet | — | — | ✅ Primario unificado post-P1 |
| **FACTURADO** | ✅ total_amount período | ✅ total_amount período | ✅ all outstanding ("Facturado histórico") | ✅ all outstanding | — | ✅ Período distinto intencional — label diferenciado post-QA002-D1 |
| **SALDO PENDIENTE** | ✅ balance_amount | ✅ balance_amount | ✅ balance_amount | ✅ balance_amount | — | ✅ Consistente |
| **CAJA DISPONIBLE** | ✅ treasury | — | ❌ cashNet (diferente) | — | ✅ treasury | ❌ Dos definiciones (P5 abierto) |
| **CAJA DESPUÉS PAGOS** | ✅ treasury 30d | — | ⚠️ liquidity balance | — | ✅ treasury 30d | ⚠️ Modelos diferentes, intencional |

---

## 11. Fuentes de Verdad Canónicas por Métrica

| Métrica | Fuente Canónica | Endpoint |
|---|---|---|
| Deuda total pendiente | `proto_invoices.balance_amount` (Zeta sync) | `GET /api/copilot/financial-reconciliation?mode=all_outstanding` |
| Deuda por período | `proto_invoices` filtrada por `issue_date` | `GET /api/copilot/financial-reconciliation?mode=period_only` |
| Cobrado real | `proto_receipts.amount` (Zeta sync) | Mismo endpoint → `report.collectedInPeriod` |
| Facturado | `proto_invoices.total_amount` no-voided | Mismo endpoint → `report.totalInvoiced` |
| Aging | `proto_invoice_installments.cuota_vencimiento` (real) o `issue_date + 30d` (sintético) | Mismo endpoint → `report.agingByCurrency` |
| Obligaciones fiscales | `proto_tax_obligations.estimated_amount / confirmed_amount` | `GET /api/copilot/tax-obligations` |
| Caja disponible | `treasury_opening_balances` + `treasury_manual_cash_movements` | `GET /api/copilot/treasury/cash-position` |
| Proyección de caja | Motor tesorería | `GET /api/copilot/treasury/projection` |
| Alertas | `copilot_notifications` (eventos) | `GET /api/copilot/notifications` |

---

*Auditoría generada automáticamente desde análisis de código fuente — 2026-06-08*  
*Fixes P1, P2, P3 aplicados y validados — 2026-06-08*  
*QA-002 D-1 cerrado como EXPLAINED_DIFF con label visible — 2026-06-08*  
*Próxima revisión recomendada: post-implementación de P4 (badge clientes inactivos) y P5 (label caja)*
