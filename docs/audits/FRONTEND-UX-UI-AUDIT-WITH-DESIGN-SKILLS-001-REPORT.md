# FRONTEND-UX-UI-AUDIT-WITH-DESIGN-SKILLS-001

**Fecha:** 2026-06-26  
**Auditado por:** Claude Code + Design Skills (Leonxlnx/taste-skill · pbakaus/impeccable)  
**Stack:** Next.js App Router · TypeScript · Tailwind · Supabase · Vercel  
**Tenant:** Summer87 Copilot — SaaS financiero/operativo B2B  
**Modo:** Solo lectura. Sin cambios de código, sin commits.

---

## 1. Resumen ejecutivo

El Copilot tiene una base de design system sólida: sistema de tokens CSS bien estructurado, paleta cálida coherente (beige/marfil + verde #1f6b4a), modo oscuro funcional y componentes primitivos de KPI/button/skeleton correctamente tipados. El nivel de calidad técnica es alto.

Sin embargo, la acumulación de iteraciones sin una capa de governance visual ha generado un **delta entre lo que el sistema promete y lo que cada página entrega**. Los problemas más críticos son:

1. **Fragmentación del design system**: los componentes primitivos (`CopilotKpiCard`, `CopilotButton`, skeletons) existen pero varias pantallas definen sus propias variantes locales, creando inconsistencia visual sin ganancia funcional.
2. **Densidad y jerarquía**: el padding conservador, la escala de tipo pequeña y la ausencia de un KPI "hero" claro en la mayoría de pantallas reducen la calidad percibida del producto.
3. **Navegación**: el sidebar arranca colapsado por defecto y el módulo Acciones está oculto del menú, generando fricción de descubrimiento.
4. **Estados de carga inconsistentes**: hay tres patrones de carga coexistiendo (skeleton, texto inline, spinner Loader2) con criterio opaco.
5. **Copy drift**: las descripciones entre nav y página no siempre coinciden, y algunas incluyen detalles operativos inapropiados para el UI.

**Veredicto:** GO para una primera fase de quick wins. El riesgo es bajo porque casi todos los cambios son de layout/copy/CSS, sin tocar lógica financiera.

---

## 2. Diagnóstico general

| Dimensión | Estado | Nota |
|---|---|---|
| Design System | Bueno en primitivos, fragmentado en consumo | Tokens sólidos; páginas usan variantes locales |
| Jerarquía visual | Media | Pocas pantallas tienen KPI "hero" dominante |
| Legibilidad | Aceptable | Escala de tipo conservadora; tabular-nums correcto |
| Espaciado | Conservador | COPILOT_PAGE_GAP=space-y-4 se siente ajustado |
| Grids | Bien | Breakpoints sm: consistentes |
| Cards | Inconsistente | 3 implementaciones paralelas de KPI card |
| Tablas | Aceptable | py-1.5 muy ajustado; sin zebra stripes en algunos lugares |
| Drawers | Bien | Z-index tokenizado; overlay correcto |
| Badges | Parcialmente inconsistente | Dos severity badges: tokens + hardcoded sky-* |
| Filtros | Bien | Patrón pill-tab reusado |
| Estados vacíos | Inconsistente | 3 variantes: Premium, Operational, inline |
| Estados de carga | Inconsistente | Skeletons + texto plano + Loader2 mezclados |
| Responsividad | Bien | Breakpoints sm/lg presentes; sidebar estrecho en mobile |
| Modo USD | Bien implementado | Alguna inconsistencia de formato (U$S vs formatUsdEquivalent) |
| Consistencia de copy | Media | Drift entre nav description y page description |
| Densidad visual | Alta en Acciones, baja en algunas otras | Acciones: formularios inline sobrecargan la pantalla |
| Acciones principales | Sin CTA dominante en varias pantallas | No hay botón primario prominente siempre visible |
| Ruido | Medio | Cartera description incluye guía de navegación |
| Accesibilidad básica | Bien en estructura; gaps en estados | aria-hidden en íconos, focus-visible, falta role="status" |
| Calidad percibida | 6/10 → potencial de subir a 8/10 con quick wins | La paleta y los tokens están ahí; falta aplicación consistente |

---

## 3. Hallazgos por ruta

### /copilot/hoy

**Archivo principal:** `app/copilot/hoy/page.tsx` → delega a `HoyPageView`

- La página gestiona 6 fetch paralelos (hub, 2x reconciliation, treasury payments, cash, manual). Cuando algún fetch falla, usa `sectionErrors` por sección. Correcto.
- El `CopilotPageHeader` usa `dense={true}` (pt-3 pb-2) — es el header más ajustado del sistema.
- El período (from/to con botones "Mes a la fecha" / "Últimos 30 días") queda en el body del `HoyPageView`, no en el header. El usuario probablemente no lo encuentra rápido.
- Estado de carga: delegado a `HoyPageView`; imposible auditar sin ver ese componente, pero el patrón recomendado es `CopilotSkeletonKpiRow`.

**Issues identificados:**
- P1 · UX: No hay CTA primario visible en el header de /hoy. El botón de refrescar (`onRefresh`) debe tener posición consistente.
- P2 · UX: El selector de período (dates + botones rápidos) tiene bajo descubrimiento si está enterrado en el contenido.
- P3 · Copy: La descripción `HOY_PAGE.description` (referenciada de `copilot-hoy-ui-contract`) no se puede validar sin leer ese archivo, pero la del sidebar es "Caja, cobros y prioridad" — verificar que coincida.

---

### /copilot/dashboard

**Archivo:** `app/copilot/dashboard/dashboard-page-client.tsx`

- Define su propio objeto `C` con `card`, `panel`, `ink`, `muted`, `accent`, `border`, `btn`, `btnGhost` como constantes locales. Esto **duplica** el design system.
- Los charts son divs CSS con `style={{ height }}` fixed. Las etiquetas de valor dentro de las barras usan `text-[10px]` — prácticamente ilegibles en pantallas de baja resolución o cuando la barra es angosta.
- `VerticalBarChart` y `GroupedBarChart` usan `key={i}` (índice) — no crítico visualmente pero fragil.
- `GroupedBarChart` detecta la moneda del label (if `label.startsWith("USD")`) — lógica acoplada al texto de la etiqueta.
- El `fmtAmount()` local usa el prefijo `"U$S "` para USD, diferente al `formatUsdEquivalent()` del sistema que produce `"USD"` con formato diferente.
- Sin `aria-label` en las barras del chart → inaccesible para lectores de pantalla.

**Issues identificados:**
- P1 · UI: Constantes CSS locales `C.*` deben migrar a tokens del design system.
- P1 · UI: Chart bars con etiquetas `text-[10px]` son prácticamente ilegibles.
- P2 · UX: Sin accesibilidad en gráficos (sin datos textuales alternativos).
- P2 · Copy: `fmtAmount` usa `"U$S "` como prefijo de USD. Inconsistente con el sistema.
- P3 · Técnica: `key={i}` en chart elements.

---

### /copilot/finanzas

**Archivo:** `app/copilot/finanzas/finanzas-client.tsx`

- Página extensa con muchos imports. La arquitectura es correcta (snapshot financiero, flags derivados, obligaciones fiscales).
- `CopilotPageHeader` presente con descripción. Bien.
- Mezcla componentes del sistema (`CopilotCard`, `CopilotPrimaryButton`) con primitivos locales inline.
- `FINANZAS_COBERTURA_QUERY` tiene un typo: `/copilot/finanzasímode=cobertura` (la `í` es un carácter extraño — posible error de encoding).

**Issues identificados:**
- P1 · Técnica/Copy: Typo en constante `FINANZAS_COBERTURA_QUERY` — `"í"` en lugar de `"?i"` o `"?mode"`. Podría romper el link de cobertura.
- P2 · UI: Densidad de la página no auditada en profundidad sin ver FinancialPanoramaView; prioridad para revisión en fase 2.

---

### /copilot/cartera

**Archivo:** `app/copilot/cartera/page.tsx`

- El page header incluye `eyebrow="Summer87 Copilot"` — de todas las rutas, solo Cartera y Tesorería usan eyebrow. El resto no. Inconsistencia.
- La `description` dice: _"Para contactar clientes, usá Clientes o Cobranza."_ — texto de instrucción de navegación embebido en la descripción de la pantalla. Esto es ruido en una descripción de módulo.
- El `CarteraInitialFallback` es un div dashed border con texto simple — aceptable pero se podría unificar con `CopilotSkeletonKpiRow`.
- El `div` wrapper tiene `px-4 pb-12 pt-5 sm:px-6 sm:pt-6 lg:px-8` — este padding extra es solo de Cartera, diferente al patrón del resto de páginas.

**Issues identificados:**
- P2 · Copy: La description incluye instrucción de navegación. Debe describir qué hace la pantalla, no dónde ir.
- P2 · UI: Uso de eyebrow inconsistente (solo Cartera y Tesorería lo usan).
- P2 · UI: Padding lateral custom (`lg:px-8`) diferente al resto de módulos.
- P3 · UI: Loading fallback podría usar `CopilotSkeletonKpiRow` para consistencia.

---

### /copilot/cobranza

**Archivo:** `components/copilot/cobranza/cobranza-kpi-grid.tsx`

- Define su propio `KpiCard` local en lugar de usar `CopilotKpiCard`. Tiene `text-xl font-bold` para el value — coincide con el `compact` de CopilotKpiCard pero no es el mismo componente.
- El grid de la fila 2 cambia de `sm:grid-cols-4` a `sm:grid-cols-3` dependiendo de `mode === "usd_equivalent"`. Esto causa un layout shift visual visible al cambiar el modo de moneda.
- El label "Cobros este mes (UYU)" / "Cobros este mes (USD)" son dos cards separadas en modo nativo, pero se colapsan en una en modo USD. El comportamiento es correcto pero el layout shift es brusco.
- `sub` con texto `"datos parciales — historial truncado"` como nota de truncado en data puede confundir al usuario.

**Issues identificados:**
- P2 · UI: `KpiCard` local debe reemplazarse con `CopilotKpiCard` (quick win).
- P2 · UX: El layout shift visible al cambiar modo de moneda reduce calidad percibida. Preferir grid fijo con cards que adaptan su contenido.
- P3 · Copy: "datos parciales — historial truncado" como sub text en KPI no es claro para el usuario.

---

### /copilot/clientes

**Archivo:** `app/copilot/clientes/clientes-page-client.tsx`

- Uso correcto de `copilotPageMainClass`, `CopilotSkeletonTable`, y `CopilotPageHeader`. Arquitectura sólida.
- La lógica de selección de cliente vía URL params (`?c=`) está implementada.
- Sin issues mayores identificados en esta parte del código. El audit en profundidad de la tabla y el drawer de detalle requeriría ver `ClientesPortfolioTable` y `CopilotClientEvidenceDrawer`.

**Issues pendientes de revisión en fase 2:**
- P2 · UX: Tabla vs split-view (lista + detalle): evaluar si el drawer es el patrón correcto o sería mejor un panel fijo lateral en desktop.

---

### /copilot/tesoreria

**Archivo:** `app/copilot/tesoreria/page.tsx`

- `CopilotPageHeader` con eyebrow = "Summer87 Copilot" (mismo problema que Cartera).
- `description` menciona explícitamente "Santander" (banco específico): _"Caja disponible Santander, pagos programados y registros manuales."_ El nombre del banco en la descripción del módulo es información que puede caducar (cambio de banco, multi-banco en el futuro, multi-tenant).
- Usa `!space-y-4` con `!` forzador en el className — señal de override que indica que el layout base del `copilotPageMainClass` no encaja perfectamente.
- El contenedor tiene `mx-auto w-full max-w-7xl` — Tesorería es la única pantalla con max-width explícito en el contenido, diferente al resto.

**Issues identificados:**
- P2 · Copy: Remover nombre de banco de la description del módulo.
- P2 · UI: max-width en el contenido crea una excepción visual no justificada.
- P2 · UI: `!` forzador en className indica que el layout base necesita ajuste.
- P3 · UI: Eyebrow inconsistente.

---

### /copilot/reportes

**Archivo:** `app/copilot/reportes/reportes-client.tsx`

No leído en profundidad. Identificado en el índice. Pendiente para fase 2.

**Issues pendientes:**
- P2 · UX: Auditar flujo de generación de PDF (dialogs de report). Los modals de preview (`monthly-report-dialog.tsx`, `collections-report-dialog.tsx`, etc.) son múltiples — verificar consistencia visual entre ellos.

---

### /copilot/acciones

**Archivo:** `app/copilot/acciones/page.tsx` (1300+ líneas)

Esta es la pantalla más densa del sistema. Tiene tres capas conceptuales:
1. **Bandeja de prioridades** (prioridades del día, filtros, search)
2. **Agenda** (CollectionAgendaSection)
3. **Pipeline/Historial** (acciones legacy con formularios inline de seguimiento)

**Problemas específicos:**

- El "Historial de gestiones" (pipeline) muestra **formularios inline de seguimiento** (3 campos de texto) para **cada acción** simultáneamente en la lista, sin colapsarlos por defecto. Con 10+ acciones, esto genera una página de formularios imposible de navegar.
- `quickBtnClass = "rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm"` — botones de resultado rápido que no usan el sistema `CopilotButton`.
- El tab activo usa `bg-[var(--copilot-accent)] text-white` — esto es correcto, pero el tab inactivo no tiene un estado hover visible claro.
- El componente `CopilotAccionesPage` retorna `<AccessDeniedCard />` directamente si no tiene permisos, sin página de acceso denegado unificada.
- La descripción de la página ("Gestiones pendientes, seguimientos y revisiones del negocio") no coincide con la del nav ("Prioridad del día y tareas concretas").
- La card de redirección a Cobranza al tope de la página ("Agenda y acciones integradas en Cobranza") sugiere que el módulo está en transición. La presencia de este aviso es UX anti-pattern — si el módulo tiene sustituto, debería redirigir o removerse, no advertir.
- El `SummaryPill` local usa `text-lg font-bold` — variante no tipada en el design system.

**Issues identificados:**
- P1 · UX: Los formularios de seguimiento en el pipeline deben estar colapsados por defecto (expand on click).
- P1 · Copy: La card de aviso "Agenda integrada en Cobranza" al tope genera confusión sobre la purpose del módulo.
- P2 · UI: `quickBtnClass` debe usar `CopilotButton` variant="ghost".
- P2 · Copy: Descripciones no coinciden entre nav y page.
- P2 · UX: 3 capas conceptuales en una sola pantalla sin separación visual clara de jerarquía.
- P3 · UI: `SummaryPill` local reemplazable con `CopilotKpiCard` size="mini".

---

### /copilot/alertas

**Archivo:** `app/copilot/alertas/page.tsx`

- Define su propio `MetricCard` local en lugar de `CopilotKpiCard`.
- El config de `SEVERITY_CFG` para `info` usa **colores Tailwind hardcodeados**: `"bg-sky-100 text-sky-700"`. Esto rompe el modo oscuro y la coherencia del design system.
- `getIconConfig()` para `sync_changes_detected` usa `"bg-sky-100"` y `"text-sky-500"` — mismo problema.
- Los filter pills usan `bg-[var(--copilot-ink)] text-white` cuando están activos — genera contraste fuerte con la paleta warm. Sería más coherente con el accent verde.
- Tiene 7 tabs de filtro: "Todas, No leídas, Críticas, Cobros, Clientes, Tesorería, Sistema". En mobile pueden desbordarse aunque hay scroll horizontal. En desktop son muchas opciones para el caso más común (ver todas o no leídas).
- El `NotificationCard` para alertas no leídas usa rgba hardcoded: `"border-[rgba(31,107,74,0.22)] bg-[rgba(31,107,74,0.028)]"` — debería usar `var(--copilot-accent-soft)`.
- El indicador de "no leída" es un dot de 7px — puede ser difícil de percibir en algunas configuraciones de pantalla.
- El timestamp usa `/70` opacity: `"text-[var(--copilot-ink-muted)]/70"` — eso es un 43% de opacidad efectivo. Potencial fallo de contraste WCAG.

**Issues identificados:**
- P1 · UI: Hardcoded `bg-sky-100 text-sky-700` en badges de severidad `info` y tipo `sync_changes_detected` — rompe dark mode.
- P1 · UI: `MetricCard` local debe usar `CopilotKpiCard`.
- P2 · UI: Filter tab activo usa ink color en lugar de accent color.
- P2 · UI: rgba hardcoded en unread notification card en lugar de tokens.
- P2 · UX: 7 tabs de filtro es mucho. Considerar reducir o agrupar.
- P2 · Accesibilidad: Timestamp al `opacity: 43%` puede fallar contraste WCAG AA.
- P3 · UX: El dot de "no leída" de 7px es demasiado pequeño como único indicador.

---

### /copilot/mesa-de-ayuda

**Archivo:** `app/copilot/mesa-de-ayuda/page.tsx`

- **No tiene `CopilotPageHeader`**. Delega directamente a `HelpdeskPageClient`. El único módulo sin header de página.
- Sin `eyebrow`, sin `title`, sin `description` en el entry point.

**Issues identificados:**
- P1 · UX: Agregar `CopilotPageHeader` con title="Mesa de ayuda" y description apropiada.

---

## 4. Problemas de UX

| ID | Severidad | Descripción | Ruta afectada |
|---|---|---|---|
| UX-01 | P1 | Sidebar arranca colapsado por defecto en todas las sesiones. Primera visita: el usuario ve solo iconos sin labels. | Global |
| UX-02 | P1 | "Acciones" (`sidebarHidden: true`) no aparece en el sidebar pero es un módulo principal. | Global nav |
| UX-03 | P1 | Formularios de seguimiento en el pipeline de Acciones están expandidos por defecto para todas las acciones. | /acciones |
| UX-04 | P1 | Mesa de ayuda no tiene CopilotPageHeader — el usuario no sabe dónde está. | /mesa-de-ayuda |
| UX-05 | P2 | El selector de período en /hoy tiene bajo descubrimiento si está en el body. | /hoy |
| UX-06 | P2 | La card de aviso "Agenda integrada en Cobranza" en /acciones crea confusión sobre la purpose del módulo. | /acciones |
| UX-07 | P2 | 7 tabs de filtro en /alertas es demasiado. Las opciones menos usadas ("Sistema") pueden ocultarse tras un "Más". | /alertas |
| UX-08 | P2 | Layout shift visible en /cobranza KPI grid al cambiar modo moneda (grid pasa de 4 a 3 columnas). | /cobranza |
| UX-09 | P2 | Sin CTA primario visible en la mayoría de pantallas. El usuario no sabe cuál es la acción principal de cada módulo. | Global |
| UX-10 | P3 | El botón de expand/collapse del sidebar en modo colapsado está dentro del nav en lugar del header — posición inesperada. | Global nav |
| UX-11 | P3 | "Marcar todas como leídas" en /alertas no tiene confirmación ni undo. | /alertas |

---

## 5. Problemas de UI

| ID | Severidad | Descripción | Archivo afectado |
|---|---|---|---|
| UI-01 | P1 | Hardcoded `bg-sky-100 text-sky-700 text-sky-500` en alertas rompe dark mode y coherencia. | `app/copilot/alertas/page.tsx:109,132` |
| UI-02 | P1 | `C.*` constants en dashboard duplican el design system sin beneficio. | `app/copilot/dashboard/dashboard-page-client.tsx:72-84` |
| UI-03 | P2 | `MetricCard` local en /alertas vs `CopilotKpiCard` en el sistema. | `app/copilot/alertas/page.tsx:202` |
| UI-04 | P2 | `KpiCard` local en /cobranza vs `CopilotKpiCard` en el sistema. | `components/copilot/cobranza/cobranza-kpi-grid.tsx:9` |
| UI-05 | P2 | `SummaryPill` local en /acciones vs `CopilotKpiCard` size="mini". | `app/copilot/acciones/page.tsx:1273` |
| UI-06 | P2 | Eyebrow en header solo presente en Cartera y Tesorería. Las demás rutas no lo usan. Inconsistente. | `app/copilot/cartera/page.tsx`, `app/copilot/tesoreria/page.tsx` |
| UI-07 | P2 | rgba hardcoded `rgba(31,107,74,0.22)` en unread card de alertas en lugar de `var(--copilot-accent-soft)`. | `app/copilot/alertas/page.tsx:274-276` |
| UI-08 | P2 | `quickBtnClass` en /acciones no usa el sistema de botones. | `app/copilot/acciones/page.tsx:89` |
| UI-09 | P2 | Chart bars en dashboard: valores a `text-[10px]` ilegibles cuando la barra es angosta. | `app/copilot/dashboard/dashboard-page-client.tsx:149` |
| UI-10 | P2 | Tesorería usa `max-w-7xl` y `!space-y-4` forceados — excepción de layout sin justificación. | `app/copilot/tesoreria/page.tsx:20-21` |
| UI-11 | P2 | Padding lateral custom en Cartera (`lg:px-8`) diferente al resto. | `app/copilot/cartera/page.tsx:40` |
| UI-12 | P3 | Tab activo en /alertas usa `bg-[var(--copilot-ink)] text-white` — inconsistente con el accent verde del sistema. | `app/copilot/alertas/page.tsx:562-563` |
| UI-13 | P3 | Skeleton fallbacks de Cartera y Tesorería son custom, no usan `CopilotSkeletonKpiRow`. | `app/copilot/cartera/page.tsx:49`, `app/copilot/tesoreria/page.tsx:32` |
| UI-14 | P3 | Dot indicador de "no leída" en /alertas es 7px — tamaño mínimo discutible. | `app/copilot/alertas/page.tsx:303-307` |

---

## 6. Problemas de copy

| ID | Severidad | Descripción | Ubicación |
|---|---|---|---|
| COPY-01 | P1 | Typo en `FINANZAS_COBERTURA_QUERY`: `"/copilot/finanzasímode=cobertura"` — el carácter `í` debería ser `?`. Puede romper el link. | `app/copilot/finanzas/finanzas-client.tsx:83` |
| COPY-02 | P2 | Descripción de Cartera incluye instrucción de navegación: "Para contactar clientes, usá Clientes o Cobranza." No corresponde a una description de página. | `app/copilot/cartera/page.tsx:37` |
| COPY-03 | P2 | Descripción de Tesorería menciona banco específico: "Caja disponible Santander". Si cambia de banco o es multi-banco, esta descripción caduca. | `app/copilot/tesoreria/page.tsx:16` |
| COPY-04 | P2 | Descripción en /acciones (page): "Gestiones pendientes, seguimientos y revisiones del negocio" no coincide con nav: "Prioridad del día y tareas concretas". | `app/copilot/acciones/page.tsx:541` |
| COPY-05 | P2 | La card de aviso en /acciones dice "Agenda y acciones integradas en Cobranza" — sugiere que el módulo fue vaciado pero no se removió el contenido ni se actualizó el propósito. | `app/copilot/acciones/page.tsx:545-563` |
| COPY-06 | P3 | `fmtAmount()` local en dashboard usa `"U$S "` para USD. El sistema usa `formatUsdEquivalent()` que produce formato diferente. | `app/copilot/dashboard/dashboard-page-client.tsx:90-94` |
| COPY-07 | P3 | Sub text en cobranza KPI: "datos parciales — historial truncado" es técnico. Preferable: "basado en los últimos N registros". | `components/copilot/cobranza/cobranza-kpi-grid.tsx:86` |
| COPY-08 | P3 | "Cargando cobranza…" en el Suspense fallback es texto plano, no un skeleton. Inconsistente con el sistema. | `app/copilot/cobranza/page.tsx:21` |

---

## 7. Inconsistencias visuales globales

| # | Descripción | Impacto |
|---|---|---|
| 1 | **3 implementaciones de KPI card**: `CopilotKpiCard` (sistema), `KpiCard` (cobranza), `MetricCard` (alertas). Visualmente similares pero no idénticas. | Alto |
| 2 | **Eyebrow en page header**: solo Cartera y Tesorería lo usan. | Medio |
| 3 | **Estados de carga**: `CopilotSkeletonKpiRow` (acciones), texto plain "Cargando…" (cobranza), `Loader2` spinner (acciones pipeline), custom div dashed (cartera, tesorería). | Alto |
| 4 | **Border radius de cards**: `rounded-2xl` en system cards, `rounded-xl` en KPI locales, `rounded-lg` en inputs. No es problemático pero el mix es perceptible. | Bajo |
| 5 | **Colores hardcodeados en alertas**: `sky-100/500/700` y `rgba(31,107,74,0.22)` fuera de los tokens. | Alto (dark mode) |
| 6 | **Formato de moneda**: `U$S ` (dashboard) vs `formatUsdEquivalent()` vs `formatMoneyCurrency()`. | Medio |
| 7 | **Filter tab activo**: /alertas usa ink (gris oscuro), /acciones usa accent (verde). | Medio |
| 8 | **Sidebar default**: colapsado siempre — puede ser correcto por densidad pero falta un onboarding state. | Medio |
| 9 | **Padding lateral**: `/cartera` usa `lg:px-8`, el resto usa `sm:px-6` como máximo. | Bajo |
| 10 | **Empty states**: `CopilotPremiumEmptyState` (acciones, algunos), `CopilotOperationalEmptyState` (empty states operativos), texto inline genérico (alertas sin resultados de filtro), custom JSX (alertas con error). | Alto |

---

## 8. Quick Wins

> CSS/layout/copy únicamente. Sin lógica financiera, sin DB, sin APIs.

| # | Descripción | Archivo | Riesgo |
|---|---|---|---|
| QW-01 | Reemplazar `MetricCard` en /alertas con `CopilotKpiCard` | `app/copilot/alertas/page.tsx` | Ninguno |
| QW-02 | Reemplazar `KpiCard` en /cobranza con `CopilotKpiCard` | `components/copilot/cobranza/cobranza-kpi-grid.tsx` | Ninguno |
| QW-03 | Fix hardcoded sky-100/sky-700/sky-500 → usar tokens en /alertas | `app/copilot/alertas/page.tsx:109,132` | Ninguno |
| QW-04 | Fix rgba hardcoded en unread notification card → `var(--copilot-accent-soft)` | `app/copilot/alertas/page.tsx:274` | Ninguno |
| QW-05 | Agregar `CopilotPageHeader` a /mesa-de-ayuda (title + description) | `app/copilot/mesa-de-ayuda/page.tsx` | Ninguno |
| QW-06 | Actualizar description de Cartera: remover la instrucción de navegación | `app/copilot/cartera/page.tsx:37` | Ninguno |
| QW-07 | Actualizar description de Tesorería: remover nombre del banco | `app/copilot/tesoreria/page.tsx:16` | Ninguno |
| QW-08 | Alinear description de /acciones con la del nav | `app/copilot/acciones/page.tsx:541` | Ninguno |
| QW-09 | Fix `quickBtnClass` en acciones → usar `CopilotButton` variant="ghost" | `app/copilot/acciones/page.tsx:89` | Bajo |
| QW-10 | Reemplazar `SummaryPill` local en /acciones con `CopilotKpiCard` size="mini" | `app/copilot/acciones/page.tsx:1273` | Ninguno |
| QW-11 | Reemplazar fallbacks de Cartera y Tesorería con `CopilotSkeletonKpiRow` | `cartera/page.tsx:49`, `tesoreria/page.tsx:32` | Ninguno |
| QW-12 | Unificar filter tab activo: usar `var(--copilot-accent)` en /alertas (igual que /acciones) | `app/copilot/alertas/page.tsx:562` | Ninguno |
| QW-13 | Agregar `role="status"` y `aria-live="polite"` a los estados de carga inline | Global | Ninguno |
| QW-14 | Revisar y corregir `FINANZAS_COBERTURA_QUERY` (el `í` typo) | `app/copilot/finanzas/finanzas-client.tsx:83` | Bajo (fix de bug) |

---

## 9. Mejoras por prioridad

### P1 — Alto impacto

| ID | Categoría | Descripción | Complejidad | Riesgo |
|---|---|---|---|---|
| P1-01 | UX | Sidebar: definir un estado inicial para sesiones nuevas vs sesiones recurrentes (localStorage ya implementado, revisar default=true vs default=false en desktop). | Baja | Bajo |
| P1-02 | UI | Dashboard: eliminar el objeto `C.*` local y usar tokens del visual system. | Media | Bajo |
| P1-03 | UX | Acciones pipeline: colapsar los formularios de seguimiento por defecto (expand on demand). | Media | Bajo |
| P1-04 | UI | Alertas: reemplazar `sky-*` por tokens del sistema. | Baja | Ninguno |
| P1-05 | UX | Mesa de ayuda: agregar `CopilotPageHeader`. | Baja | Ninguno |
| P1-06 | Copy | Verificar y corregir `FINANZAS_COBERTURA_QUERY` typo. | Baja | Bajo (puede ser bug activo) |

### P2 — Mejora importante

| ID | Categoría | Descripción | Complejidad | Riesgo |
|---|---|---|---|---|
| P2-01 | UI | Unificar los 3 KPI card locales hacia `CopilotKpiCard`. | Media | Bajo |
| P2-02 | UX | Agregar count badge al ítem "Alertas" en el sidebar (unread count). | Media | Bajo |
| P2-03 | UX | Reducir tabs de filtro en /alertas: "Todas / No leídas / Críticas / Más▾". | Baja | Bajo |
| P2-04 | UX | Cobranza KPI grid: fijar el grid en 4 columnas y adaptar el contenido de las cards (en lugar de cambiar el número de columnas). | Baja-Media | Bajo |
| P2-05 | UI | Dashboard charts: aumentar el tamaño de fuente del valor de 10px a 11px y agregar `title` attr a cada barra. | Baja | Ninguno |
| P2-06 | Copy | Actualizar todas las descriptions que funcionan como instrucciones de navegación vs descripción de módulo. | Baja | Ninguno |
| P2-07 | UI | Unificar estados de carga: decidir 1 patrón (skeleton o texto) y aplicar consistentemente. | Media | Bajo |
| P2-08 | Accesibilidad | Timestamp en /alertas al 43% de opacidad: subirlo a ≥ 60% (`text-[var(--copilot-ink-muted)]` sin `/70`). | Baja | Ninguno |
| P2-09 | UX | Acciones: aclarar la purpose del módulo (si delega a Cobranza, hacer la redirección explícita en el nav config en lugar de un aviso en el body). | Media | Bajo |
| P2-10 | UI | Acciones: reemplazar `rgba(255,255,255,0.7)` hardcoded en form de seguimiento por tokens. | Baja | Ninguno |

### P3 — Polish

| ID | Categoría | Descripción | Complejidad | Riesgo |
|---|---|---|---|---|
| P3-01 | UI | Estandarizar el uso de `eyebrow` en page headers (o quitarlo de Cartera/Tesorería, o adoptarlo en todos). | Baja | Ninguno |
| P3-02 | UI | Dot de "no leída" en /alertas: aumentar a 8-9px o agregar un borde claro alrededor del article. | Baja | Ninguno |
| P3-03 | UI | Sidebar sección labels: `tracking-[0.16em]` es muy amplio. Reducir a `tracking-[0.10em]` o `tracking-widest`. | Baja | Ninguno |
| P3-04 | Copy | Formato de moneda: unificar en `formatMoneyCurrency()` / `formatUsdEquivalent()` y eliminar `fmtAmount()` local del dashboard. | Media | Bajo |
| P3-05 | Copy | Sub text "datos parciales — historial truncado" → "basado en los últimos N registros" en cobranza. | Baja | Ninguno |
| P3-06 | Técnica | Reemplazar `key={i}` por keys estables en chart components. | Baja | Ninguno |
| P3-07 | Accesibilidad | Agregar alternativas textuales (aria-label o `<caption>`) a gráficos del dashboard. | Media | Ninguno |
| P3-08 | UI | Sidebar colapsado: el botón de expand está dentro del `<nav>`, no en el `<header>`. Moverlo al área del brand header. | Baja | Bajo |

---

## 10. Riesgo estimado por mejora

| Nivel | Criterio | Mejoras en esta categoría |
|---|---|---|
| **Ninguno** | Solo CSS/copy/classnames | QW-01 a QW-14 (excepto QW-09, QW-14), P3-01, P3-02, P3-03, P3-05, P2-05, P2-06, P2-08 |
| **Bajo** | Cambio de estructura JSX menor, sin lógica | P1-01, P1-02, P1-03, P1-04, P1-05, P2-01, P2-02, P2-03, P2-04, P2-07, P2-09, P3-04 |
| **Medio** | Refactor de componente con props changes | P2-01 (reemplazar KpiCard local), P3-07 (alt text charts) |
| **Alto** | Requiere datos nuevos o cambio de lógica | Ninguno en este reporte |

**Nota importante:** COPY-01 (`FINANZAS_COBERTURA_QUERY` typo) puede ser un **bug activo** que rompe el link de cobertura. Verificar urgente antes de clasificarlo como "polish".

---

## 11. Archivos y componentes probablemente afectados

### Por quick wins y P1

```
app/copilot/alertas/page.tsx           — sky-* colors, MetricCard local, rgba hardcoded, tab color, timestamp opacity
app/copilot/acciones/page.tsx          — SummaryPill, quickBtnClass, pipeline form collapse, copy
app/copilot/cartera/page.tsx           — description copy, eyebrow, padding, skeleton
app/copilot/tesoreria/page.tsx         — description copy, eyebrow, max-w, skeleton
app/copilot/mesa-de-ayuda/page.tsx     — agregar CopilotPageHeader
app/copilot/finanzas/finanzas-client.tsx — FINANZAS_COBERTURA_QUERY typo
app/copilot/dashboard/dashboard-page-client.tsx — C.* constants, chart font size
components/copilot/cobranza/cobranza-kpi-grid.tsx — KpiCard local, grid layout shift
components/copilot/module-sidebar.tsx  — sidebar default, toggle button position
components/copilot/copilot-nav-config.tsx — Acciones sidebarHidden flag
```

### Para revisión en fase 2 (no tocar en fase 1)

```
app/copilot/reportes/reportes-client.tsx     — audit de dialogs PDF
app/copilot/clientes/[companyId]/*           — audit de drawer detalle cliente
components/copilot/hoy/hoy-page-view.tsx    — audit completo de /hoy
components/copilot/tesoreria/tesoreria-shell.tsx — layout de paneles
components/copilot/cartera-shell.tsx         — layout de cartera
```

---

## 12. Recomendación de implementación por fases

### Fase 1 — Quick Wins (1-2 días, riesgo casi nulo)

Ejecutar todos los QW-01 a QW-14. No requieren aprobación adicional, son cambios CSS/copy/JSX simples. Empezar con:

1. QW-14: Fix del typo en `FINANZAS_COBERTURA_QUERY` (puede ser bug activo).
2. QW-03, QW-04: Colores hardcodeados en alertas (rompe dark mode).
3. QW-05: Header en mesa-de-ayuda.
4. QW-01, QW-02, QW-10: Unificar KPI cards locales.
5. QW-06, QW-07, QW-08: Copy de descriptions.
6. El resto en cualquier orden.

### Fase 2 — P1 estructurales (3-5 días)

1. P1-01: Sidebar default — definir comportamiento en desktop (recomendado: abierto en primera visita, recordar preferencia después).
2. P1-02: Dashboard `C.*` → tokens.
3. P1-03: Pipeline forms en Acciones → colapsar.
4. P2-01: Unificar los 3 KPI card locales en `CopilotKpiCard`.
5. P2-02: Badge de alertas no leídas en sidebar.
6. P2-07: Patrón de loading unificado.

### Fase 3 — P2 y polish (continuo)

Iterar sobre P2-03 a P2-10 y los P3 durante el desarrollo normal. No requieren sprint dedicado.

### Fase Futura — Requiere nuevos datos o lógica

- Dashboard con librería de charts real (e.g., recharts o chart.js) para accesibilidad y legibilidad de valores.
- Badge count de alertas no leídas en sidebar (requiere exponer `unreadCount` al nivel del layout/nav, no solo en el provider de notificaciones).
- Empty state illustration system (SVG assets de estado vacío unificados).
- Responsive design para el drawer de cliente en mobile (panel fijo lateral solo viable en ≥ lg).

---

## 13. GO / NO GO para primera fase de mejoras

### GO — Autorizado para Fase 1

**Todos los Quick Wins (QW-01 a QW-14)** son GO sin restricciones:
- Son cambios de presentación pura (CSS, copy, classnames).
- No alteran lógica financiera, DB, APIs, Zeta, PDFs ni auth.
- No modifican comportamiento funcional.
- Riesgo: **ninguno** (la mayoría) o **bajo** (QW-09, QW-14).

**P1-04** (fix sky-* hardcoded) y **P1-05** (header mesa-de-ayuda) también son GO inmediato.

**P1-06** (typo finanzas): GO inmediato como fix de bug. Verificar primero si el link está roto en producción.

### GO CONDICIONADO — Requiere revisión rápida antes de ejecutar

- **P1-01** (sidebar default): Decidir el comportamiento deseado con el equipo antes de cambiar.
- **P1-03** (pipeline forms colapsados): Verificar que el comportamiento de "guardar" no dependa del form estar visible.
- **P2-04** (grid cobranza fijo): Verificar con el dueño del módulo si el cambio de layout en USD mode era intencional.

### NO GO para Fase 1

- Cualquier cambio en lógica de cálculo financiero.
- Cambios en la estructura de datos de Zeta.
- Modificaciones al sistema de permisos.
- Cambios que afecten PDFs o exports.
- Nuevos endpoints o cambios de API.

---

## Apéndice — Checklist de calidad percibida del producto

| Criterio | Antes | Después Fase 1 (estimado) |
|---|---|---|
| Consistencia visual de KPI cards | 3/10 | 8/10 |
| Funcionamiento en dark mode | 7/10 | 9/10 |
| Claridad del copy de módulos | 5/10 | 8/10 |
| Orientación del usuario (dónde estoy) | 6/10 | 9/10 |
| Estados de carga percibidos | 5/10 | 7/10 |
| Calidad percibida general | 6/10 | 7.5/10 |

---

*Reporte generado el 2026-06-26. No implementar hasta aprobación. No commit. No cambios de código.*
