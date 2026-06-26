# FRONTEND-UX-UI-QUICK-WINS-BATCH-002

**Fecha:** 2026-06-26  
**Scope:** QW-06 a QW-10 del audit FRONTEND-UX-UI-AUDIT-WITH-DESIGN-SKILLS-001  
**Precondición:** Batch 001 commiteado (`c47168a`)  
**Restricciones:** Sin lógica financiera, DB, APIs, Zeta, cálculos, PDFs, auth

---

## 1. Quick Wins — Estado

| QW | Descripción | Estado | Motivo / Notas |
|---|---|---|---|
| QW-06 | Remover instrucción de navegación de Cartera description | ✅ Implementado | Copy puro, sin riesgo |
| QW-07 | Remover nombre del banco de Tesorería description | ✅ Implementado | Copy puro, sin riesgo |
| QW-08 | Alinear description de /acciones con la del nav | ✅ Implementado | Copy puro, sin riesgo |
| QW-09 | Fix `quickBtnClass` → `CopilotButton` variant="ghost" size="sm" | ✅ Implementado | Bajo riesgo — solo refactor de classnames |
| QW-10 | Reemplazar `SummaryPill` local con `CopilotKpiCard` size="mini" | ✅ Implementado | Sin riesgo — componente visual puro |

**Sin QWs diferidos a Batch 003.** Todos dentro de scope CSS/copy/classnames.

---

## 2. Quick Wins diferidos

Ninguno. Los 5 QWs son copy/CSS puro sin lógica ni API.

---

## 3. Archivos modificados

| Archivo | QW | Tipo |
|---|---|---|
| `app/copilot/cartera/page.tsx` | QW-06 | Copy — description |
| `app/copilot/tesoreria/page.tsx` | QW-07 | Copy — description |
| `app/copilot/acciones/page.tsx` | QW-08, QW-09, QW-10 | Copy + classnames + componente local |

---

## 4. Cambios realizados

### QW-06 — Cartera: description sin instrucción de navegación

**Archivo:** `app/copilot/cartera/page.tsx`

**Antes:**
```
description="Análisis financiero de deuda, cobros y antigüedad. Para contactar clientes, usá Clientes o Cobranza."
```

**Después:**
```
description="Análisis financiero de deuda, cobros y antigüedad."
```

**Motivo:** La segunda oración era una instrucción de navegación dentro de la description del módulo. Las descriptions deben describir qué hace la pantalla, no dónde ir. Información redundante con el sidebar.

---

### QW-07 — Tesorería: description sin nombre de banco

**Archivo:** `app/copilot/tesoreria/page.tsx`

**Antes:**
```
description="Caja disponible Santander, pagos programados y registros manuales."
```

**Después:**
```
description="Caja disponible, pagos programados y registros manuales."
```

**Motivo:** El nombre "Santander" en la description caduca si cambia el banco o el sistema evoluciona a multi-banco. La UI no debe hardcodear entidades externas en copy de módulo.

---

### QW-08 — Acciones: description alineada con nav

**Archivo:** `app/copilot/acciones/page.tsx`

**Antes:**
```
description="Gestiones pendientes, seguimientos y revisiones del negocio."
```

**Después:**
```
description="Prioridad del día y tareas concretas."
```

**Motivo:** El nav config define la descripción como `"Prioridad del día y tareas concretas"`. La page usaba una descripción diferente, generando inconsistencia entre lo que el sidebar comunica y lo que la pantalla muestra.

---

### QW-09 — Acciones: quickBtnClass eliminado, botones usan size="sm"

**Archivo:** `app/copilot/acciones/page.tsx`

**Antes:**
```ts
const quickBtnClass = "rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm";

// 3 botones simples:
<CopilotGhostButton ... className={quickBtnClass}>Sin respuesta</CopilotGhostButton>
<CopilotGhostButton ... className={quickBtnClass}>Respondió</CopilotGhostButton>
<CopilotGhostButton ... className={quickBtnClass}>Reunión</CopilotGhostButton>

// Botón con estado adicional:
<CopilotGhostButton ... className={`${quickBtnClass} ${saleExpandId === a.id ? "border-... bg-..." : ""}`}>
  Venta
</CopilotGhostButton>
```

**Después:**
```tsx
// Constante eliminada.

// 3 botones simples:
<CopilotGhostButton size="sm" ... >Sin respuesta</CopilotGhostButton>
<CopilotGhostButton size="sm" ... >Respondió</CopilotGhostButton>
<CopilotGhostButton size="sm" ... >Reunión</CopilotGhostButton>

// Botón con estado adicional:
<CopilotGhostButton
  size="sm"
  className={saleExpandId === a.id ? "border-[var(--copilot-accent)] bg-[var(--copilot-tone-positive-bg)]/50" : ""}
>
  Venta
</CopilotGhostButton>
```

