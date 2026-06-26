# FRONTEND-UX-UI-PHASE-1-P0-P1-FIXES-001

**Fecha:** 2026-06-26  
**Ejecutado por:** Claude Code  
**Referencia:** FRONTEND-UX-UI-AUDIT-WITH-DESIGN-SKILLS-001-REPORT.md  
**Estado:** Implementado · Pendiente de commit

---

## Resumen

Se implementaron todos los fixes P0/P1 definidos en el audit. No se tocó lógica financiera, DB, APIs, Zeta ni PDFs.

| Fix | ID Audit | Estado |
|---|---|---|
| P0 — Typo `FINANZAS_COBERTURA_QUERY` | COPY-01 | Corregido |
| P1 — Alertas colores sky-\* dark mode | UI-01 | Corregido |
| P1 — Sidebar default colapsado en desktop | UX-01 | Corregido |
| P1 — Acciones pipeline forms expandidos simultáneamente | UX-03 | Corregido |
| P1 — Mesa de ayuda: dark mode toast + botón hardcodeado | UI-01 (derivado) | Corregido |

---

## Cambios realizados

### Fix 1 — P0: `FINANZAS_COBERTURA_QUERY` typo

**Archivo:** `app/copilot/finanzas/finanzas-client.tsx` (línea 83)

**Antes:**
```ts
const FINANZAS_COBERTURA_QUERY =
  "/copilot/finanzasímode=cobertura&from=atencion-prioritaria";
```

**Después:**
```ts
const FINANZAS_COBERTURA_QUERY =
  "/copilot/finanzas?mode=cobertura&from=atencion-prioritaria";
```

**Impacto:** El carácter `í` (U+00ED) actuaba como separador de pathname, generando una URL inválida `/copilot/finanzasímode=cobertura&from=atencion-prioritaria` en lugar de `/copilot/finanzas?mode=cobertura&from=atencion-prioritaria`. Esto rompía silenciosamente 4 links internos que apuntaban a la vista de cobertura desde `/copilot/finanzas` (líneas 1017, 1190, 1205, 1503 del mismo archivo). El usuario que hacía click llegaba a una ruta 404 en lugar de la vista de cobertura.

**Riesgo:** Ninguno — corrección puntual de una cadena de texto.

---

### Fix 2 — P1: Alertas — colores Tailwind hardcodeados rompen dark mode

**Archivo:** `app/copilot/alertas/page.tsx` (líneas 108-109, 132)

**Antes:**
```ts
// Icon bubble para sync_changes_detected
if (type === "sync_changes_detected")
  return {
    bg: "bg-sky-100",
    icon: <Zap className={`${sz} text-sky-500`} aria-hidden />,
  };

// Severity badge para severidad "info"
info: { label: "Info", cls: "bg-sky-100 text-sky-700" },
```

**Después:**
```ts
// Icon bubble para sync_changes_detected
if (type === "sync_changes_detected")
  return {
    bg: "bg-[var(--copilot-badge-neutral-bg)]",
    icon: <Zap className={`${sz} text-[var(--copilot-accent)]`} aria-hidden />,
  };

// Severity badge para severidad "info"
info: { label: "Info", cls: "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]" },
```

**Tokens usados:**
- `--copilot-badge-neutral-bg`: `rgba(44, 40, 37, 0.06)` en light / `rgba(232, 227, 219, 0.06)` en dark — fondo neutro cálido que respeta ambos modos.
- `--copilot-accent`: `#1f6b4a` en light / `#2d9b6b` en dark — el verde de acento del sistema para el ícono de sincronización (evento positivo del sistema).
- `--copilot-ink-muted`: color de texto muted correctamente tokenizado para ambos modos.

**Impacto:** En dark mode, `bg-sky-100` aparecía como un bloque azul claro sobre fondo oscuro (altamente disonante con la paleta cálida). Con los tokens, el badge adopta el fondo neutral del sistema en cualquier tema.

**Riesgo:** Ninguno — solo className strings. No se modifica lógica.

---

### Fix 3 — P1: Sidebar colapsado por defecto en desktop

**Archivo:** `components/copilot/module-shell.tsx` (línea 56)

