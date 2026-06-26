# COLLECTION-AGING-MODEL-AUDIT-001-REPORT

**Tipo:** Auditoría previa a implementación (read-only). **No se modificó código ni se hizo commit.**
**Alcance:** Modelo único de clasificación de deuda/clientes por antigüedad + 3 cambios de copy + 2 cambios funcionales.
**Fecha:** 2026-06-26
**Estado del repo:** rama limpia, último commit `f5349cb` (UI-CONSISTENCY-USD-VIEW-001).

---

## 1. Resumen ejecutivo

El sistema **no tiene un modelo único de antigüedad**: conviven **cuatro modelos** con anclas y umbrales distintos, lo que genera la inconsistencia que motivó este pedido.

| # | Modelo | Ancla temporal | Buckets | Dónde manda |
|---|--------|----------------|---------|-------------|
| **A** | Estado comercial del cliente (`copilot-client-debt-status.ts`, "CLIENT-DEBT-SEMANTICS-001 / Summer87") | **`issue_date`** | 0–30 *Con deuda* · 31–90 *Atrasado* · >90 *Crítico* | Clientes, badges "Salud", PDFs columna Estado, Dashboard conteos |
| **B** | Vencido de portfolio (`copilot-clients-portfolio.ts` → `overdue_uyu/usd`, `overdue_days_*`) | **`due_date < hoy`** | binario vencido/no vencido + días | Cobranza KPIs, tabla deudores Hoy, montos "Atrasado" en PDFs |
| **C** | Aging de conciliación (`copilot-financial-reconciliation.ts` → `agingByCurrency`) | **`due_date` real (zeta_cuotas_v1)** o fallback **`issue_date`** | `0_30 / 31_60 / 61_90 / 90_plus` | Cartera (gráfico aging), Dashboard chart, `deuda_vencida` fallback |
| **D** | Aging por cuota (`copilot-installment-aging.ts`) | **`cuota_vencimiento`** | `current / overdue_0_30 / 31_60 / 61_90 / 90_plus` | Motor ZETA-08, observación/diagnóstico |

**Conclusión clave:** el modelo nuevo solicitado (0–7 no atrasado · 8–14 · 15–30 · +30, **desde fecha de factura**) **coincide en ancla** con el Modelo A (issue_date), que ya es el "más canónico". Pero **ningún** modelo actual usa los cortes 7/14/30; todos usan 30/60/90. Por lo tanto el cambio es **principalmente de umbrales + colores + copy**, no de fuente de datos.

**Recomendación global: GO con fases estrictas.** Fase 1 (copy) es segura e inmediata. El cambio de umbrales (Fases 2–5) es de **riesgo alto** porque toca el motor financiero, ~15 archivos de tests y 4 reportes PDF, y debe hacerse detrás de un helper central + flag, nunca como reemplazo de texto masivo.

> **Bloqueo previo a Fase 2:** 5 preguntas de negocio (sección 7) deben responderse antes de tocar umbrales. La más crítica: **¿el modelo nuevo reemplaza el ancla `due_date` de Cobranza/portfolio por `issue_date`?** Si sí, cambia el significado de "Vencido" en toda la operación de cobranza.

---

## 2. Modelo actual detectado (cómo se calcula hoy)

### 2.1 Fuente de datos

Toda la cadena nace en **Supabase** (`proto_invoices`, `proto_receipts`, `proto_companies`, `proto_invoice_installments`), poblada por el **importador de Zeta** (cron/snapshot). No hay cálculo de aging en el navegador: el frontend consume filas ya derivadas.

```
Zeta (API) ──import──▶ Supabase proto_* ──getClientPortfolio()──▶ ClientPortfolioRow ──▶ UI / PDFs
                                         └──generateFinancial...──▶ agingByCurrency ──▶ Cartera/Dashboard
```

- **`getClientPortfolio()`** (`lib/copilot-clients-portfolio.ts`) es el repositorio central. Produce por cliente y moneda: `debt_uyu/usd`, `overdue_uyu/usd`, `overdue_days_uyu/usd`, `oldest_open_invoice_issue_date`, `open_invoices_count`, `risk`, `payment_behavior`.
- **`overdue_uyu/usd`** se calcula con `due_date < hoy` (`computeInvoiceCurrencyBreakdown`, líneas 322–371).
- **`overdue_days_*`** = días desde el `due_date` de la factura vencida más antigua (`oldestOverdueDays`, líneas 247–267).
- **`oldest_open_invoice_issue_date` / `open_invoices_count`** = insumos para el Modelo A (issue_date), líneas 283–299.

### 2.2 Dato crítico sobre Zeta — ancla de fechas

> Auditado en detalle (ver evidencia abajo). **Respuesta a la pregunta crítica del pedido:**

- **Zeta NO entrega `due_date` a nivel factura** en las APIs primarias (vouchers / saldos): solo `Fecha` (= emisión).
  - `lib/integrations/zeta/zeta-customer-vouchers-mapper.ts:402-420` (solo `fecha_emision`).
  - `lib/integrations/zeta/zeta-factura-cliente.ts:113-156` (solo `issueDate`).
