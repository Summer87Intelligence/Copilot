# Copilot API RBAC — matriz módulo → ruta



Defensa en profundidad para **P1-003**: los permisos por módulo no pueden depender solo del sidebar UI.



## Helper central



```typescript

import {

  requireCopilotModuleAccess,

  requireCopilotModuleWriteAccess,

} from "@/lib/auth/copilot-module-api-auth";

```



### Comportamiento



1. Llama `requireCopilotTenantContext(request)` → **401** sin sesión, **403** sin membresía.

2. Carga permisos efectivos desde **`app_users.role` + `app_user_permissions`** (service role / server), no desde cookie de permisos.

3. Resuelve `access_level` por `module_key`.

4. **403 `FORBIDDEN_MODULE`** si `access_level === none` o por debajo del mínimo requerido.

5. **Superadmin** bypass en todos los módulos.

6. `requireCopilotModuleWriteAccess` exige `write|admin` y aplica la regla **demo_readonly** (igual que `requireCopilotWriteContext`).



### Uso en handlers



```typescript

// GET / lectura

const auth = await requireCopilotModuleAccess(request, "tesoreria");

if (!auth.ok) return auth.response;



// POST / PATCH / DELETE

const auth = await requireCopilotModuleWriteAccess(request, "tesoreria", body);

if (!auth.ok) return auth.response;

```



## Matriz prefijo API → module_key



Fuente de verdad: `lib/auth/copilot-api-module-map.ts` + clasificación en `lib/auth/copilot-api-rbac-registry.ts`.



| Prefijo API | module_key | Notas |

|-------------|------------|--------|

| `/api/copilot/treasury/*` | `tesoreria` | Caja, pagos, conciliación Santander |

| `/api/copilot/dashboard/*` | `hoy` | Dashboard Resumen (PDF) |

| `/api/copilot/reports/*` | `reportes` | PDFs/JSON operativos |

| `/api/copilot/data/*` | `datos` | CRUD tabular proto_* |

| `/api/copilot/integrations/zeta/*` | `datos` | Sync/enrichment Zeta |

| `/api/copilot/financial-reconciliation` | `finanzas` | Diagnóstico financiero |

| `/api/copilot/financial-snapshot` | `finanzas` | Panorama / snapshot |

| `/api/copilot/predictive-financial-dataset` | `finanzas` | Dataset predictivo |

| `/api/copilot/cashflow-dataset` | `finanzas` | Flujo de caja |

| `/api/copilot/real-insights` | `finanzas` | Insights financieros en vivo |

| `/api/copilot/insight-engine-dataset` | `finanzas` | Dataset insight engine |

| `/api/copilot/executive-briefing` | `finanzas` | Briefing ejecutivo |

| `/api/copilot/rutas-hub` | `finanzas` | Legacy rutas (hub) |

| `/api/copilot/rutas-snapshot` | `finanzas` | Legacy rutas (snapshot) |

| `/api/copilot/cash-status-amounts` | `tesoreria` | Montos de caja |

| `/api/copilot/manual.pdf` | `manual` | PDF manual de uso |

| `/api/copilot/portfolio` | `cartera` | Rollup de cartera |

| `/api/copilot/collection-actions/*` | `cartera` | Gestión de cobranza |

| `/api/copilot/client-360` | `clientes` | Ficha agregada |

| `/api/copilot/clients/*` | `clientes` | Alias transferencias |

| `/api/copilot/clientes/*` | `clientes` | Estado de cuenta PDF/JSON |

| `/api/copilot/transfer-aliases` | `clientes` | Alias globales |

| `/api/copilot/dataset` | `datos` | Dataset operativo |

| `/api/copilot/proto-documents` | `datos` | Documentos proto |

| `/api/copilot/actions/*` | `acciones` | Cola operativa |

| `/api/copilot/decision-engine/*` | `acciones` | Motor de decisiones / automatización |

| `/api/copilot/decisions/*` | `acciones` | Decisiones generadas |

| `/api/copilot/initiatives/*` | `acciones` | Iniciativas operativas |

| `/api/copilot/outcomes` | `acciones` | Outcomes detectados |

| `/api/copilot/automation-governance` | `acciones` | Gobierno de automatizaciones |

| `/api/copilot/operational-actions/*` | `acciones` | Acciones operativas |

| `/api/copilot/notifications/*` | `hoy` | Inbox / alertas del día |

| `/api/copilot/operational-events` | `hoy` | Eventos operativos |

| `/api/copilot/operational-feed/*` | `hoy` | Feed operativo |

