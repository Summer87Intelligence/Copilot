# Dark Mode QA Checklist — Copilot

Período: 2026-06-08 · Objetivo: contraste usable en light y dark sin degradar light mode.

## Cómo validar

1. Activar dark mode (`data-theme="dark"` / toggle personalización).
2. Revisar texto, cards, tabs, tablas, botones disabled y modales.
3. Probar mobile ~390px y desktop.
4. Marcar **OK** cuando no hay texto ilegible ni cards blancas sobre fondo oscuro.

---

## Tokens (`app/globals.css`)

| Token | Light | Dark | Estado |
|-------|-------|------|--------|
| `--copilot-app-bg` | canvas | canvas oscuro | OK |
| `--copilot-card-bg` | `#faf8f5` | `#211e1b` | OK |
| `--copilot-panel-bg` | `#ffffff` | `#262220` | OK |
| `--copilot-soft-bg` | tint ink 4% | tint ink 6% | OK |
| `--copilot-text` / `--copilot-muted` | ink / muted | ink claro | OK |
| `--copilot-tab-bg` | white 95% | dark 95% | OK |
| `--copilot-table-header-bg` | white 92% | dark 92% | OK |
| `--copilot-disabled-bg/text` | gris suave | gris oscuro legible | OK |
| `--copilot-tone-*-bg` | gradientes financieros | gradientes oscuros | OK |
| `--copilot-badge-*` | amber/rose/emerald | variantes dark | OK |

---

## Rutas principales

### `/copilot/hoy`

| Componente | Problema | Fix | Estado |
|------------|----------|-----|--------|
| `hoy-executive-summary-card` | cards `bg-white` | `--copilot-card-bg` | OK |
| `hoy-currency-executive-card` | card blanca | token surface | OK |
| `hoy-clients-with-debt-section` | panel expandido claro | soft/card tokens | OK |
| `hoy-drawer` | drawer blanco | `--copilot-panel-bg` | OK |
| `hoy-period-bar` | inputs blancos | panel + disabled tokens | OK |

### `/copilot/clientes`

| Componente | Problema | Fix | Estado |
|------------|----------|-----|--------|
| `app/copilot/clientes/page.tsx` | filtros/chips blancos | batch token replace | OK |

### `/copilot/clientes/[companyId]` — Ficha 360

| Componente | Problema | Fix | Estado |
|------------|----------|-----|--------|
| `copilot-client-360-view` tabs | sticky bar blanca | `--copilot-tab-bg` | OK |
| KPI cards deuda | gradiente `from-white` | `copilot-visual-system` tones | OK |
| `client-next-step-banner` | card blanca, CTA ghost | card-bg + ghost tokens | OK |
| Tablas facturas/cobros | filas `rgba(255…)` | card-bg / soft-bg | OK |
| Botones disabled | `opacity-50` invisible | `--copilot-disabled-*` | OK |
| `collection-message-assistant` | tabs/panel blanco | token surfaces | OK |

### `/copilot/cartera`

| Componente | Problema | Fix | Estado |
|------------|----------|-----|--------|
| `cartera-shell` | cards financieras blancas | `financialCardToneClass` | OK |
| `financial-control-bar` | inputs blancos | panel tokens | OK |
| `client-debt-explorer` | tablas/paneles | batch replace | OK |

### `/copilot/tesoreria`

| Componente | Problema | Fix | Estado |
|------------|----------|-----|--------|
| `tesoreria-ui.ts` | fields/th blancos | panel + table-header tokens | OK |
| `tesoreria-shell` / panels | cards blancas | batch replace | OK |

### `/copilot/finanzas`

| Componente | Problema | Fix | Estado |
|------------|----------|-----|--------|
| `financial-executive-sections` | paneles `bg-white/70` | card-bg tokens | OK |
| `financial-layered-sections` | mismos patrones | batch replace | OK |

### `/copilot/reportes`

| Componente | Problema | Fix | Estado |
|------------|----------|-----|--------|
| `report-table`, dialogs preview | surfaces blancas | batch replace | OK |

### `/copilot/acciones`

| Componente | Problema | Fix | Estado |
|------------|----------|-----|--------|
| `action-card` | badges light-only | badge CSS vars | OK |
| `collection-agenda-section` | cards blancas | batch replace | OK |

### `/copilot/alertas`

| Componente | Problema | Fix | Estado |
|------------|----------|-----|--------|
| `app/copilot/alertas/page.tsx` | filtros/lista blancos | batch replace | OK |

### `/copilot/admin`

| Componente | Problema | Fix | Estado |
|------------|----------|-----|--------|
| `app/copilot/admin/page.tsx` | modal/inputs blancos | batch replace | OK |

---

## Shared / infra

| Archivo | Fix | Estado |
|---------|-----|--------|
| `app/globals.css` | tokens semánticos light+dark | OK |
| `components/copilot/ui/copilot-visual-system.ts` | financial cards, inputs, ghost, disabled | OK |
| `components/copilot/copilot-ui.tsx` | CopilotCard, Badge, GhostButton | OK |
| Modales/drawers globales | batch 162 archivos `components/copilot` + `app/copilot` | OK |

---

## Causa raíz

1. Componentes usaban `bg-white`, gradientes `from-white` y opacidades fijas pensadas solo para light.
2. Dark mode compilaba (`data-theme="dark"`) pero **no había tokens de superficie** para cards, tabs, tablas, inputs y disabled.
3. `disabled:opacity-50` hacía botones casi invisibles sobre fondos oscuros.
4. Badges con `bg-amber-100` / `text-rose-800` no tenían equivalente dark.

## Script auxiliar (no commitear obligatorio)

`scripts/fix-dark-mode-surfaces.mjs` — reemplazo controlado de patrones `bg-white*` → tokens en `components/copilot` y `app/copilot`.

---

## Pendiente / follow-up opcional

- Badges inline en `hoy-clients-with-debt-section` (`bg-rose-100`) — legibles en dark pero podrían migrar a `--copilot-badge-*`.
- Algunos `text-slate-*` decorativos en alertas — bajo impacto.
- Revisión visual manual en dispositivo real recomendada post-deploy.
