# COLLECTION-AGING-MODEL-IMPLEMENTATION-001-REPORT

**Tipo:** Implementación incremental por fases del modelo único de cobranza por antigüedad.
**Alcance ejecutado:** Fase 1 (copy seguro) · Fase 2 (helper central) · Fase 3 (Cobranza) · Fase 4 (Clientes).
**Fuera de alcance (no tocado):** Fase 5 (limpieza global de "crítico/riesgo/prioridad"), PDFs/reportes, DB/Supabase, Zeta, migraciones.
**Fecha:** 2026-06-26
**Commit:** sin commit (pendiente de aprobación).

---

## 1. Modelo aplicado

Modelo único en `lib/collection-aging/collection-aging-model.ts`, anclado en `issue_date` (día de emisión = día 0):

| Bucket | Días desde emisión | Label | Tono / color |
|--------|--------------------|-------|--------------|
| `not_overdue` | 0–7 | No atrasado | neutral (gris/azul) |
| `overdue_8_14` | 8–14 | Atrasado 8–14 días | success (verde suave) |
| `overdue_15_30` | 15–30 | Atrasado 15–30 días | warning (ámbar) |
| `overdue_30_plus` | 31+ | Atrasado +30 días | danger (rojo) |

- El atraso empieza el **día 8** (≤ 7 días sigue dentro de plazo).
- **Cliente toma el peor estado** entre sus facturas abiertas (= la factura abierta más antigua).
- **Pendiente** = toda deuda abierta. **Atrasado** = saldo abierto con > 7 días desde emisión.
- Monedas **nunca se mezclan** en moneda original; en Vista USD se consolida a equivalente USD con TC visible.

---

## 2. Fase 1 — Copy seguro (completada)

Renombres aplicados en toda la UI visible de `/copilot` + Manual:

- "Caja disponible" → **"Caja disponible Santander"**
- "Deuda actual" → **"Deuda actual a cobrar"**
- "Pagos próximos" → **"Pagos próximos de la agencia"**

Se actualizó el contrato canónico `METRIC_LABEL` (con alias legacy preservados) — efecto colateral aceptado en 2–3 labels del PDF resumen del dashboard, por decisión de negocio.

---

## 3. Fase 2 — Helper central (completada)

- `lib/collection-aging/collection-aging-model.ts`: tipos + `getDaysSinceIssue`, `classifyInvoiceByIssueDate`, `classifyClientByWorstInvoice`, `isInvoiceOverdueByCollectionModel`. Función pura, sin I/O. Usa `lib/date/summer87-today.ts` (mediodía UTC para evitar DST).
- Tests: `lib/collection-aging/collection-aging-model.test.ts` (29 tests, verdes).

---

## 4. Fase 3 — Cobranza (completada)

### 4.1 Capa de datos (`lib/copilot-clients-portfolio.ts`)
- Nuevos campos en `ClientPortfolioRow`: `collection_overdue_uyu`, `collection_overdue_usd` (saldo abierto con > 7 días desde emisión, por moneda; subconjunto de `debt_*`).
- `computeInvoiceCurrencyBreakdown` extendido: ahora calcula `collectionOverdueUYU/USD` a **nivel factura** (preciso), reutilizando la deduplicación operativa existente y excluyendo notas de crédito. **No** se modificó ninguna fórmula financiera previa (`overdue_*` por `due_date` se mantiene intacto).
- **Punto de datos:** el cálculo se hace en el loader `getClientPortfolio`, único lugar con acceso a las facturas (`issue_date` + `balance_amount`). No hubo bloqueo de datos.

### 4.2 Lógica (`lib/copilot-cobranza-summary.ts`)
- `CobranzaKpis`: + `collectionOverdueUyu`, `collectionOverdueUsd`, `clientsCollectionOverdueCount`.
- `CobranzaClientRow`: + `collectionBucket`, `collectionOverdueUyu/Usd`, `oldestOpenInvoiceIssueDate`, `isCollectionOverdue`.
- `portfolioRowCollectionBucket(row)`: clasifica por peor factura abierta (vía `oldest_open_invoice_issue_date`).
- `applyCobranzaAgingFilter` + `sumCobranzaSubtotals`: filtros y subtotales por moneda (puros, testeables).