- **`proto_invoices.due_date` es SINTÉTICO** (`issue_date + 30 días`) salvo que haya corrido el sync de cuotas:
  - `zeta-customer-vouchers-mapper.ts:488-500` → `due_date_source: "synthetic_30d"`.
  - `zeta-saldos-pipeline.ts:485-498`.
- **El único vencimiento REAL** viene a nivel cuota: `RESTCuotasV1QueryCliente` → `CuotaVencimiento` → `proto_invoice_installments.cuota_vencimiento`, y solo entonces `due_date_source = 'zeta_cuotas_v1'` (`zeta-installments-pipeline.ts:294-298, 491-493`).
- Documentado en `docs/vendors/z/KNOWN-DIVERGENCES.md` → **DIV-CONT-001** ("`due_date` sintético") y en `lib/copilot-proto-crud-types.ts:176-187`.

**Implicación para el modelo nuevo:** medir "días desde **fecha de factura**" (issue_date) es la opción **más confiable y consistente** porque issue_date es dato real de Zeta para el 100% de las facturas, mientras que due_date es una conjetura (+30d) para la mayoría. Esto **valida** la decisión del pedido de anclar en fecha de factura.

### 2.3 Cómo se calcula cada métrica hoy

| Concepto | Definición actual | Archivo |
|----------|-------------------|---------|
| **Deuda actual** | Σ `balance_amount > 0` por moneda (`debt_uyu/usd`). Atrasado incluido. | `copilot-clients-portfolio.ts`, `copilot-client-current-debt-summary.ts` |
| **Deuda vencida / atrasado** | Σ pendientes con `due_date < hoy` (`overdue_uyu/usd`) **o** suma buckets aging 31+ como fallback | `copilot-clients-portfolio.ts:337-346`, `copilot-cartera-aging-totals.ts:48-55`, `copilot-dashboard-summary.ts:303-310` |
| **Días de atraso** | días desde `due_date` de la vencida más antigua (Modelo B) **o** días desde `issue_date` (Modelo A) según la pantalla | `oldestOverdueDays` (B) vs `deriveClientDebtStatus` (A) |
| **Clientes críticos** | Modelo A: >90 días desde emisión. UI ya renombró el CTA a **"Principales deudores"** (el ancla HTML sigue siendo `#clientes-criticos`) | `copilot-client-debt-status.ts:13`, `copilot-hoy-ui-contract.ts:35-36,43` |
| **Riesgo** | `Bajo/Medio/Alto` por umbrales **de monto** (share %, montos UYU/USD), **no por días** | `copilot-clients-portfolio.ts:410-455`, `copilot-financial-thresholds.ts` |
| **Prioridad** | Motor de decisiones (`decision-engine/*`): score compuesto, buckets `31-60/61-90/90+` | `client-risk-scorer.ts`, `client-priority-ranker.ts` |
| **Aging (Cartera)** | Modelo C: `agingByCurrency`, real-due si `zeta_cuotas_v1`, fallback issue | `copilot-financial-reconciliation.ts:599-674` |
| **Cobranza** | KPIs sobre portfolio: `totalDebt*`, `totalOverdue*`, `clientsWithDebtCount`, `clientsOverdueCount` (overdue = `due_date<hoy`) | `copilot-cobranza-summary.ts:56-92` |
| **Filtros existentes** | Cobranza: `all/withDebt/overdue/noAction`. Clientes: `all/with_debt/delayed/critical/no_contact`. **Ninguno tiene "no atrasados / al día".** | `clientes-a-gestionar-list.tsx:40-45`, `clientes-portfolio-table.tsx:33-39` |

### 2.4 Inconsistencias ya presentes (deuda técnica relevante)

1. **Dos anclas para "atraso":** Cobranza/portfolio mide desde `due_date`; Clientes/badges miden desde `issue_date`. Un mismo cliente puede verse "Atrasado" en una pantalla y no en otra.
2. **Término legacy visible:** `components/copilot/finanzas/financial-panorama-view.tsx:61` aún muestra **"Deuda vencida"** mientras `FINANZAS_COPY.labelDeudaVencidaHoy = "Atrasado"`.
3. **PDF Dashboard** titula el aging "basado en fecha de vencimiento" (`render-dashboard-summary-pdf.ts:311`) pero los conteos de estado usan emisión (Modelo A).
4. **Cobranza** sigue usando la etiqueta **"Vencido"** (`cobranza-kpi-grid.tsx:128`) junto a "Deuda actual".
5. **Verde ya está en uso** para "Al día/OK" (`saludTone` → `success` para `current`, `clientes-portfolio-table.tsx:96`). Ver sección 6 (riesgo de color).

---

## 3. Mapa de impacto por archivo

Leyenda de tipo: **copy** · **UI** · **lógica** · **API/datos** · **helper** · **tests** · **doc** · **PDF**.
Riesgo: 🟢 bajo · 🟡 medio · 🔴 alto.

