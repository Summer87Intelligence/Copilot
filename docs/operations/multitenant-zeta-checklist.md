# Multitenant Zeta — checklist de cierre

Estado al cierre de EXECUTION-PHASE-001.

## Cobertura actual

| Capa | Estado | Notas |
|---|---|---|
| Tabla `workspace_integrations` | ✅ aplicada | RLS service-role only |
| `loadZetaServerConfigForWorkspace(workspaceId)` | ✅ implementada | Lookup DB → fallback env |
| Cron `zeta-sync-saldos` | ✅ wired | Llama `loadZetaServerConfigForWorkspace` por workspace en discovery |
| Seed Summer87 en `workspace_integrations` | ✅ ejecutado | Validado 2026-05-17 |
| Encriptación de `credentials` (jsonb) | ❌ pendiente | TODO documentado en SQL y aquí |

## Wiring pendiente en otros pipelines

Los siguientes call sites usan `loadZetaServerConfig()` directo (env-only) y deben
cablearse a `loadZetaServerConfigForWorkspace(workspaceId)` antes de soportar
multi-tenant Zeta con credenciales distintas:

```
lib/integrations/zeta/zeta-invoke.ts
lib/integrations/zeta/zeta-invoke-resolve-pack.ts
lib/integrations/zeta/zeta-factura-cliente.ts  (loaders auxiliares además del query principal)
scripts/audit-zeta-live-pending-vs-db.ts
scripts/batch-zeta-saldos-enero-2026.ts
scripts/reconcile-zeta-saldos-shadows-phase2-dry-run.ts
```

Crons que aún no fueron cableados (todos siguen funcionando con env para
Summer87, pero requieren cambio antes de onboarding del cliente #2 con
credenciales propias):

- `app/api/cron/zeta-sync-vouchers/route.ts`
- `app/api/cron/zeta-sync-collection-receipts/route.ts`
- `app/api/cron/zeta-sync-cuotas/route.ts`
- `app/api/cron/zeta-sync-contacts/route.ts`
- `app/api/cron/zeta-sync-vendor-payments/route.ts`
- `app/api/cron/zeta-completeness-audit/route.ts`
- `app/api/cron/zeta-integrity-check/route.ts`
- `app/api/cron/zeta-resync-worker/route.ts`
- `app/api/cron/zeta-daily-snapshot/route.ts`
- `app/api/cron/zeta-orphan-metadata-repair/route.ts`
- `app/api/cron/zeta-financial-health/route.ts`

## Aislamiento de datos (multi-tenant DB)

| Verificación | Resultado |
|---|---|
| Todas las queries proto_* filtran por `workspace_company_id` | ✅ enforced por `requireCopilot*` + filtros en aplicación |
| Service-role queries fijan tenant desde `app_users`, no del request | ✅ |
| Cron `notifications-generate-all-tenants` itera workspaces | ✅ scope por workspaceCompanyId, dedup_key por evento |
| RLS de `treasury_movement_accounting_reconciliations` | ✅ política SELECT por workspace |
| Notificaciones, payment behavior y treasury respetan workspace | ✅ |

## Para soportar Empresa B con credenciales Zeta B sin mezcla

1. Insertar row activa en `workspace_integrations`:

   ```sql
   insert into public.workspace_integrations (workspace_company_id, provider, status, credentials)
   values ('<UUID Empresa B>', 'zeta', 'active',
     jsonb_build_object(
       'desarrolladorCodigo', '...',
       'desarrolladorClave',  '...',
       'empresaCodigo',       '...',
       'empresaClave',        '...',
       'rolCodigo',           '1'
     ));
   ```

2. Cablear los call sites listados arriba a `loadZetaServerConfigForWorkspace`.
3. Confirmar que ningún `process.env.ZETA_*` se lee directamente desde código
   que itere tenants (los crons deben siempre pasar `workspaceId`).
4. Encriptar `credentials` (no incluído en esta fase).

## Riesgos remanentes

- **R-04 ZETA-ENV-GLOBAL**: hasta que se complete el wiring, los pipelines no-saldos
  seguirán usando env vars globales. Para tenants que onboardearan con las mismas
  credenciales (caso #2 con la misma cuenta de desarrollador Zeta) no hay riesgo
  funcional; para tenants con credenciales distintas, los pipelines no-saldos
  consultarán Zeta con la cuenta del primer tenant. **No exfiltración real** porque
  cada `EmpresaCodigo` controla qué datos devuelve la API; sí ineficiencia y
  resultados nulos.
- **R-05 CRED-PLAINTEXT**: credenciales sin encriptar at-rest. Mitigado por RLS
  service-role only + acceso restringido a la base.
