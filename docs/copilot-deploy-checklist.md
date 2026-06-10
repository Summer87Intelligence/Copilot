# Checklist de deploy Copilot

Checklist operativo para evitar deploys rotos por archivos sin trackear, imports inválidos, build fallido o regresiones en rutas canónicas (`/copilot/hoy`, `/copilot/dashboard`, `/copilot/alertas`).

## Antes de push

- `git status --short` limpio o con todo lo relevante staged y listo para commit.
- `npm run check:deploy` en verde.
- Si hay SQL nuevo en `supabase/`, aplicar migraciones en el entorno objetivo antes de confiar en runtime en producción.
- Revisar que el deploy en Vercel quede en **Ready** sin errores de build.
- Smoke manual rápido en producción: `/copilot/hoy`, `/copilot/dashboard`, `/copilot/alertas` y un redirect legacy (`/copilot/rutas` → Hoy).

## Comandos de validación

| Comando | Qué valida |
| --- | --- |
| `npm run check:types` | TypeScript sin emitir (`tsc --noEmit`). |
| `npm run test` | Suite Vitest completa del repo. |
| `npm run check:unit` | Subconjunto unitario crítico del core operacional. |
| `npm run check:build` | Build de producción Next.js. |
| `npm run check:deploy` | Working tree limpio + types + unit + build. |

Flujo recomendado antes de merge:

```bash
npm run check:types
npm run test
npm run build
node scripts/check-copilot-manual-encoding.mjs
node scripts/generate-copilot-manual-content.mjs --check
```

## Redirects legacy (post CLEANUP-LEGACY)

Enlaces antiguos siguen resolviendo vía `next.config.ts`:

| Origen | Destino |
| --- | --- |
| `/copilot/insights` | `/copilot/dashboard` |
| `/copilot/gestion-ia` | `/copilot/agentes` |
| `/copilot/rutas` (+ subrutas) | `/copilot/hoy` |
| `/copilot/personalizacion` | `/copilot/hoy` |
| `/copilot/operacional` (+ subrutas) | `/copilot/alertas` |

## CI en GitHub

El workflow `.github/workflows/copilot-ci.yml` corre en `push` y `pull_request` a `main`:

- `npm run check:types`
- `npm run check:unit`
- `npm run check:build`

## Pre-push opcional

No se instalan hooks automáticamente. Si querés una barrera local antes de push:

```bash
node scripts/pre-push-check.mjs
```

Ese script delega en `npm run check:deploy`.

## Artefactos ignorados por `check:deploy`

`scripts/check-working-tree-clean.mjs` ignora solo:

- `.next/`
- `test-results/`
- `playwright-report/`

Cualquier otro cambio sin commitear hace fallar `check:deploy`.
