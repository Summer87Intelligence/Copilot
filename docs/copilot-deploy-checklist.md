# Checklist de deploy Copilot

Checklist operativo para evitar deploys rotos por archivos sin trackear, imports inválidos, build fallido o smoke básico fallando en `/copilot/rutas`.

## Antes de push

- `git status --short` limpio o con todo lo relevante staged y listo para commit.
- `npm run check:deploy` en verde.
- Si hay SQL nuevo en `supabase/`, aplicar migraciones en el entorno objetivo antes de confiar en runtime en producción.
- Revisar que el deploy en Vercel quede en **Ready** sin errores de build.
- Smoke manual o automatizado de producción en `/copilot/rutas` (comando operativo, filtros, panel lateral y acciones rápidas).

## Comandos de validación

| Comando | Qué valida |
| --- | --- |
| `npm run check:types` | TypeScript sin emitir (`tsc --noEmit`). |
| `npm run check:unit` | Suite unitaria crítica del core operacional. |
| `npm run check:build` | Build de producción Next.js. |
| `npm run check:smoke:rutas` | Playwright smoke de `/copilot/rutas` (FASE 6.5). |
| `npm run check:deploy` | Working tree limpio + types + unit + build. |

## Smoke de rutas (Playwright)

El smoke vive en `e2e/rutas-command-center-65.spec.ts`.

- Usa `PLAYWRIGHT_BASE_URL` si está definido.
- Si no está definido, Playwright intenta `http://127.0.0.1:3000` y puede levantar `next dev` automáticamente.
- Para un smoke estable en local, preferí build de producción:

```bash
npm run build
npx next start --port 3005
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3005 npm run check:smoke:rutas
```

No commitees credenciales. La sesión de smoke puede resolverse con `PLAYWRIGHT_COPILOT_SESSION` o `PLAYWRIGHT_COPILOT_USER` / `PLAYWRIGHT_COPILOT_PIN` solo en tu entorno local.

## CI en GitHub

El workflow `.github/workflows/copilot-ci.yml` corre en `push` y `pull_request` a `main`:

- `npm run check:types`
- `npm run check:unit`
- `npm run check:build`

El smoke Playwright queda fuera del CI por defecto (requiere app levantada y sesión válida). Ejecutalo localmente o en un job manual cuando tengas `PLAYWRIGHT_BASE_URL` y servidor disponibles.

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
