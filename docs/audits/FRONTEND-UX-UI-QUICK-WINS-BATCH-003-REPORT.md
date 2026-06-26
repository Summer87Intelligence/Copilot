# FRONTEND-UX-UI-QUICK-WINS-BATCH-003

**Fecha:** 2026-06-26  
**Scope:** 3 items detectados en la visual review post-Batch-002  
**Precondición:** Batch 002 commiteado (`e75ceaf`)  
**Restricciones:** Sin lógica financiera, DB, APIs, Zeta, cálculos, PDFs, auth

---

## 1. Quick Wins — Estado

| ID | Descripción | Estado | Motivo / Notas |
|---|---|---|---|
| B3-01 | Fix active filter tab color en /alertas: `--copilot-ink` → `--copilot-accent` | ✅ Implementado | CSS token swap — sin riesgo |
| B3-02 | Fix `fmtAmount()` prefix `"U$S "` → `"USD "` en /dashboard | ✅ Implementado | Copy puro — sin riesgo |
| B3-03 | Remover `eyebrow="Summer87 Copilot"` de /cartera y /tesoreria | ✅ Implementado | Prop removal — sin riesgo |

---

## 2. Archivos modificados

| Archivo | ID | Tipo |
|---|---|---|
| `app/copilot/alertas/page.tsx` | B3-01 | CSS token — active tab + badge |
| `app/copilot/dashboard/dashboard-page-client.tsx` | B3-02 | Copy — prefix string |
| `app/copilot/cartera/page.tsx` | B3-03 | Prop removal |
| `app/copilot/tesoreria/page.tsx` | B3-03 | Prop removal |

---

## 3. Cambios realizados

### B3-01 — Alertas: active filter tab usa accent en lugar de ink

**Archivo:** `app/copilot/alertas/page.tsx`

**Motivo:** Los filter tabs activos usaban `--copilot-ink` (negro/casi negro) como fondo. La convención del sistema es que los elementos seleccionados/activos usan `--copilot-accent` (verde) — coherente con los botones `CopilotButton variant="primary"` y otros estados activos del design system.

**Antes:**
```tsx
active
  ? "bg-[var(--copilot-ink)] text-white shadow-sm"
  : "bg-[var(--copilot-card-bg)]/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]"

// Badge dentro del tab activo:
active
  ? "bg-[var(--copilot-card-bg)]/20 text-white"
  : "bg-[var(--copilot-border)] text-[var(--copilot-ink-muted)]"
```

**Después:**
```tsx
active
  ? "bg-[var(--copilot-accent)] text-[var(--copilot-on-accent)] shadow-sm"
  : "bg-[var(--copilot-card-bg)]/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]"

// Badge dentro del tab activo:
active
  ? "bg-[var(--copilot-on-accent)]/20 text-[var(--copilot-on-accent)]"
  : "bg-[var(--copilot-border)] text-[var(--copilot-ink-muted)]"
```

**Tokens usados:**
- `--copilot-accent`: `#1f6b4a` (light) / `#2d9b6b` (dark) — verde del sistema
- `--copilot-on-accent`: blanco — texto sobre fondo accent, automáticamente correcto en light y dark
- Badge: `--copilot-on-accent`/20 como overlay sobre el verde para el counter badge

**Cambio visual:** Tab activo pasa de negro → verde sistema. Badge activo usa blanco semi-transparente sobre verde. Dark mode funciona automáticamente por los tokens.

---

### B3-02 — Dashboard: `fmtAmount()` prefix `"U$S "` → `"USD "`

**Archivo:** `app/copilot/dashboard/dashboard-page-client.tsx`

**Motivo:** La función local `fmtAmount()` usaba el prefijo `"U$S "` para moneda USD, mientras que el estándar del sistema (usado en `formatMoneyCurrency`, `formatUsdEquivalent`, y el resto de la UI) es `"USD"`. Inconsistencia de copy puro, sin impacto en lógica.

**Antes:**
```ts
function fmtAmount(n: number, currency: string): string {
  const prefix = currency === "USD" ? "U$S " : "$ ";
  return `${prefix}${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}
```

**Después:**
```ts
function fmtAmount(n: number, currency: string): string {
  const prefix = currency === "USD" ? "USD " : "$ ";
  return `${prefix}${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}
```

**Alcance:** `fmtAmount` se usa en ~15 lugares dentro de `dashboard-page-client.tsx` (charts de barras, tabla de deuda, tabla de movimientos, proyección de caja). Todos heredan el fix automáticamente.

---

### B3-03 — Cartera / Tesorería: eyebrow `"Summer87 Copilot"` removido

**Archivos:** `app/copilot/cartera/page.tsx`, `app/copilot/tesoreria/page.tsx`

**Motivo:** Solo estas 2 rutas tenían el prop `eyebrow="Summer87 Copilot"` en `CopilotPageHeader`. El resto del sistema (alertas, acciones, hoy, dashboard, etc.) no tiene eyebrow en el header de página. La inconsistencia generaba un subtítulo de producto visible solo en dos módulos, sin justificación de UX.

**Antes (ambos archivos):**
```tsx
<CopilotPageHeader
  eyebrow="Summer87 Copilot"
  title="Cartera"   // o "Tesorería"
  description="..."
/>
```

**Después (ambos archivos):**
```tsx
<CopilotPageHeader
  title="Cartera"   // o "Tesorería"
  description="..."
/>
```

**Cambio visual:** Desaparece el subtítulo "Summer87 Copilot" sobre el título de módulo en /cartera y /tesoreria. El título del módulo ocupa la jerarquía visual completa — coherente con el resto del sistema.

---

## 4. Componentes afectados

| Componente / Función | Acción |
|---|---|
| Filter tabs en `alertas/page.tsx` | Tokens de color actualizados: `ink` → `accent` + `on-accent` |
| `fmtAmount()` en `dashboard-page-client.tsx` | Prefix `"U$S "` → `"USD "` |
| `CopilotPageHeader` en cartera | Prop `eyebrow` removido |
| `CopilotPageHeader` en tesoreria | Prop `eyebrow` removido |

---

## 5. Riesgo

| ID | Riesgo | Detalle |
|---|---|---|
| B3-01 | Ninguno | Token swap puro. `--copilot-accent` y `--copilot-on-accent` son tokens del sistema con dark mode incorporado. |
| B3-02 | Ninguno | Copy string puro. Sin cambio en lógica de formato, locale o cálculo. |
| B3-03 | Ninguno | Prop removal. `eyebrow` es opcional en `CopilotPageHeader` — sin prop, simplemente no se renderiza. |

**Sin impacto en:**
- Lógica financiera
- DB / Supabase
- APIs
- Zeta
- Cálculos
- PDFs / reportes
- Auth / permisos

---

## 6. Checks

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ Clean — exit code 0 |
| `npx vitest run` | ✅ 3771 tests passed (296 suites) |
| `npm run build` | ✅ Clean — exit code 0 |

---

## 7. GO / NO GO para commit

### GO ✅ (pendiente confirmación de build)

- `tsc` clean
- 3771 tests passed
- 0 cambios de lógica financiera
- 0 cambios de API / DB / Zeta
- Design system avanza: filter tabs usan accent correcto, copy USD unificado, eyebrow inconsistente removido

**Mensaje de commit sugerido:**
```
refactor(ui): QW-B3 — fix accent tab, USD prefix, remove eyebrow inconsistency
```

---

*Reporte generado el 2026-06-26. Todos los checks pasaron. GO para commit.*