### 4.3 UI
- **KPIs** (`cobranza-kpi-grid.tsx`): card "Vencido" (due_date) → **"Atrasado"** (modelo +7 días); "Clientes atrasados" usa el conteo del modelo nuevo; card de deuda renombrada a **"Pendiente"**.
- **Lista** (`clientes-a-gestionar-list.tsx`):
  - Filtros: **Todos · No atrasados · Atrasado 8–14 · Atrasado 15–30 · Atrasado +30 · Sin gestión**.
  - **Subtotales** del conjunto filtrado: Pendiente y Atrasado (+7 días), separados UYU/USD en moneda original, consolidados con TC en Vista USD.
  - **Badge por fila** según peor factura abierta (tono por bucket).
  - Se mantienen búsqueda, filtro por responsable, modo original y Vista USD.

---

## 5. Fase 4 — Clientes (completada)

`components/copilot/clientes/clientes-portfolio-table.tsx`:
- Filtros: **Todos · No atrasados · Atrasado 8–14 · Atrasado 15–30 · Atrasado +30 · Sin contacto** (+ filtro de moneda Todas/UYU/USD intacto).
- Columna **Salud** y card móvil: badge por **peor factura abierta** (clientes sin deuda → "Al día").
- `matchesClientFilter` clasifica por bucket del modelo único.
- Indicador "atrasado" en celda de deuda usa `collection_overdue_*` (antes `due_date`).
- Línea de stats de la página usa el modelo nuevo para el conteo de "atrasados".
- **Total pendiente** sigue siendo la deuda abierta total. Drawer/ficha 360 **no se tocó**.

---

## 6. Archivos modificados

**Capa de datos / lógica**
- `lib/copilot-clients-portfolio.ts`
- `lib/copilot-cobranza-summary.ts`

**UI**
- `components/copilot/cobranza/cobranza-kpi-grid.tsx`
- `components/copilot/cobranza/clientes-a-gestionar-list.tsx`
- `components/copilot/clientes/clientes-portfolio-table.tsx`
- `app/copilot/clientes/clientes-page-client.tsx`

**Tests**
- `lib/copilot-clients-portfolio.test.ts` (+ subtotales por moneda del modelo)
- `lib/copilot-cobranza-summary.test.ts` (+ clasificación, filtros, subtotales, KPIs)
- `lib/cobranza/cobranza-ownership.test.ts` (fixture actualizado a los nuevos campos)

---

## 7. Checks

- `npx tsc --noEmit`: OK.
- `npx vitest run` (helpers afectados): 102/102 verdes (collection-aging, cobranza-summary, clients-portfolio). Suite completa: ejecutada (ver resumen al cierre).
- `npm run build`: ver resultado al cierre.
- Verificación manual pendiente del revisor en `/copilot/cobranza` y `/copilot/clientes` (moneda original + Vista USD).

---

## 8. Riesgos / notas

- El subtotal "Atrasado" de Cobranza es **preciso a nivel factura** (>7 días). El badge/filtro del cliente usa el **peor estado** (factura más antigua): un cliente puede estar en bucket "+30" aunque parte de su deuda sea fresca; el subtotal "Atrasado" solo suma el saldo realmente >7 días. Comportamientos consistentes con las definiciones acordadas.
- En Cobranza, el universo "Todos" ahora son clientes **con deuda** (cobranza no gestiona clientes sin deuda); antes el default era "Con deuda". Refinamiento intencional, sin pérdida de datos.
- No se reemplazaron textos globales de "crítico/riesgo/prioridad" fuera de Cobranza/Clientes (corresponde a Fase 5).

---

## 9. GO / NO GO

**GO** para revisión, con los checks de build/suite completa adjuntos y la verificación manual de las dos pantallas en ambos modos de moneda. Sin commit hasta aprobación.

---

## 10. Revisión previa al commit — COLLECTION-AGING-MODEL-REVIEW-001

**Fecha:** 2026-06-26 · **Alcance:** revisión manual + estática de Fase 3/Fase 4, sin cambios nuevos (salvo fixes menores) · **Fase 5, PDFs, Zeta y DB: no tocados.**

### 10.1 Validación técnica (ejecutada en esta revisión)

| Check | Resultado |
|-------|-----------|
| `npx tsc --noEmit` | ✅ OK (exit 0) |
| `npx vitest run` | ✅ **296 archivos / 3771 tests** verdes (exit 0) |
| `npm run build` | ✅ OK (exit 0) — compiló en 36.3s + TypeScript + generación estática |