**`CopilotGhostButton`** es un wrapper de `CopilotButton variant="ghost"`. El `size="sm"` produce `h-8 px-3 text-xs` — equivalente funcional de `quickBtnClass` (`py-1.5 px-3 text-xs`) usando el sistema de botones. Se elimina `rounded-lg` custom (el sistema usa `rounded-xl`) y `shadow-sm` (no corresponde al variant ghost).

---

### QW-10 — Acciones: SummaryPill eliminado, reemplazado por CopilotKpiCard size="mini"

**Archivo:** `app/copilot/acciones/page.tsx`

**Antes:** Componente local de 29 líneas con `text-lg font-bold` y lógica `isCritical` manual.

```tsx
function SummaryPill({ label, value, highlight = false }) { /* ... */ }

<div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
  <SummaryPill label="Total" value={bandejaMetrics.total} />
  <SummaryPill label="Críticas" value={bandejaMetrics.critical} highlight={bandejaMetrics.critical > 0} />
  <SummaryPill label="Cobranza" value={bandejaMetrics.collection} />
  <SummaryPill label="Tesorería" value={bandejaMetrics.treasury} />
</div>
```

**Después:**
```tsx
// Import agregado:
import { CopilotKpiCard } from "@/components/copilot/ui/copilot-kpi-card";

// SummaryPill eliminado.

<div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
  <CopilotKpiCard size="mini" eyebrow="Total" value={String(bandejaMetrics.total)} />
  <CopilotKpiCard size="mini" eyebrow="Críticas" value={String(bandejaMetrics.critical)} tone={bandejaMetrics.critical > 0 ? "danger" : "neutral"} />
  <CopilotKpiCard size="mini" eyebrow="Cobranza" value={String(bandejaMetrics.collection)} />
  <CopilotKpiCard size="mini" eyebrow="Tesorería" value={String(bandejaMetrics.treasury)} />
</div>
```

**Mapping de props:**
- `label` → `eyebrow`
- `value: number` → `value={String(value)}`
- `highlight` → `tone="danger"` cuando `critical > 0` (borde rojo via design system)

**Nota:** `CopilotKpiCard` de `@/components/copilot/ui/copilot-kpi-card` (primitivo del design system con `size/tone/eyebrow/subtitle`) — distinto del `CopilotKpiCard` legacy de `copilot-ui.tsx` (con `label/value/hint/trend`). No hay colisión de nombres en los imports de `acciones/page.tsx`.

**Cambio visual:** El valor pasa de `text-lg font-bold` (SummaryPill) a `text-[12px] font-semibold` (CopilotKpiCard mini) — más compacto, consistente con el sistema. El tono "críticas" comunica el estado via borde en lugar de valor rojo.

---

## 5. Componentes afectados

| Componente | Acción |
|---|---|
| `SummaryPill` | Eliminado de `acciones/page.tsx` |
| `CopilotGhostButton` | Simplificado: `className` removido, `size="sm"` agregado |
| `CopilotKpiCard` (primitivo) | Ahora también usado en `/acciones` (además de `/alertas` y `/cobranza`) |
| `CopilotPageHeader` (cartera, tesorería, acciones) | Descriptions actualizadas |

---

## 6. Riesgo

| QW | Riesgo | Detalle |
|---|---|---|
| QW-06 | Ninguno | Copy only |
| QW-07 | Ninguno | Copy only |
| QW-08 | Ninguno | Copy only |
| QW-09 | Bajo | Visual change: botones usan `h-8` (fixed height) vs `py-1.5`. Border radius `rounded-xl` vs `rounded-lg`. Sin impacto funcional. |
| QW-10 | Ninguno | Componente visual puro. El valor pasa de `text-lg` a `text-[12px]` — más compacto pero consistente con el sistema. |

**Sin impacto en:**
- Lógica financiera
- DB / Supabase
- APIs
- Zeta
- Cálculos
- PDFs / reportes
- Auth / permisos

---

## 7. Checks

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ Clean — sin errores |
| `npx vitest run` | ✅ 3771 tests passed (296 suites) |
| `npm run build` | ✅ Clean — exit code 0 |

---

## 8. GO / NO GO para commit

### GO ✅ (pendiente confirmación de build)

- `tsc` clean
- 3771 tests passed
- 0 cambios de lógica financiera
- 0 cambios de API / DB / Zeta
- Design system avanza: 3 componentes locales eliminados (SummaryPill, quickBtnClass, descriptions desalineadas)
- `CopilotKpiCard` primitivo ahora unificado en 3 rutas (/alertas, /cobranza, /acciones)

**Mensaje de commit sugerido:**
```
refactor(ui): QW-06-10 — align descriptions, unify buttons and summary pills
```

---

*Reporte generado el 2026-06-26. Todos los checks pasaron. GO para commit.*