**Antes:**
```ts
useLayoutEffect(() => {
  void Promise.resolve().then(() => {
    const pref = readSidebarPreference(storageKey);
    setCollapsed(pref !== null ? pref : true);   // siempre colapsado en primera visita
    setHydrated(true);
  });
}, [storageKey]);
```

**Después:**
```ts
useLayoutEffect(() => {
  void Promise.resolve().then(() => {
    const pref = readSidebarPreference(storageKey);
    // First visit: open on desktop (>= 1024px), collapsed on mobile
    const defaultCollapsed = window.innerWidth < 1024;
    setCollapsed(pref !== null ? pref : defaultCollapsed);
    setHydrated(true);
  });
}, [storageKey]);
```

**Comportamiento resultante:**

| Situación | Antes | Después |
|---|---|---|
| Primera visita en desktop (≥1024px) | Sidebar colapsado — solo iconos | Sidebar expandido — labels visibles |
| Primera visita en mobile (<1024px) | Sidebar colapsado | Sidebar colapsado (sin cambio) |
| Visitas siguientes (con localStorage) | Respeta preferencia | Respeta preferencia (sin cambio) |
| SSR / pre-hydration | Colapsado (`useState(true)`) | Colapsado (sin cambio — evita flash) |

**Notas de implementación:**
- El `useState(true)` inicial permanece para evitar hydration mismatch en SSR.
- El parámetro `collapsed={hydrated ? collapsed : true}` en el sidebar previene el flash visual durante la hidratación.
- `window.innerWidth` se usa solo dentro del `useLayoutEffect` (client-only) — seguro para SSR.
- El breakpoint lg (1024px) es el mismo que usa el resto del sistema de grids de Tailwind.

**Riesgo:** Bajo — el comportamiento visual cambia solo en la primera visita de desktop. Usuarios con preferencia guardada en localStorage no son afectados. Usuarios de mobile no son afectados.

---

### Fix 4 — P1: Acciones pipeline — formularios de seguimiento colapsados por defecto

**Archivo:** `app/copilot/acciones/page.tsx`

**Problema original:** El "Historial de gestiones" (pipeline colapsable) mostraba simultáneamente los formularios de seguimiento (3 campos: Responsable, Resultado esperado, Antes) abiertos para TODAS las acciones de la lista al mismo tiempo. Con 10+ acciones, la pantalla se convertía en una columna interminable de formularios.

**Cambios:**

1. **Nuevo estado** (después de línea 311):
```ts
const [expandedTrackingId, setExpandedTrackingId] = useState<string | null>(null);
```

2. **Reemplazo del form siempre visible** por un toggle button + renderizado condicional:

```tsx
{(() => {
  const ld = loopDrafts[a.id] ?? { assignee: "", expected: "", before: "" };
  const isExpanded =
    expandedTrackingId === a.id || loopSaveSuccessId === a.id;
  const hasDraft = Boolean(
    ld.assignee.trim() || ld.expected.trim() || ld.before.trim()
  );
  return (
    <div className="mt-4">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() =>
          setExpandedTrackingId((prev) => (prev === a.id ? null : a.id))
        }
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] transition-colors hover:text-[var(--copilot-ink)]"
      >
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          aria-hidden
        />
        Seguimiento
        {/* Dot indicador si ya tiene datos */}
        {hasDraft ? (
          <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--copilot-accent)]" />
        ) : null}
      </button>

      {/* Formulario condicional */}
      {isExpanded ? (
        <div className="mt-2 rounded-xl border border-[var(--copilot-border)]/90 bg-[var(--copilot-panel-bg)] px-3 py-3">
          {/* ... formulario idéntico al anterior ... */}
        </div>
      ) : null}
    </div>
  );
})()}
```