| `/api/copilot/operational-health` | `hoy` | Salud operativa |

| `/api/copilot/operational-intelligence` | `hoy` | Inteligencia operativa |

| `/api/copilot/operational-memory` | `hoy` | Memoria operativa |

| `/api/copilot/operational-workflows/*` | `hoy` | Workflows (lectura); mutaciones con write |

| `/api/copilot/pipeline-health` | `hoy` | Salud de pipelines |

| `/api/copilot/enterprise-sync-health` | `hoy` | Salud sync enterprise |

| `/api/copilot/intelligence-bundle` | `agentes` | Bundle IA agregado |

| `/api/copilot/llm-briefing` | `agentes` | Briefing LLM |

| `/api/copilot/strategic-recommendations` | `agentes` | Recomendaciones estratégicas IA |



Resolución automática: `resolveCopilotApiModuleKey(pathname)` en `lib/auth/copilot-api-module-map.ts`.



## Allowlist (sin module_key)



| Ruta | Clasificación | Motivo |

|------|---------------|--------|

| `/api/copilot/login` | **pública** | Auth PIN — sin sesión previa |

| `/api/copilot/logout` | **pública** | Cierre de sesión |

| `/api/copilot/admin/*` | **admin** | `requireAdminContext` + middleware superadmin |

| `/api/copilot/me` | **tenant only** | Identidad/sesión — solo `appUser` de la sesión |

| `/api/copilot/dev-dataset-summary` | **tenant only** | Dev tooling — conteos proto_* |

| `/api/copilot/dev-financial-trace` | **tenant only** | Dev tooling — traza financiera interna |



## Reglas de decisión (Fase 4B)



| Tipo de dato | module_key |

|--------------|------------|

| Financiero (snapshot, insights, rutas legacy) | `finanzas` |

| Clientes / alias | `clientes` |

| Feed operativo / salud / notificaciones | `hoy` |

| Acciones, decisiones, automatización | `acciones` |

| Sync proto / Zeta | `datos` |

| Bundles IA / LLM | `agentes` |

| Identidad `/me` | solo tenant (excepción) |

| Login/logout | público documentado |



## Middleware vs API



| Capa | Qué valida |

|------|------------|

| `middleware.ts` (páginas `/copilot/*`) | Preset del rol en cookie (Edge, sin DB overrides) |

| **API handlers** | Preset + **`app_user_permissions`** vía helper |



Los overrides de permisos en DB **solo aplican en API** (y layout server con `getServerEffectivePermissions`).



## Validación



```bash

npx tsc --noEmit

npx vitest run lib/auth/copilot-module-api-auth.test.ts

npx vitest run lib/auth/copilot-api-rbac-coverage.test.ts

npx vitest run lib/auth/santander-import-rbac-api.test.ts

npx vitest run lib/reports/manual/copilot-manual-pdf-api.test.ts

npx vitest run lib/integrations/zeta/zeta-api-auth.test.ts lib/integrations/zeta/zeta-api-routes-auth.test.ts

```



El test `copilot-api-rbac-coverage.test.ts` escanea `app/api/copilot/**/route.ts` y falla si:



- una ruta no está en la matriz ni en allowlist;

- una ruta financiera queda solo con `requireCopilotTenantContext`;

- un handler mapeado no usa `requireCopilotModule*`.



## Ejemplos de respuesta



**401** (sin sesión):



```json

{ "ok": false, "code": "UNAUTHENTICATED", "message": "…" }

```



**403 módulo**:



```json

{

  "ok": false,

  "code": "FORBIDDEN_MODULE",

  "message": "No tenés acceso a este módulo.",

  "moduleKey": "tesoreria"

}

```



**403 write**:



```json

{

  "ok": false,

  "code": "FORBIDDEN_MODULE",

  "message": "No tenés permiso de modificación en este módulo.",

  "moduleKey": "datos"

}

```



## Riesgos restantes



- **Nav UI `dashboard` vs API `hoy`**: el sidebar puede usar `moduleKey: "dashboard"` mientras las APIs de dashboard resuelven `hoy`. Alinear en fase UI futura.

- **Cron en `/notifications/generate`**: bypass con `CRON_SECRET`; usuarios autenticados pasan por RBAC `hoy` write.

- **Dev routes** (`dev-*`): tenant-only intencional; no exponer en producción sin revisión.

- **Middleware Edge** no aplica overrides DB — usuario con override solo lo ve reflejado vía API, no al navegar páginas bloqueadas por preset.