### 3.1 Copy strings a renombrar (Fase 1)

> "Caja disponible" → "Caja disponible Santander" · "Deuda actual" → "Deuda actual a cobrar" · "Pagos próximos" → "Pagos próximos de la agencia"

| Archivo | Línea(s) | Texto actual | Tipo | Riesgo |
|---------|----------|--------------|------|--------|
| `lib/copilot-hoy-ui-contract.ts` | 19–21, 53, 75, 116–121, 133–141 | las 3 strings (fuente central de Hoy) | copy | 🟢 |
| `lib/copilot-financial-metrics-contract.ts` | 45, 52 | "Deuda actual", "Caja disponible" (`METRIC_LABEL`) | copy | 🟡 (contrato + alias) |
| `lib/copilot-financial-ux-copy.ts` | 34, 101, 112–114 | "Caja disponible", "Deuda actual", "pagos próximos" | copy | 🟢 |
| `components/copilot/tesoreria/tesoreria-ui.ts` | 72 | "Pagos próximos" (tab) | copy | 🟢 |
| `components/copilot/tesoreria/tesoreria-cash-cards.tsx` | 106, 120, 182, 185 | "Caja disponible" | copy/UI | 🟢 |
| `components/copilot/hoy/hoy-money-cards.tsx` | 564, 584, 610, 705, 929 | "Deuda actual", "Pagos próximos" | copy/UI | 🟢 |
| `components/copilot/hoy/hoy-cockpit-card-drawer.tsx` | 303 | "Caja disponible" (hardcoded) | copy/UI | 🟢 |
| `components/copilot/hoy/hoy-clients-with-debt-section.tsx` | 205, 334, 550, 634, 811, 817, 841 | "Deuda actual" | copy/UI | 🟢 |
| `components/copilot/hoy/hoy-attention-clients-drawer.tsx` | 84, 99 | "Deuda actual UYU/USD" | copy/UI | 🟢 |
| `components/copilot/hoy/hoy-executive-summary-card.tsx` | 258 | "Ver pagos próximos" | copy | 🟢 |
| `components/copilot/hoy/hoy-projection-30d-section.tsx` | 136 | "No hay pagos próximos…" | copy | 🟢 |
| `app/copilot/dashboard/dashboard-page-client.tsx` | 621, 1572, 1589–1600, 1818–2056 | "Deuda actual", "Caja disponible" (hardcoded) | copy/UI | 🟡 (muchas inline) |
| `app/copilot/finanzas/finanzas-client.tsx` | 856, 1340, 1356 | las 3 strings | copy/UI | 🟢 |
| `components/copilot/finanzas/financial-executive-sections.tsx` | 260, 268, 362, 579 | "Caja disponible", "Deuda actual" | copy/UI | 🟢 |
| `components/copilot/finanzas/financial-panorama-view.tsx` | 59–61, 158, 234 | "Caja disponible", "Deuda actual", "Pagos próximos" | copy/UI | 🟢 |
| `components/copilot/finanzas/financial-layered-sections.tsx` | 292–307, 548–557, 858 | labels caja/deuda + "Ir a pagos próximos" | copy/UI | 🟢 |
| `components/copilot/cartera-compact-kpi-grid.tsx` | 423, 599 | "Deuda actual" | copy/UI | 🟢 |
| `components/copilot/cobranza/cobranza-kpi-grid.tsx` | 123 | "Deuda actual" | copy/UI | 🟢 |
| `app/copilot/tesoreria/page.tsx` | 18 | "Caja disponible…" (descripción) | copy | 🟢 |
| `components/copilot/tesoreria/*` (forecast, opening, recurring, obligations, unified-action) | varias | "Caja disponible", "pagos próximos" | copy/UI | 🟢 |
| `app/copilot/atencion-prioritaria/page.tsx` | 105, 536 | "caja disponible", "Ver pagos próximos" | copy | 🟢 |
| `components/copilot/reports/*-preview-dialog.tsx` | varias | "Deuda actual" | copy/UI | 🟢 |
| **PDFs:** `render-debtors-report-pdf.ts` (72–77, 217–221), `render-dashboard-summary-pdf.ts` (169–175), `render-executive-monthly-report-pdf.ts` (196–197, 308–310), `render-top-clients-report-pdf.ts` (253–256) | — | "Deuda actual", "Caja disponible" | PDF | 🟡 (parity tests) |
| **Manual/docs:** `lib/copilot-manual/sections.generated.ts` (47–49, 117, 171–172, 572), `glossary-extra.ts` (7–9, 62–64), `docs/product/copilot-financial-metrics-contract.md` (120–152), `PROJECT_CONTEXT.md` (82) | — | las 3 strings | doc/PDF | 🟡 |

> **Nota copy:** "Pagos próximos" en Tesorería es un concepto de **egresos** (pagos a proveedores), no de cobranza. Renombrar a "Pagos próximos de la agencia" es coherente, pero confirmar que "la agencia" es el término de negocio correcto (vs "de Santander", dado el cambio paralelo de "Caja disponible Santander").