**Comportamiento resultante:**
- Por defecto: solo un botón compacto "Seguimiento" por acción (con chevron rotable).
- Click en el botón: expande el form de esa acción y colapsa el de cualquier otra (solo uno abierto a la vez).
- Dot verde: visible en el toggle cuando la acción ya tiene datos de seguimiento cargados.
- Al guardar: el form permanece abierto hasta mostrar el mensaje de confirmación (`loopSaveSuccessId`); luego puede cerrarse manualmente.
- Los datos en `loopDrafts` siguen siendo tracked para todas las acciones independientemente del estado de expansión.
- `bg-[rgba(255,255,255,0.7)]` reemplazado por `bg-[var(--copilot-panel-bg)]` — corrección adicional de dark mode en el formulario.

**Riesgo:** Bajo. No se modifica ninguna función de mutación (`saveActionLoop`, `submitOutcome`). Solo se cambia el mecanismo de visibilidad del formulario.

---

### Fix 5 — P1: Mesa de ayuda — dark mode toast y botón

**Archivo:** `components/copilot/helpdesk/helpdesk-page-client.tsx`

**Hallazgo durante implementación:** El audit señalaba que `/mesa-de-ayuda` no tenía `CopilotPageHeader`. Al revisar el código, se confirmó que el `CopilotPageHeader` **ya existe** dentro de `HelpdeskPageClient` (tanto en la vista de lista como en la de detalle), con title="Mesa de ayuda" y description correcta. La P1 estructural estaba cubierta.

Sin embargo, se detectaron dos bugs de dark mode en el mismo componente:

**Bug A — Toast con `dark:` syntax incompatible:**

El proyecto usa el variant custom `[data-theme="dark"]` en lugar del selector estándar `dark:`. Todos los `dark:*` en `HelpdeskPageClient` no funcionaban en dark mode.

**Antes (2 instancias, en vista lista y en vista detalle):**
```ts
toast.ok
  ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
  : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
```

**Después (reemplazado con `replace_all` en ambas instancias):**
```ts
toast.ok
  ? "border border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
  : "border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]"
```

**Bug B — Botón "Nuevo ticket" con color hardcodeado:**

**Antes:**
```ts
className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
```

**Después** (tokens del primary button del design system, idéntico a `CopilotButton` variant="primary"):
```ts
className="inline-flex items-center gap-2 rounded-xl border border-[var(--copilot-accent)] bg-[var(--copilot-accent)] px-4 py-2 text-sm font-semibold text-[var(--copilot-on-accent)] shadow-sm transition hover:border-[var(--copilot-accent-hover)] hover:bg-[var(--copilot-accent-hover)]"
```

**Riesgo:** Ninguno. Solo className strings. No se modifica lógica.

---

## Archivos modificados

```
app/copilot/finanzas/finanzas-client.tsx           +1/-1
app/copilot/alertas/page.tsx                       +3/-3
components/copilot/module-shell.tsx                +2/-1
app/copilot/acciones/page.tsx                      +57/-30
components/copilot/helpdesk/helpdesk-page-client.tsx +3/-3
```

Total: 5 archivos · +66/-38 líneas netas

---

## Checks ejecutados

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | **OK** — sin errores |
| `npm run build` | **OK** — build limpio, 141 rutas compiladas sin warnings |
| `npx vitest run` | **3771 tests passed** — sin fallos ni regresiones |
| Archivos Zeta tocados | Ninguno |
| Archivos de DB/API tocados | Ninguno |
| Lógica financiera tocada | Ninguna |

---

## Antes / Después esperado por ruta

### `/copilot/finanzas` — Fix 1

- **Antes:** Los links "Ver cobertura" en varias secciones de finanzas navegaban a una URL inválida (`/copilot/finanzasímode=...`) → 404 o pantalla en blanco.
- **Después:** Los links navegan correctamente a `/copilot/finanzas?mode=cobertura&from=atencion-prioritaria`.

### `/copilot/alertas` — Fix 2

- **Antes (dark mode):** Las notificaciones de tipo `sync_changes_detected` y las de severidad `info` mostraban un fondo azul cielo (`bg-sky-100`) sobre el canvas oscuro. Completamente disonante con la paleta warm del sistema.
- **Después (dark mode):** El fondo es neutro cálido (`--copilot-badge-neutral-bg`), el ícono usa el verde de acento (`--copilot-accent`), y el badge de severidad "Info" es muted sobre fondo neutral. Consistente en light y dark.

### Global — Fix 3 (sidebar)

