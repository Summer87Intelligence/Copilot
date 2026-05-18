# Zeta Integrations — Guía Operacional

## Estado actual (2026-05-17)

| Dimensión | Estado |
|-----------|--------|
| Tenants con Zeta | 1 (Summer87, `EmpresaCodigo=250218923`) |
| Credenciales | Env vars en Vercel (+ DB como alternativa vía ZETA-17) |
| Sincronización | Multi-tenant ready (cron itera `companies.status='active'`) |

## Cómo resuelve hoy el tenant

### Capa aplicación (TypeScript)
`requireCopilotTenantContext` en `lib/copilot-api-auth.ts`:

1. **JWT path** (Supabase Auth magic link):
   - `auth.getUser()` → obtiene `authUser.id` (= auth.uid())
   - Intenta `getAppUserByAuthUid(authUser.id)` → busca por `app_users.auth_user_id`
   - Fallback: `getAppUserByEmail(authUser.email)` (para usuarios pre-migración SEC-03)
   - `tenantCompanyId = appUser.company_id`

2. **PIN path** (cookie `copilot_session`):
   - Lee `userId` del cookie
   - Busca `app_users` por `id` (servicio con service_role)
   - `tenantCompanyId = app_users.company_id`

### Capa RLS (PostgreSQL)
`copilot_current_workspace_company_id()` en Supabase:

1. Resolver por `auth.uid()` → `app_users.auth_user_id` (POST sec03-01)
2. Fallback: `auth.jwt().email` → `app_users.email` (para usuarios sin `auth_user_id`)

## Cómo se cargan las credenciales Zeta

### Actualmente (env vars)
`loadZetaServerConfig()` en `lib/integrations/zeta/zeta-config.ts` lee:
- `ZETA_EMPRESA_CODIGO` / `ZETA_EMPRESA_CLAVE`
- `ZETA_DESARROLLADOR_CODIGO` / `ZETA_DESARROLLADOR_CLAVE`
- `ZETA_ROL_CODIGO` (default: `"1"`)
- `ZETA_API_BASE_URL` (default: `https://api.zetasoftware.com/rest/APIs`)

### Con workspace_integrations (ZETA-17, por workspace)
`loadZetaServerConfigForWorkspace(workspaceCompanyId)` en el mismo archivo:

1. Consulta `workspace_integrations` para el workspace + provider='zeta' + status='active'
2. Si hay row con credentials completas → usa esas credenciales
3. Fallback automático a env vars (no rompe nada)

## Cómo agregar un nuevo cliente/workspace

### Paso 1: Registrar el workspace en DB

```sql
-- Insertar empresa en public.companies
INSERT INTO public.companies (name, slug, status)
VALUES ('Nombre del Cliente', 'slug-del-cliente', 'active');
```

### Paso 2: Registrar las credenciales Zeta

```sql
-- Insertar credenciales (NUNCA imprimir en logs)
INSERT INTO public.workspace_integrations
  (workspace_company_id, provider, status, credentials)
VALUES (
  '<UUID del companies.id del cliente>',
  'zeta',
  'active',
  '{
    "desarrolladorCodigo": "...",
    "desarrolladorClave": "...",
    "empresaCodigo": "...",
    "empresaClave": "...",
    "rolCodigo": "1"
  }'::jsonb
);
```

O con el script (para el workspace actual):
```bash
node --env-file=.env.local scripts/seed-zeta-integration-current-workspace.mjs
```

### Paso 3: Crear usuario de negocio

```sql
-- Crear usuario en app_users (email debe coincidir con Supabase Auth)
INSERT INTO public.app_users (company_id, full_name, email, role)
VALUES ('<UUID del workspace>', 'Nombre del usuario', 'email@cliente.com', 'owner');
```

### Paso 4: Verificar que el cron lo procesa

El cron `zeta-sync-saldos` ya itera todos los workspaces con `status='active'`.
No se requiere cambio en código ni re-deploy.

Verificar:
```sql
SELECT workspace_company_id, pipeline_name, status, started_at
FROM zeta_pipeline_runs
WHERE started_at > now() - interval '24 hours'
ORDER BY started_at DESC;
```

## Variables de entorno necesarias

### Siempre obligatorias (servidor)

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (server-side only, NUNCA cliente) |
| `CRON_SECRET` | Bearer token para autenticar Vercel Cron |
| `WORKSPACE_COMPANY_ID` | UUID del workspace activo (para scripts manuales) |

### Credenciales Zeta (solo si NO se usan workspace_integrations)

| Variable | Descripción |
|----------|-------------|
| `ZETA_EMPRESA_CODIGO` | Código de empresa en Zeta |
| `ZETA_EMPRESA_CLAVE` | Clave de empresa en Zeta |
| `ZETA_DESARROLLADOR_CODIGO` | Código de desarrollador |
| `ZETA_DESARROLLADOR_CLAVE` | Clave de desarrollador |
| `ZETA_ROL_CODIGO` | Rol activo (default: 1) |

### Alertas (opcionales)

| Variable | Descripción |
|----------|-------------|
| `SLACK_WEBHOOK_URL` | Webhook para alertas Slack |
| `DISCORD_WEBHOOK_URL` | Webhook para alertas Discord |
| `CRON_ALERT_WEBHOOK_URL` | Webhook genérico POST JSON |

## Pendiente

- [ ] **Encriptación de `credentials`** en `workspace_integrations`: migrar a Supabase Vault
  o pgcrypto con `WORKSPACE_INTEGRATION_ENCRYPTION_KEY`.
- [ ] **Wiring de `loadZetaServerConfigForWorkspace`** en pipelines individuales:
  `runZetaSaldosPendientesPipeline`, `syncZetaCustomerVouchers`, etc. deben recibir
  `workspaceCompanyId` y pasarlo a la función de config. Actualmente todos usan
  `loadZetaServerConfig()` (env vars).
- [ ] **auth_user_id cobertura total**: después de SEC-03, verificar que todos los
  `app_users` tengan `auth_user_id` y eliminar el fallback email de
  `copilot_current_workspace_company_id()`.