### 3.2 Modelo de antigüedad / términos crítico-vencido-riesgo-prioridad (Fases 2–5)

| Archivo | Componente/función | Ruta | Lógica/Texto actual | Tipo | Riesgo |
|---------|--------------------|------|---------------------|------|--------|
| `lib/copilot-client-debt-status.ts` | `deriveClientDebtStatus` / `derivePortfolioDebtStatus` | transversal | **Modelo A**: 0–30/31–90/>90 desde issue_date | helper/lógica | 🔴 (núcleo) |
| `lib/copilot-clients-portfolio.ts` | `computeInvoiceCurrencyBreakdown`, `oldestOverdueDays`, `riskForCompany*` | transversal | **Modelo B**: overdue por due_date; riesgo por monto | helper/lógica/datos | 🔴 |
| `lib/copilot-financial-reconciliation.ts` | `resolveAging`, `AGING_RANGES` | cartera, dashboard | **Modelo C**: buckets 0_30…90_plus | helper/lógica | 🔴 |
| `lib/copilot-installment-aging.ts` | `classifyInstallmentAgingRange`, `computeInstallmentAging` | motor ZETA-08 | **Modelo D**: cuota_vencimiento, buckets …90_plus | helper/lógica | 🔴 |
| `lib/hoy-debt-breakdown.ts` | `classifyStatus`, `buildDebtBreakdown` | hoy (panel expandido) | "Con deuda/Atrasada/Crítica/Parcial" issue_date 30/90 | helper/UI | 🔴 |
| `lib/copilot-cobranza-summary.ts` | `computeCobranzaKpis`, `buildCobranzaClientRows` | cobranza | overdue por portfolio; **sin** subtotales pendiente/atrasado | lógica | 🔴 (Fase 3) |
| `lib/copilot-cartera-aging-totals.ts` | `sumCarteraAgingOverdue/Current` | cartera, hoy | overdue = 31+ | helper | 🟡 |
| `lib/copilot-dashboard-summary.ts` | `extractClientStates`, `deudaVencida` | dashboard | buckets + estado por emisión | lógica/PDF | 🔴 |
| `components/copilot/client-debt-explorer.tsx` | `AGING_LABELS`, `RISK_BADGE`, filtros "Atrasados/Críticos" | cartera | 0–30/31–60/61–90/+90; "Crítico" | UI/copy | 🟡 |
| `components/copilot/aging-analytics.tsx` | `BUCKET_CONFIG` | cartera | "0–30/31–60/61–90/+90 días" + colores | UI | 🟡 |
| `components/copilot/clientes/clientes-portfolio-table.tsx` | `FILTER_OPTIONS`, `saludTone`, `matchesClientFilter` | clientes | filtros delayed/critical; **sin "no atrasados"**; verde=al día | UI/lógica | 🟡 (Fase 4) |
| `components/copilot/cobranza/clientes-a-gestionar-list.tsx` | `ClientFilter`, `OverdueDaysBadge` | cobranza | filtros all/withDebt/overdue/noAction; badge 30/60d; **sin "no atrasados"** | UI/lógica | 🟡 (Fase 3) |
| `components/copilot/cobranza/cobranza-kpi-grid.tsx` | KPI cards | cobranza | "Vencido", "Clientes atrasados"; **sin subtotal pendiente vs atrasado separado** | UI | 🟡 (Fase 3) |
| `app/copilot/dashboard/dashboard-page-client.tsx` | `AGING_DISPLAY`, badges | dashboard | "0–30…+90", "Riesgo alto", "Atrasado/Crítico" | UI/copy | 🟡 |
| `lib/decision-engine/client-risk-scorer.ts`, `client-priority-ranker.ts`, `operational-sla-*` | scoring | acciones, decisiones | buckets `31-60/61-90/90+`, "critical" | lógica/tests | 🔴 |
| `lib/reports/debtors-report/*` | filtros 30/60/90, status labels | reportes | "Crítico/Atrasado/Riesgo alto/Con deuda/Al día" | PDF/lógica/tests | 🔴 |
| `lib/reports/dashboard-summary-report/*`, `executive-monthly-report/*` | aging + estado | reportes | mismos modelos A/B/C | PDF | 🔴 |
| `lib/copilot-business-language.ts` | `BUSINESS_LANGUAGE`, `LEGACY_TO_CANONICAL` | dict | "Atrasado" canónico; mapea "Deuda vencida"→"Atrasado" | copy/helper | 🟢 (subutilizado por UI) |
| `lib/copilot-financial-metrics-contract.ts` | `METRIC_LABEL.deuda_vencida` | dashboard | "Deuda atrasada", "…>30 días" | copy | 🟡 |
| **Manual/docs:** `sections.generated.ts` (49, 158, 576), `glossary-extra.ts` (12–24), `copilot-financial-metrics-contract.md` (37–52), `PROJECT_CONTEXT.md` (138–154), `docs/vendors/z/KNOWN-DIVERGENCES.md` (DIV-CONT-001) | — | semántica vencimiento/emisión y buckets 30/60/90 | doc | 🟡 |