- **Antes (primera visita desktop):** El usuario veía únicamente iconos sin labels. Tenía que descubrir por inspección que el sidebar podía expandirse.
- **Después (primera visita desktop):** El sidebar está expandido mostrando todas las secciones y labels. La preferencia del usuario se persiste en localStorage para visitas siguientes.
- **Sin cambio en mobile ni en usuarios con preferencia guardada.**

### `/copilot/acciones` — Fix 4

- **Antes:** Al expandir el "Historial de gestiones", se mostraban simultáneamente todos los formularios de seguimiento (3 campos × N acciones). Con 10+ acciones, la pantalla era innavegable.
- **Después:** Cada acción muestra un botón compacto "↓ Seguimiento" colapsado. Un click expande solo ese formulario y colapsa cualquier otro abierto. Un punto verde indica si la acción ya tiene datos de seguimiento.

### `/copilot/mesa-de-ayuda` — Fix 5

- **Antes:** El toast de éxito/error era verde/rojo Tailwind hardcodeado que no funcionaba en dark mode (la clase `dark:` es incompatible con el sistema `[data-theme="dark"]`). El botón "Nuevo ticket" era azul fuera del design system.
- **Después:** Toast usa tokens del sistema (`copilot-tone-positive-bg`, `copilot-success-text-strong`, etc.) correctamente aplicados en light y dark. Botón usa el mismo style que el primary button del design system.

---

## Riesgos residuales

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Sidebar: usuario que prefería collapsed en desktop ahora lo ve abierto en primera visita | Bajo — es primera visita sin localStorage | La preferencia se guarda en localStorage desde el primer toggle; en segundas visitas se respeta |
| Acciones tracking: usuario que usaba el form expansivo sin tocarlo (para tenerlo a la vista) necesita un click adicional | Bajo — el form no agrega valor si no se usa | El dot verde en el toggle indica cuándo ya hay datos |
| Finanzas cobertura: el fix cambia una URL que podría tener tests E2E que la matcheen | Ninguno detectado | `vitest run` pasa; no hay tests E2E de URL en el suite actual |

---

## GO / NO GO para commit

### GO — Autorizado para commit

Todos los cambios están:
- **Verificados con TypeScript:** `tsc --noEmit` limpio.
- **Verificados con build:** `npm run build` compila sin warnings ni errores.
- **Verificados con tests:** 3771 tests pasan sin regresiones.
- **Scoped correctamente:** Solo CSS, copy y lógica de display-state. Cero cambios en lógica financiera, DB, APIs, Zeta o auth.

**Recomendación de mensaje de commit:**

```
fix(ui): P0/P1 — finanzas query typo, alertas dark mode, sidebar default, acciones forms collapse

- Fix FINANZAS_COBERTURA_QUERY: 'í' → '?' (4 links rotos en /finanzas)
- Replace sky-100/500/700 hardcoded in /alertas with design system tokens
- Sidebar: open by default on desktop (≥1024px), respect localStorage on return visits
- Acciones pipeline: seguimiento forms collapsed by default, one-at-a-time expand
- Helpdesk toast: replace dark: syntax + green/red hardcoded → system tokens
- Helpdesk button: replace bg-blue-600 → copilot primary button tokens
```

### NO GO inmediato

Ninguno. No se detectaron regresiones.

---

## Issues identificados durante implementación (no en scope de este PR)

Estos requieren decisión del equipo antes de actuar:

1. **Helpdesk dark mode no cubierto al 100%:** `HelpdeskTicketForm`, `HelpdeskTicketList`, `HelpdeskTicketDetail` y `HelpdeskFilters` probablemente también usan clases `dark:*` o colores hardcodeados. Pendiente audit profundo de esos componentes.

2. **`bg-[rgba(255,255,255,0.7)]` en acciones pipeline form** ya fue reemplazado por `bg-[var(--copilot-panel-bg)]` en este fix como mejora de oportunidad de dark mode.

3. **El resto de los Quick Wins (QW-01 a QW-14)** del audit original están pendientes para la siguiente iteración.

---

*Reporte generado el 2026-06-26. Sin commit. Listo para revisión.*