### 10.2 `/copilot/cobranza` — checklist

> Revisión estática de `components/copilot/cobranza/clientes-a-gestionar-list.tsx`, `cobranza-kpi-grid.tsx` y `lib/copilot-cobranza-summary.ts`. No se pudo generar captura Playwright en esta sesión (MCP de Playwright no disponible; sin dev server activo). La verificación se hizo a nivel de código y datos.

| Ítem | Estado | Nota |
|------|--------|------|
| Subtotal Pendiente visible y correcto | ✅ | Card "Pendiente" = suma `debtUyu/Usd` del set filtrado (`sumCobranzaSubtotals`). |
| Subtotal Atrasado visible y correcto | ✅ | Card "Atrasado (+7 días)" = suma `collectionOverdue*`; muestra "—" si 0. |
| Moneda original: UYU/USD separados | ✅ | `formatClientDebt` en modo `native` no consolida; une con " · ". |
| Vista USD: consolidado + TC | ✅ | `convertToUsdEquivalent` + leyenda `TC {fxRate}`. |
| Filtros: Todos · No atrasados · Atrasado 8–14 · 15–30 · +30 · Sin gestión | ✅ | `FILTER_LABELS` coincide exactamente. |
| Cada filtro devuelve filas esperables | ✅ | `applyCobranzaAgingFilter` clasifica por bucket de peor factura. |
| Búsqueda funciona | ✅ | Filtra por `name` (locale es). |
| Responsable funciona | ✅ | `applyResponsableFilter` (Todos/Mis clientes/Sin asignar). |
| Paginación | ✅ (N/A) | Lista sin paginación por diseño ("ordenados por vencimiento · sin paginación"); no se rompió nada. |
| Badges = peor factura abierta | ✅ | `CollectionAgingBadge` usa `collectionBucket` (`oldest_open_invoice_issue_date`). |
| Sin textos "Crítico/Vencido/Riesgo/Prioridad" en Cobranza | ✅ | Único match: "promesas vencidas" en KPI de cumplimiento de promesas (concepto distinto, válido). |
| Sin cards vacías / saltos de layout | ✅ | Estados vacíos y de carga manejados; subtotales solo si hay filas. |
| Mobile/responsive | ✅ | `ClientMobileCard` (sm:hidden) + tabla desktop con `overflow-x-auto`. |

### 10.3 `/copilot/clientes` — checklist

> Revisión estática de `components/copilot/clientes/clientes-portfolio-table.tsx` y `app/copilot/clientes/clientes-page-client.tsx`.

| Ítem | Estado | Nota |
|------|--------|------|
| Filtros: Todos · No atrasados · Atrasado 8–14 · 15–30 · +30 · Sin contacto | ✅ | `FILTER_OPTIONS` coincide exactamente. |
| Filtro moneda Todas/UYU/USD intacto | ✅ | `CURRENCY_FILTER_OPTIONS` + `matchesCurrencyFilter` sin cambios de contrato. |
| Columna Salud: "Al día" sin deuda / bucket con deuda | ✅ | `ClientAgingBadge` (sin deuda → "Al día"; con deuda → `shortLabel` del bucket). |
| Total pendiente no cambia indebidamente | ✅ | `DebtCell` usa `debt_uyu/usd`; indicador "atrasado" usa `collection_overdue_*`. |
| Drawer/ficha 360 abre bien | ✅ | `CopilotClientEvidenceDrawer` intacto; no se tocó. |
| Sin textos "Críticos" donde la UI usa el nuevo modelo | ✅ | La tabla/cartera usa solo el modelo nuevo. (Ver 10.4.) |
| Vista USD no mezcla monedas | ✅ | `convertToUsdEquivalent` + `TC {fxRate}`; nativo separa UYU/USD. |
| Mobile/responsive | ✅ | `PortfolioMobileCard` + filtros en fila scrollable. |

### 10.4 Hallazgos (fuera de alcance — Fase 5, no se corrigió)