### 3.3 Rutas auditadas — resumen por ruta

| Ruta | Copy (3 strings) | Términos aging/crítico | Fuente copy | Riesgo |
|------|------------------|------------------------|-------------|--------|
| `/copilot/hoy` | Sí (contrato central + inline) | Sí (Atrasado, +30, "Principales deudores") | `copilot-hoy-ui-contract.ts` + inline | 🟡 |
| `/copilot/dashboard` | Sí (mucho hardcoded) | Sí (buckets, "Riesgo alto", "Atrasado/Crítico") | `METRIC_LABEL` + inline | 🔴 |
| `/copilot/finanzas` | Sí | Sí ("Riesgo financiero", "Deuda vencida" legacy) | `FINANZAS_COPY` + inline | 🟡 |
| `/copilot/cartera` | "Deuda actual" | Sí (aging buckets, "Clientes en riesgo", "Crítico") | `FINANCIAL_UX_COPY` + hardcoded | 🔴 (superficie aging) |
| `/copilot/cobranza` | "Deuda actual" | Sí ("Vencido", "Atrasados") | todo inline | 🔴 (Fase 3) |
| `/copilot/clientes` | "Deuda actual" (ficha) | Sí (filtros Atrasados/Críticos) | todo inline | 🟡 (Fase 4) |
| `/copilot/tesoreria` | Sí (las 3) | "Atrasado" = pagos, no deuda cliente | `tesoreria-ui.ts` + inline | 🟢 |
| `/copilot/reportes` | "Deuda actual" | Sí (preview dialogs + PDFs) | inline | 🔴 (PDF) |
| `/copilot/acciones` | "pagos próximos" (empty state) | Sí ("Críticas", "Prioridad", reescribe vencido→atrasado) | inline | 🟡 |
| `/copilot/alertas` | — | Sí ("Crítica", "clientes atrasados", "Principales deudores") | inline | 🟢 |
| `/copilot/mesa-de-ayuda` | — | Solo prioridad de tickets (Baja/Media/Alta) — **fuera de alcance** | `helpdesk-types.ts` | 🟢 |
| `/copilot/atencion-prioritaria` | "caja disponible", "Ver pagos próximos" | Sí ("Crítica", "riesgo", "caso crítico") | inline | 🟡 |
| `/copilot/decisiones`, `/escenarios` | — | "riesgo" (placeholders) | inline | 🟢 |
| `/copilot/manual` | Sí (las 3 documentadas) | Sí (define semántica) | `sections.generated.ts` | 🟡 |
| `/copilot/agentes`, `/datos`, `/admin`, `/configuracion`, `/knowledge/zeta`, `/atencion-...` | sin copy objetivo relevante | — | — | 🟢 |

---

## 4. Modelo nuevo propuesto (especificación técnica)

### 4.1 Nombre canónico

**`collection-aging-model`** → helper central nuevo: `lib/collection-aging/collection-aging-model.ts`
(coexiste junto a `lib/collection/` ya existente; no reutilizar nombres de los 4 modelos legacy para evitar colisión semántica).

### 4.2 Ancla temporal

**`issue_date` (fecha de factura).** Justificación: es el único campo real de Zeta para todas las facturas (sección 2.2); alinea con el Modelo A ya existente; evita la conjetura `+30d` del due_date sintético. **No** usar `due_date` salvo decisión explícita de negocio (pregunta 7.1).

### 4.3 Thresholds y labels (a confirmar el corte del día 7 — ver 4.4)

| Estado canónico (id) | Días desde factura | Label propuesto | Color propuesto |
|----------------------|--------------------|-----------------|-----------------|
| `not_overdue` | 0–7 | "Dentro de plazo" | neutral / azul-gris |
| `overdue_light` | 8–14 | "Atraso leve" | **ver 4.5** (verde es riesgoso) |
| `overdue_medium` | 15–30 | "Atraso medio" | amarillo |
| `overdue_strong` | 31+ (>30) | "Atraso fuerte" | rojo |

### 4.4 Pregunta del día 7 / día 8 (reportada, no asumida)

Con la convención de días enteros usada hoy (`Math.floor((hoy − fecha)/86.4M)`, ej. `copilot-client-debt-status.ts:109-114`):

- "0 a 7 días" **inclusive** = `días <= 7` → **no atrasado**.
- El atraso empieza en `días >= 8` (= "8 a 14"). El día 7 **sí** se considera todavía no atrasado.

**Recomendación:** implementar como `días <= 7 ⇒ not_overdue`, `8 <= días <= 14 ⇒ light`, `15 <= días <= 30 ⇒ medium`, `días > 30 ⇒ strong`. **Confirmar con negocio** que el borde superior de "medio" es 30 inclusive y "fuerte" es estrictamente >30 (igual criterio que hoy en Modelo A para el corte de 30).

