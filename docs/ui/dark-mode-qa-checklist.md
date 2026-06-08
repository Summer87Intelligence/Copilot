# Dark Mode — QA Checklist

**Implementado:** 2026-06-08
**Estado:** Dark + Light + System (ciclo toggle: sistema → claro → oscuro)

## Infraestructura

- [x] CSS variables para dark mode en `app/globals.css` (`[data-theme="dark"]` block)
- [x] `@custom-variant dark` en globals.css para soporte de `dark:` prefix en Tailwind v4
- [x] Anti-FOUC blocking script en `<head>` de `app/layout.tsx`
- [x] `ThemeProvider` en `components/theme/theme-provider.tsx`
- [x] `ThemeToggle` en `components/theme/theme-toggle.tsx` (icono Sun / Moon / Monitor)
- [x] Persistencia en `localStorage` clave `copilot-theme`
- [x] Escucha cambios de sistema (`prefers-color-scheme`) en modo "system"

## Verificaciones de compilación

- [x] `npx tsc --noEmit` — sin errores
- [x] `npm test` — 3031/3031 tests pasan
- [ ] `npm run build` — en progreso

## Header (copilot-environment-health-strip)

- [x] Toggle visible a la izquierda de la campana
- [x] Orden visual: Estado → Avatar → Campana → Toggle → Fecha
- [x] Header background: `bg-[var(--copilot-header-bg)]` (era `rgba(255,255,255,0.80)` hardcoded)
- [x] Backdrop blur activo en ambos modos

## Dropdowns críticos

- [x] `CopilotUserBar`: dropdown usa `bg-[var(--copilot-dropdown-bg)]` (era `bg-white`)
- [x] `CopilotUserBar`: hover sign-out usa `bg-[var(--copilot-hover-bg)]` (era `bg-rose-50`)
- [x] `CopilotNotificationBell`: panel dropdown usa `bg-[var(--copilot-dropdown-bg)]`
- [x] `CopilotNotificationBell`: sticky section header usa `bg-[var(--copilot-sticky-bg)]`
- [x] `CopilotNotificationBell`: bell button hover usa `bg-[var(--copilot-hover-bg)]`
- [x] `CopilotNotificationBell`: empty state icon circle usa `bg-[var(--copilot-surface-muted)]`
- [x] Notification type icons (fallback) usa `bg-[var(--copilot-surface-muted)]`

## Rutas a verificar manualmente en modo oscuro

| Ruta | Qué revisar |
|---|---|
| `/copilot/dashboard` | Cards, métricas, gráficos |
| `/copilot/clientes` | Tabla, filtros, buscador |
| `/copilot/clientes/[id]` | Detalle 360, saldos, historial |
| `/copilot/alertas` | Lista de alertas, badges |
| `/copilot/acciones` | Drawer de acciones, evidencias |
| `/copilot/finanzas` | Gráficos financieros, tablas |
| `/login` | Formulario, autofill (ver nota) |

## Áreas con hardcoded light colors (pendiente fase 2)

Los siguientes archivos tienen `bg-white`, `bg-slate-*` o `bg-gray-*` hardcoded
que **no fueron tocados** en esta primera fase porque contienen lógica financiera
o son componentes complejos que requieren auditoría visual individual:

- `components/copilot/copilot-client-360-view.tsx` — múltiples `bg-white/XX`
- `components/copilot/copilot-client-account-statement.tsx` — múltiples `bg-white/XX`
- `app/copilot/acciones/page.tsx` — múltiples `bg-white/XX`
- `app/copilot/alertas/page.tsx` — `bg-slate-*`
- `app/copilot/admin/page.tsx` — `bg-white`
- `components/copilot/aging-analytics.tsx` — `bg-white`
- `components/copilot/client-debt-explorer.tsx` — múltiples `bg-white`

Estos tienen `bg-white/50`–`bg-white/90` con opacidad que en dark mode
resultarán en blanco semitransparente sobre fondo oscuro — perceptible pero no roto.

## Nota: login + autofill

`app/globals.css` tiene una regla `:-webkit-autofill` que fuerza fondo blanco en el login.
Si se agrega dark mode al login, esta regla debe actualizarse.
Por ahora el login está fuera del scope del dark mode.

## Variables CSS de tema definidas

| Variable | Light | Dark |
|---|---|---|
| `--copilot-canvas` | `#f4f1ea` | `#1a1714` |
| `--copilot-ink` | `#2c2825` | `#e8e3db` |
| `--copilot-ink-muted` | `rgba(44,40,37,0.62)` | `rgba(232,227,219,0.55)` |
| `--copilot-border` | `rgba(44,40,37,0.10)` | `rgba(232,227,219,0.12)` |
| `--copilot-sidebar` | `#f0ebe3` | `#1e1b18` |
| `--copilot-accent` | `#1f6b4a` | `#2d9b6b` |
| `--copilot-accent-soft` | `rgba(31,107,74,0.12)` | `rgba(45,155,107,0.18)` |
| `--copilot-card` | `#faf8f5` | `#211e1b` |
| `--copilot-header-bg` | `rgba(255,255,255,0.80)` | `rgba(26,23,20,0.85)` |
| `--copilot-dropdown-bg` | `#ffffff` | `#1e1b18` |
| `--copilot-sticky-bg` | `rgba(255,255,255,0.95)` | `rgba(26,23,20,0.95)` |
| `--copilot-hover-bg` | `rgba(44,40,37,0.08)` | `rgba(232,227,219,0.10)` |
| `--copilot-surface-muted` | `#f1f5f9` | `#2a2520` |