1. **`client-agent-block.tsx`** (ficha 360 / agent insights) define un estado `critical` con label **"Crítico"**. Es un sistema de salud del cliente **independiente** del modelo de antigüedad y pertenece a la ficha 360 (explícitamente *no tocada*). No aparece en la cartera ni en la lista de cobranza. → **Fase 5.**
2. **Subtítulo de `/copilot/clientes`**: "Lista accionable de cartera: pendiente por moneda, **riesgo** y contacto." La palabra "riesgo" es copy genérico del header, no del modelo de antigüedad. → **Fase 5** (limpieza global de copy). No se modificó para respetar el alcance.

### 10.5 Bugs encontrados / fixes menores aplicados

- **Bugs:** ninguno.
- **Fixes menores:** ninguno necesario.

### 10.6 Limitación de la revisión

- No se generaron **capturas Playwright** en esta sesión: el MCP de Playwright no está disponible y no hay dev server activo. La validación visual se sustituyó por revisión estática de componentes + lógica + datos, respaldada por la suite verde (3771 tests) y el build OK. Recomendado: pasada visual rápida del revisor humano en ambas rutas y modos de moneda antes de mergear.

### 10.7 Veredicto

Implementación de Fase 3/Fase 4 **consistente con el modelo único de antigüedad**, sin textos legacy dentro del alcance, con `tsc`/`vitest`/`build` en verde y sin bugs detectados.

## **GO PARA COMMIT**

---

## 11. FASE 5 — UI Consistency (COLLECTION-AGING-MODEL-PHASE-5-UI-CONSISTENCY-001)

**Fecha:** 2026-06-26 · **Alcance:** solo UI/copy/labels/badges/colores/tooltips de Cobranza/Clientes. **No** lógica financiera, **no** DB, **no** Zeta, **no** el helper `collection-aging-model.ts`, **no** cálculos, **no** commit.

### 11.1 Criterio de triage aplicado

Se buscó en todo el repo (`*.ts`, `*.tsx`, excluyendo tests/snapshots/SQL/migraciones/comentarios/naming interno): `crítico/critico/críticos`, `riesgo`, `prioridad`, `deuda vencida`, `vencido/vencida`, `overdue`, `critical`, `risk`, `priority`.

Regla de decisión (según la consigna): **reemplazar solo cuando el término es un alias visible del bucket de antigüedad de cobranza.** Se **excluyeron** explícitamente:

- **Variables/tipos/funciones/APIs internos** (`overdueUyu`, `not_overdue`, `collection_overdue_*`, `client_overdue`, `status: "critical"`…) → renombrarlos está fuera de alcance.
- **Modelos distintos** que comparten vocabulario pero **no** son el modelo de antigüedad:
  - **Risk scorer / severidad de cartera** (`riskSev`, `copilotSeverityLabel`, `riskTone`, badges "Riesgo cartera" / "Riesgo {label}").
  - **Priority ranker / decision-engine** (`client-priority-ranker`, daily-operations-queue, etc.).
  - **Overdue financiero por `due_date`** (campos `overdue_*`, distinto del `collection_overdue_*` por `issue_date`).
  - **Aging de Cartera** (brackets 1–30 / 31–60 / 61–90 / +90, módulo de análisis por período).
  - **Treasury / Finanzas** ("Riesgo financiero", "pago vencido").
- **Concepto financiero donde "vencimiento" sigue siendo correcto** (fecha de vencimiento, vencimiento de cuotas, cron de vencimientos, `due_date`).

### 11.2 Archivos modificados

| Archivo | Cambio | Tipo |
|---------|--------|------|
| `components/copilot/clientes/client-agent-block.tsx` | Label de estado del cliente `"Crítico"` → **`"Gestión urgente"`** (status `critical` del agente de ficha 360). | copy / label |
| `app/copilot/clientes/clientes-page-client.tsx` | Subtítulo del header: "pendiente por moneda, **riesgo** y contacto" → "pendiente por moneda, **antigüedad** y contacto". | copy / subtítulo |

### 11.3 Textos reemplazados

- `"Crítico"` → `"Gestión urgente"` (estado del agente de cliente).
- `"riesgo"` → `"antigüedad"` (subtítulo de `/copilot/clientes`, alineado con la columna **Salud** que ya clasifica por bucket).

> Nota sobre `client-agent-block.tsx`: el estado `critical` es un **compuesto de salud** (share de `overdue_*`, promesa vencida, falta de contacto), **no** el bucket "+30 días". Por eso **no** se mapeó a "Atrasado +30 días" (sería incorrecto); se usó un label de acción neutro respecto del modelo ("Gestión urgente"), eliminando el término legacy sin falsear el bucket. **No se tocó la lógica** del builder `build-client-agent-brief.ts`.