### 4.5 Colores (auditoría de confusión verde)

**Hallazgo:** hoy el verde (`success`) ya significa **"Al día / sin problema"** (`clientes-portfolio-table.tsx:96`, `saludTone`). Usar verde para "atraso leve" **generaría confusión** con OK.

**Recomendación (no implementar):**
- `not_overdue` → **neutral/gris** (o azul informativo). Reservar verde **solo** para "sin deuda / al día".
- `overdue_light` → **ámbar claro** (no verde): es atraso, debe leerse como leve alerta, no como OK.
- `overdue_medium` → **amarillo/naranja**.
- `overdue_strong` → **rojo**.

Alternativa si negocio insiste en verde para leve: usar verde **solo** en el bucket de barras de aging (contexto de distribución), nunca en badges de estado de cliente. Decidir en una sola tabla de tokens (`copilot-visual-system`).

### 4.6 Helper central recomendado (firma sugerida)

```ts
// lib/collection-aging/collection-aging-model.ts
export type CollectionAgingStatus =
  | "not_overdue" | "overdue_light" | "overdue_medium" | "overdue_strong";

export const COLLECTION_AGING_THRESHOLDS = { light: 8, medium: 15, strong: 31 } as const;
export const COLLECTION_AGING_LABEL: Record<CollectionAgingStatus, string> = { /* … */ };
export const COLLECTION_AGING_TONE: Record<CollectionAgingStatus, "neutral"|"warning"|"danger"> = { /* … */ };

export function classifyInvoiceAging(issueDate: string, today: string): CollectionAgingStatus;
export function daysSinceIssue(issueDate: string, today: string): number | null;
```

### 4.7 Clasificación de facturas

Por factura impaga (`balance_amount > 0`): `daysSinceIssue(issue_date, today)` → bucket. Misma convención de fecha que `copilot-client-debt-status.ts` (UTC mediodía, Montevideo como default). Excluir NCs (CFE 112/181/182) y voided, igual que el portfolio actual.

### 4.8 Clasificación de clientes con múltiples facturas

**Regla "peor estado gana"** (consistente con Modelo A que usa `maxDaysSinceIssue`): el estado del cliente = bucket de su factura impaga **más antigua**. Confirmar (pregunta 7.3).

### 4.9 Subtotales pendiente / atrasado (Cobranza, Fase 3)

- **Pendiente** = Σ `balance_amount` de facturas en `not_overdue` (0–7 días). → "a cobrar, dentro de plazo".
- **Atrasado** = Σ `balance_amount` de facturas en `light + medium + strong` (>7 días).
- Total deuda = pendiente + atrasado (debe reconciliar con `debt_uyu/usd`).
- **Separar por moneda** (UYU/USD nativo); en Vista USD, consolidar con `convertToUsdEquivalent` (TC), igual que el resto de KPIs (`useDisplayCurrency`).

### 4.10 UYU/USD y Vista USD

Mantener el patrón actual: cómputo **nativo por moneda**, presentación consolidada vía `display-currency-provider` + `currency-display-mode`. El helper de aging es currency-agnostic (clasifica por días); los subtotales se agregan por moneda antes de consolidar.

### 4.11 Mostrar clientes "no atrasados"

Nuevo valor de filtro en ambas rutas:
- Cobranza (`clientes-a-gestionar-list.tsx`): agregar `ClientFilter = "notOverdue"` → clientes con deuda pero todas las facturas ≤7 días (o `!isOverdue` bajo el nuevo modelo).
- Clientes (`clientes-portfolio-table.tsx`): agregar opción `not_overdue` a `FILTER_OPTIONS`.
Requiere exponer el estado nuevo en `CobranzaClientRow` / `ClientPortfolioRow` (campo derivado `aging_status`), idealmente calculado en el portfolio para no duplicar lógica.

### 4.12 No romper reportes financieros

- **Deuda actual / facturado / cobrado** NO cambian (son sumas de balances, independientes del aging).
- Lo que cambia es **qué cuenta como "atrasado"** y los **labels/colores de estado**. Los PDFs deben migrarse en una fase dedicada (Fase 5/6) con sus *parity tests* actualizados en el mismo PR.
- Mantener `deuda_activa` (= deuda total) intacto; el riesgo es solo en `deuda_vencida` y conteos de estado.

---

## 5. Riesgos

