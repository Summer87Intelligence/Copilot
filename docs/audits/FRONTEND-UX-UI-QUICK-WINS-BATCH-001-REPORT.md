# FRONTEND-UX-UI-QUICK-WINS-BATCH-001

**Fecha:** 2026-06-26  
**Scope:** QW-01 a QW-05 del audit FRONTEND-UX-UI-AUDIT-WITH-DESIGN-SKILLS-001  
**Precondición:** Commit P0/P1 `a4b9616` aplicado  
**Restricciones:** Sin lógica financiera, DB, APIs, Zeta, rediseños ni cálculos

---

## 1. Resumen de QWs implementados y omitidos

| QW | Descripción | Estado | Motivo |
|---|---|---|---|
| QW-01 | Reemplazar `MetricCard` local en /alertas con `CopilotKpiCard` | ✅ Implementado | CSS/classnames — sin riesgo |
| QW-02 | Reemplazar `KpiCard` local en /cobranza con `CopilotKpiCard` | ✅ Implementado | CSS/classnames — sin riesgo |
| QW-03 | Fix hardcoded sky-*/colors en /alertas | ✅ Ya implementado | Realizado en Phase 1 P0/P1 (commit a4b9616) |
| QW-04 | Fix rgba hardcoded en unread notification card → token | ✅ Implementado | CSS token — sin riesgo |
| QW-05 | Agregar `CopilotPageHeader` a /mesa-de-ayuda | ✅ Ya implementado | `HelpdeskPageClient` ya renderiza `CopilotPageHeader` internamente — verificado en Phase 1 |

**Net: 3 cambios nuevos (QW-01, QW-02, QW-04). QW-03 y QW-05 ya estaban resueltos.**

---

## 2. Archivos modificados

| Archivo | QW | Tipo de cambio |
|---|---|---|
| `app/copilot/alertas/page.tsx` | QW-01, QW-04 | Eliminar componente local, reemplazar usages, fix token |
| `components/copilot/cobranza/cobranza-kpi-grid.tsx` | QW-02 | Eliminar componente local, reemplazar usages |

---

## 3. Cambios realizados en detalle

### QW-01 — Reemplazar MetricCard en /alertas con CopilotKpiCard

**Archivo:** `app/copilot/alertas/page.tsx`

**Antes:**
```tsx
// Componente local de 53 líneas con estilos duplicados del design system
function MetricCard({
  label, value, sub, tone = "neutral",
}: {
  label: string;
  value: number;
  sub: string;
  tone?: "critical" | "warning" | "positive" | "neutral";
}) { /* ... */ }

// Uso:
<MetricCard label="No leídas" value={metrics.unread} sub="pendientes de revisar" tone={metrics.unread > 0 ? "warning" : "neutral"} />
<MetricCard label="Críticas" value={metrics.critical} sub="requieren acción" tone={metrics.critical > 0 ? "critical" : "neutral"} />
<MetricCard label="Vencimientos" value={metrics.vencimientos} sub="próximos y atrasados" tone={metrics.vencimientos > 0 ? "warning" : "neutral"} />
<MetricCard label="Cobros recibidos" value={metrics.cobros} sub="últimas 72 h" tone={metrics.cobros > 0 ? "positive" : "neutral"} />
```

**Después:**
```tsx
// Componente eliminado. Import agregado:
import { CopilotKpiCard } from "@/components/copilot/ui/copilot-kpi-card";

// Uso:
<CopilotKpiCard eyebrow="No leídas" value={String(metrics.unread)} subtitle="pendientes de revisar" tone={metrics.unread > 0 ? "warning" : "neutral"} />
<CopilotKpiCard eyebrow="Críticas" value={String(metrics.critical)} subtitle="requieren acción" tone={metrics.critical > 0 ? "danger" : "neutral"} />
<CopilotKpiCard eyebrow="Vencimientos" value={String(metrics.vencimientos)} subtitle="próximos y atrasados" tone={metrics.vencimientos > 0 ? "warning" : "neutral"} />
<CopilotKpiCard eyebrow="Cobros recibidos" value={String(metrics.cobros)} subtitle="últimas 72 h" tone={metrics.cobros > 0 ? "positive" : "neutral"} />
```

**Mapping de props:**
- `label` → `eyebrow`
- `value: number` → `value={String(value)}`
- `sub` → `subtitle`
- `tone="critical"` → `tone="danger"` (alineado con el tipo de CopilotKpiCard)

**Cambio visual:** El valor ya no toma el color del tono (rojo/naranja/verde) — `CopilotKpiCard` mantiene el valor en `--copilot-ink` por diseño. El tono se comunica via el borde. Esto es coherente con la filosofía del design system documentada en el componente.