### 11.4 Badges actualizados

- Sin cambios estructurales: los badges de antigüedad de Cobranza y Clientes **ya** derivan del helper central (`COLLECTION_AGING_BUCKETS` / `portfolioRowCollectionBucket`) desde Fase 3/4.
- En Clientes/Cobranza **no conviven** badges "crítico/prioridad/riesgo" con los del modelo (No atrasado / Atrasado 8–14 / 15–30 / +30): el único badge de antigüedad es el del helper.

### 11.5 Colores actualizados

- Sin cambios: la paleta ya está alineada al contrato de tonos del helper:
  - `not_overdue` → **neutral**, `overdue_8_14` → **success**, `overdue_15_30` → **warning**, `overdue_30_plus` → **danger**.
- `client-agent-block.tsx` (status compuesto) ya usaba `success/warning/danger` para `stable/attention/critical`; el cambio fue solo de label, no de color.

### 11.6 Componentes afectados

- `components/copilot/clientes/client-agent-block.tsx`
- `app/copilot/clientes/clientes-page-client.tsx`

### 11.7 Componentes / textos PENDIENTES (no migrados, requieren decisión de producto o cambio de lógica fuera de alcance)

1. **`lib/copilot-agents/build-client-agent-brief.ts`** — copy "Saldo vencido / vencido / Promesa de pago vencida". Está atado al **overdue por `due_date`** (`overdue_*`), distinto del modelo por `issue_date`. Renombrar "vencido"→"atrasado" sin migrar la métrica crearía **dos "atrasado" con números distintos**. → Requiere migrar la métrica al helper (cambio de lógica, fuera de alcance).
2. **Badges de riesgo de cartera** en `copilot-client-360-view.tsx` ("Riesgo {label}") y `copilot-client-evidence-drawer.tsx` ("Riesgo cartera") — provienen del **risk scorer**, no del bucket. No son alias del modelo. → Decisión de producto si se unifican.
3. **Módulo Cartera** (`cartera-compact-kpi-grid.tsx`, `client-debt-explorer.tsx`, `aging-analytics.tsx`) — filtros "Críticos" y aging 1–30/31–60/61–90/+90: **otro modelo de antigüedad** (por período/`due_date`). Fuera del alcance de cobranza.
4. **Semáforo operacional (Hoy)** y **Finanzas** — "Crítico" (semáforo Al día/Requiere atención/Crítico) y "Riesgo financiero": modelos operativo/financiero independientes.
5. **Manual** (`lib/copilot-manual/sections.generated.ts`, `glossary-extra.ts`) — las secciones de **Cobranza y Clientes ya usan el modelo nuevo** (No atrasado / Atrasado 8–14/15–30/+30). Restan referencias legacy en secciones de **Cartera** ("Críticos", "1–30/31–60…"), **Hoy** (semáforo "Crítico", "deuda crítica") y la entrada "Días de atraso" del glosario, todas pertenecientes a otros módulos. → Pendiente de una pasada de manual por módulo (con cuidado: el archivo tiene guard de encoding UTF-8 y ya contiene mojibake heredado).
6. **Reportes / PDFs** — no tocados por consigna. Siguen usando terminología "vencido/Crítico/Riesgo alto" (`build-debtors-report-model`, `executive-monthly-report`, `dashboard-summary`). Solo se reporta; corresponde a una fase posterior de reportes.

### 11.8 Checks

| Check | Resultado |
|-------|-----------|
| `npx tsc --noEmit` | ✅ OK (exit 0) |
| `npx vitest run` | ✅ **296 archivos / 3771 tests** verdes (exit 0) |
| `npm run build` | ✅ OK (exit 0) — compile 35.8s · TypeScript 59s · 141/141 páginas estáticas |

Sin cambios en tests (los reemplazos fueron copy puro; ningún test asertaba "Crítico" del agente ni el subtítulo).

### 11.9 GO / NO GO

**GO** para los dos fixes de copy de Fase 5 (Cobranza/Clientes), con `tsc`/`vitest`/`build` en verde. Los ítems de 11.7 quedan documentados como **pendientes** por pertenecer a otros modelos/módulos o requerir cambios de lógica fuera del alcance declarado. **Sin commit.**