| Riesgo | Severidad | Detalle / Mitigación |
|--------|-----------|----------------------|
| Cambiar ancla de "atrasado" de due_date→issue_date en Cobranza/portfolio | 🔴 | Cambia el significado operativo de "Vencido" para el equipo de cobranza. Mitigar: decisión de negocio explícita (7.1) + comunicar. |
| 4 modelos divergentes a unificar | 🔴 | Si se reemplaza texto sin unificar el helper, queda peor que hoy. Mitigar: helper central primero (Fase 2), migrar consumidores uno a uno. |
| ~15 archivos de tests con umbrales 30/60/90 | 🔴 | Romperán al mover a 7/14/30. Mitigar: actualizar tests **en el mismo PR** que el helper; ver sección 8. |
| 4 reportes PDF con *parity tests* | 🔴 | `account-statement-preview-pdf-parity.test.ts`, `render-net-sales-report-pdf.test.ts`, manual PDF. Mitigar: fase PDF separada. |
| Copy en ~10+ archivos por string (inline + contrato) | 🟡 | Renombre de 3 strings toca muchos sitios. Mitigar: centralizar en contratos donde exista; los inline requieren edición manual. |
| Color verde para "leve" confunde con "OK" | 🟡 | Ver 4.5. No implementar verde en badges de estado. |
| `due_date` sintético (DIV-CONT-001) | 🟡 | Confirma que issue_date es la única ancla confiable; ningún cambio de datos requerido si se ancla en issue_date. |
| Motor de decisiones (riesgo/prioridad) acoplado a buckets 31-60/61-90/90+ | 🟡 | Si se renombran buckets, romper `client-risk-scorer`. Mantener buckets internos del decision-engine separados del modelo de UI, o migrar con cuidado. |
| Ancla HTML `#clientes-criticos` | 🟢 | Links internos dependen del id. No renombrar el ancla aunque cambie el copy visible. |

---

## 6. Preguntas críticas (respuestas de la auditoría + lo que falta decidir)

| # | Pregunta | Respuesta de auditoría |
|---|----------|------------------------|
| 6.1 | ¿Se clasifica por fecha de factura o de vencimiento? | **Recomendado: fecha de factura (issue_date).** Es el único dato real de Zeta. Hoy conviven ambas (Modelo A issue, Modelo B/C due). **DECISIÓN DE NEGOCIO PENDIENTE.** |
| 6.2 | ¿Zeta provee due_date o solo issue_date? | **Solo issue_date** confiable. `due_date` factura = sintético (`issue+30`). Vencimiento real solo por cuota (`cuota_vencimiento`) tras sync cuotas. |
| 6.3 | Cliente con una factura no atrasada y otra +30: ¿toma el peor estado? | **Recomendado: sí (peor estado gana)**, consistente con `maxDaysSinceIssue`. **CONFIRMAR.** |
| 6.4 | ¿"Pendiente" = toda deuda abierta o solo no atrasada? | **Propuesta: "Pendiente" = no atrasada (0–7d); "Atrasado" = >7d; "Deuda actual a cobrar" = total.** Hoy "pendiente" se usa como total. **CONFIRMAR** para no romper labels existentes. |
| 6.5 | ¿"Atrasado" desde el día 8? | **Sí** con la convención propuesta (día 7 inclusive = no atrasado). Confirmar (4.4). |
| 6.6 | ¿Deuda 0–7 días aparece como "a cobrar" pero no atrasada? | **Sí**, esa es la propuesta (`not_overdue`, neutral). Confirmar. |
| 6.7 | ¿Subtotales pendiente/atrasado por moneda? | **Sí**, cómputo nativo por moneda (UYU/USD). |
| 6.8 | En Vista USD, ¿se consolidan? | **Sí**, vía `display-currency-provider` + TC, igual que KPIs actuales. |
| 6.9 | ¿PDFs/reportes ahora o en fase separada? | **Fase separada (5/6).** Tienen *parity tests* y son alto riesgo. |
| 6.10 | ¿Qué tests rompen? | Ver sección 8 (≈4 de copy + ≈15 de umbrales). |

---

## 7. Plan de implementación por fases

> Regla permanente: **un solo helper central** (`collection-aging-model.ts`) es la única fuente de verdad de umbrales, labels y tones. Toda UI/PDF lo consume; nada hardcodea días/colores.

**Fase 0 — Decisiones de negocio (bloqueante).** Responder 6.1, 6.3, 6.4, 4.4, 4.5. Sin esto, no iniciar Fase 2.

**Fase 1 — Copy seguro (riesgo 🟢, independiente).**
- Renombrar las 3 strings en contratos centrales (`copilot-hoy-ui-contract.ts`, `copilot-financial-ux-copy.ts`, `copilot-financial-metrics-contract.ts`, `tesoreria-ui.ts`) + sitios inline (sección 3.1).
- Actualizar tests de copy (sección 8.A) en el mismo PR.
- No tocar lógica ni colores.

**Fase 2 — Helper central + tests (riesgo 🟡, sin cablear UI).**
- Crear `collection-aging-model.ts` con thresholds 8/15/31, labels, tones, `classifyInvoiceAging`, `daysSinceIssue`.
- Tests unitarios exhaustivos de bordes (7/8, 14/15, 30/31).
- Exponer `aging_status` derivado en `getClientPortfolio` (sin cambiar `overdue_*` todavía).
- No cambiar UI aún.