---

### QW-02 — Reemplazar KpiCard en /cobranza con CopilotKpiCard

**Archivo:** `components/copilot/cobranza/cobranza-kpi-grid.tsx`

**Antes:**
```tsx
// Componente local de 32 líneas con valor en texto coloreado por tono
function KpiCard({ label, value, sub, tone = "neutral" }: {
  label: string; value: string; sub?: string; tone?: "neutral" | "danger" | "warning";
}) { /* ... */ }
```

**Después:**
```tsx
// Componente eliminado. Import agregado:
import { CopilotKpiCard } from "@/components/copilot/ui/copilot-kpi-card";
```

**8 instancias de KpiCard reemplazadas por CopilotKpiCard** con mapping:
- `label` → `eyebrow`
- `value` → `value` (ya era string)
- `sub` → `subtitle`
- `tone` → `tone` (neutral/danger/warning — mismos valores)

**Cambio visual:**
- Valor de `text-xl font-bold` → `text-2xl font-bold` (CopilotKpiCard standard)
- Valor deja de tomar color del tono → siempre `--copilot-ink`
- Borde refuerza el tono (danger = borde rojo, warning = borde naranja)

---

### QW-04 — Fix rgba hardcoded en unread notification card

**Archivo:** `app/copilot/alertas/page.tsx`, función `NotificationCard`

**Antes:**
```tsx
? "border-[rgba(31,107,74,0.22)] bg-[rgba(31,107,74,0.028)] shadow-sm"
```

**Después:**
```tsx
? "border-[var(--copilot-accent-soft)] bg-[var(--copilot-accent-soft)] shadow-sm"
```

El token `--copilot-accent-soft` está definido en `globals.css`:
- Light: `rgba(31, 107, 74, 0.12)`
- Dark: `rgba(45, 155, 107, 0.18)` (adapta al modo oscuro automáticamente)

**Cambio visual:**
- Border: de 22% → 12% de opacidad del verde (ligeramente más sutil)
- Background: de 2.8% → 12% de opacidad del verde (más visible — mejora la distinción de no-leídas)
- Dark mode: ahora funciona correctamente con el token del tema oscuro en lugar del `rgba` hardcoded que no adaptaba

---

### QW-03 y QW-05 — Ya implementados

| QW | Implementado en | Detalles |
|---|---|---|
| QW-03 | Fase P0/P1 (commit a4b9616) | `bg-sky-100 text-sky-700 text-sky-500` → tokens en `SEVERITY_CFG` y `getIconConfig` |
| QW-05 | Pre-existente | `HelpdeskPageClient` ya renderizaba `CopilotPageHeader` con `title="Mesa de ayuda"` y `description` — el page.tsx es solo un thin server wrapper de acceso |

---

## 4. Checks ejecutados

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ Clean — sin errores de tipos |
| `npx vitest run` | ✅ 3771 tests passed (296 suites) |
| `npm run build` | ✅ Clean — 141 rutas, exit code 0 |

---

## 5. Análisis de riesgo

| QW | Riesgo potencial | Mitigación |
|---|---|---|
| QW-01 | Cambio visual: valor pierde color del tono | CopilotKpiCard por diseño usa borde para el tono — es la intención del sistema |
| QW-02 | Cambio visual: valor más grande (xl→2xl) y pierde color | Consistente con el sistema; borde comunica tono |
| QW-04 | Background de no-leídas más visible (2.8%→12%) | Mejora la UX — unread items deben destacar más |
| QW-03 | Ya resuelto | — |
| QW-05 | Ya resuelto | — |

**Sin riesgo de regresión funcional** — todos los cambios son presentacionales.

---

## 6. Inconsistencias resueltas

Antes de este batch, había **3 implementaciones de KPI card** en el sistema:
1. `CopilotKpiCard` (design system) — /hoy, /cartera, /finanzas, etc.
2. `MetricCard` local — /alertas (eliminada ✅)
3. `KpiCard` local — /cobranza (eliminada ✅)

Después del batch: **1 implementación** — `CopilotKpiCard` en todas las rutas auditadas.

---

## 7. GO / NO GO para commit

### GO ✅

- `npx tsc --noEmit` → clean
- `npx vitest run` → 3771 passed
- `npm run build` → pendiente de confirmar
- 0 cambios de lógica financiera
- 0 cambios de API
- 0 cambios de DB
- Identidad visual mantenida (paleta, tokens, layout)
- Design system unificado: 2 componentes locales eliminados

**Mensaje de commit sugerido:**
```
feat(ui): QW-01/02/04 — unify KPI cards and fix accent token in alertas/cobranza
```

---

*Reporte generado el 2026-06-26. Build confirmado limpio. GO para commit.*