**Fase 3 — Cobranza (riesgo 🔴).**
- Subtotales pendiente (0–7) / atrasado (>7) por moneda + Vista USD.
- Filtro/botón "No atrasados" (`clientes-a-gestionar-list.tsx`).
- Reemplazar badges/copy ("Vencido" → modelo nuevo) usando el helper.
- Actualizar `computeCobranzaKpis` (hoy sin test → crear test).

**Fase 4 — Clientes (riesgo 🟡).**
- Filtro/botón "No atrasados" (`clientes-portfolio-table.tsx`).
- `saludTone`/badges desde el helper; colores según 4.5.

**Fase 5 — Limpieza global (riesgo 🔴).**
- Migrar Hoy, Dashboard, Finanzas, Cartera, Alertas, Atención-prioritaria, Acciones al helper.
- Eliminar "Deuda vencida" legacy (`financial-panorama-view.tsx:61`), unificar "crítico/vencido/riesgo" donde sea estado de antigüedad (mantener "riesgo" cuando es score de monto, no de días — son conceptos distintos).
- Reportes PDF + *parity tests*.

**Fase 6 — Documentación (riesgo 🟡).**
- Actualizar manual (`sections.generated.ts`, `glossary-extra.ts`), `copilot-financial-metrics-contract.md`, `PROJECT_CONTEXT.md`.
- Dejar regla permanente del modelo (esta spec) y nota DIV sobre ancla issue_date.

---

## 8. Tests requeridos / que romperán

### 8.A Copy (rompen con renombre)
- `lib/copilot-hoy-money-rules.test.ts` (21, 79–94) — las 3 strings.
- `lib/copilot-today-business-pulse.test.ts` (967–971) — `CURRENCY_METRIC_LABELS.pending`.
- `lib/copilot-hoy-today-priority.test.ts` (43, 55) — "deuda actual".
- `lib/reports/manual/render-copilot-manual-pdf.test.ts` (36) — "Deuda actual".

### 8.B Umbrales/labels de aging (rompen con 7/14/30)
- `lib/hoy-debt-breakdown.test.ts`, `lib/copilot-client-debt-status.test.ts`, `lib/copilot-installment-aging.test.ts` (+ `-delta`, `-observation`), `lib/copilot-financial-reconciliation.test.ts` (+ `-aging-real`), `lib/copilot-dashboard-summary.test.ts`, `lib/copilot-today-business-pulse.test.ts`, `lib/hoy-debtor-sort.test.ts`, `lib/copilot-finanzas-ceo-derivations.test.ts`, `lib/decision-engine/client-risk-scorer.test.ts`, `client-operational-display.test.ts`, `client-operational-summary-builder.test.ts`, `lib/reports/debtors-report/build-debtors-report-model.test.ts`.

### 8.C Riesgo/prioridad (revisar, pueden moverse)
- `lib/copilot-clients-portfolio.test.ts`, `lib/copilot-financial-thresholds.test.ts` (umbrales de **monto** — ortogonales a días, probablemente no rompen), `lib/copilot-operational-semaphore.test.ts`, `follow-up-engine.test.ts`.

### 8.D Tests nuevos a crear
- Unitarios del helper `collection-aging-model` (bordes 7/8/14/15/30/31).
- `computeCobranzaKpis` (hoy **sin cobertura**) + subtotales pendiente/atrasado.
- Filtro "no atrasados" en cobranza y clientes.
- Parity de PDFs tras migración (Fase 5).

---

## 9. Recomendación GO / NO-GO

**GO condicionado**, con esta secuencia obligatoria:

1. ✅ **GO inmediato — Fase 1 (copy).** Riesgo bajo, valor inmediato, reversible. Único bloqueo: confirmar el wording exacto ("de la agencia" vs "de Santander" en "Pagos próximos").
2. ⏸️ **NO-GO a Fases 2–5 hasta cerrar Fase 0** (decisiones de negocio 6.1, 6.3, 6.4, 4.4, 4.5). El cambio de ancla due_date→issue_date en Cobranza es el punto de no retorno operativo.
3. ✅ **GO a Fase 2 (helper)** una vez decidido, porque no afecta UI y deja base sólida.
4. ⚠️ Fases 3–5 con **flag/PR por ruta** y tests actualizados en el mismo cambio. No reemplazo masivo de texto.

**No-go absoluto:** intentar "buscar y reemplazar" crítico/vencido/riesgo en todo el repo sin el helper central. Hay 4 modelos y "riesgo" tiene dos sentidos (días vs monto): un reemplazo ciego rompería el motor financiero y de decisiones.

---

### Anexo — Comandos de verificación usados (read-only)
- Búsqueda de copy: `Caja disponible|Deuda actual|Pagos próximos`.
- Búsqueda de aging: `aging|overdue|bucket|daysOverdue|cuota_vencimiento|due_date`.
- Glob de rutas: `app/copilot/**`, helpers `lib/**`, reportes `lib/reports/**`, tests `**/*.test.ts`.

*Auditoría sin cambios de código. Ningún archivo de la aplicación fue modificado; este documento es el único entregable.*
