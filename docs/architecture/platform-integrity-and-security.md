# Centro de Integridad, Seguridad y Observabilidad (FASE F)

Última actualización: FASE F (2026-07-16). Estado: motor + API + panel + migración
snapshots (NO aplicada). Tenant de referencia: Summer87 (`erzdifkvvailxnwdukzf`).

## Objetivo

Un **panel de salud** único que detecta inconsistencias de toda la plataforma
antes de que impacten a Dirección, y consolida seguridad y observabilidad. Consume
**fuentes canónicas** (no fórmulas paralelas) y **nunca borra datos**.

## Arquitectura

```
lib/integrity/
  integrity-types.ts            -> tipos puros (severidad, categoría, finding, report, observabilidad)
  integrity-rules.ts            -> registro de reglas PURAS por categoría (deterministas, sin DB)
  integrity-report.ts           -> agregador: corre reglas + mergea hallazgos externos -> reporte ejecutivo
  integrity-link-map.ts         -> mapea filas de reconciliation_links a dominio (para reglas de banco)
  integrity-source.server.ts    -> loader canónico: zeta_integrity_violations + banco + observabilidad
app/api/copilot/integrity/route.ts   -> GET reporte (RBAC módulo `admin`, workspace-scoped)
app/copilot/integridad/              -> panel ejecutivo (cards + tabla filtrable + detalle con evidencia)
```

El motor es **on-demand** (no requiere tabla). La migración `20260718120000`
(snapshots) es **opcional** y queda **sin aplicar**.

## Matriz — Componente / Fuente / Riesgo / Estado / Acción

| Componente | Fuente canónica | Riesgo principal | Estado | Acción |
|---|---|---|---|---|
| Ventas | issued-sale-universe | moneda/void/duplicado | Canónico (FASE 9E/D) | reglas `documents-*`, `sales-vs-*` |
| Finanzas | financial-reconciliation | divergencia con Ventas | Canónico | regla `sales-vs-finance-divergence` |
| Reportes | net-sales-report | filtro moneda/void | Canónico (FASE D) | regla `sales-vs-reports-divergence` |
| Dashboard | dashboard adapter | divergencia con Ventas | Canónico | regla `dashboard-vs-sales-divergence` |
| Cobranza | operating-aging | sobre-aplicación/saldo | Canónico | reglas `receipt-*`, `negative-*` |
| Banco | bank_movements + N:M links | dup/doble-conteo/cruce | Canónico (FASE E) | reglas `bank-*` |
| Tesorería | planned_cash_obligation | (afectada, no fuente) | Intacta | — |
| Clientes/360 | proto_companies | sin nombre/duplicado | — | reglas `client-*` |
| Comerciales | asignaciones | doble atribución | Canónico (FASE 9) | reglas `*-salespeople`, `*-vigencias` |
| Integridad Zeta | zeta_integrity_violations | violaciones abiertas | 115 abiertas (tenant) | mergeadas como findings `zeta:*` |
| Sistema | zeta_*_runs / pg_class | cron/sync/RLS/migraciones | Observado | reglas `cron-*`, `sync-*`, `tables-without-rls`, `pending-migrations` |

## Matriz — Regla / Consumidores / Nivel / Existe / Falta

| Regla | Módulos afectados | Nivel | Existe | Falta (runtime) |
|---|---|---|---|---|
| documents-without-currency | ventas/finanzas/reportes | critical | sí | wiring loader documentos |
| documents-invalid-currency | ventas/finanzas | warning | sí | wiring loader documentos |
| documents-without-client/date | ventas/reportes | warning | sí | wiring loader documentos |
| documents-before-2026-in-kpi | ventas/reportes/dashboard | warning | sí | wiring loader documentos |
| voided-documents-in-kpi | ventas/finanzas/… | critical | sí | wiring loader documentos |
| credit-note-without-reference | ventas/finanzas | warning | sí | wiring loader documentos |
| duplicate-documents | ventas/finanzas/reportes | critical | sí | wiring loader documentos |
| sales-vs-reports/finance/dashboard | ventas/… | critical/warn | sí | wiring netByCurrency |
| receipt-application-over-balance | cobranza/cartera | critical | sí | wiring loader cobranza |
| negative-outstanding/aging | cobranza/cartera | warning | sí | wiring loader cobranza |
| bank-without-currency | banco | warning | sí | **runtime activo** |
| bank-duplicate-fingerprint | banco/tesoreria | critical | sí | **runtime activo** |
| bank-reconciliation-over-applied | banco | critical | sí | **runtime activo** |
| bank-cross-currency-link | banco | critical | sí | **runtime activo** |
| client-multiple-active-salespeople | comerciales/ventas | critical | sí | wiring loader comerciales |
| salesperson-overlapping-vigencias | comerciales | warning | sí | wiring loader comerciales |
| client-without-name/duplicate/no-record | clientes/360 | warning | sí | wiring loader clientes |
| cron-stalled | sistema | critical | sí | **runtime activo** |
| snapshot-stale | sistema/dashboard | warning | sí | (snapshot age pendiente) |
| sync-zeta-failed | sistema/ventas/finanzas | critical | sí | **runtime activo** |
| tables-without-rls | sistema | critical | sí | auditoría read-only (no runtime) |
| pending-migrations | sistema | warning | sí | auditoría read-only (no runtime) |
| zeta:* (violaciones abiertas) | ventas/finanzas/sistema | var. | sí | **runtime activo** |

> "Runtime activo" = el loader `integrity-source.server.ts` ya alimenta la regla.
> "wiring loader X" = la regla PURA existe y está testeada; conectar su fuente
> canónica en el loader es trabajo incremental (no reescribe fórmulas).

## Seguridad — auditoría de APIs

- La ruta nueva `/api/copilot/integrity` usa `requireCopilotModuleAccess(request,'admin')`
  (RBAC read; superadmin bypass) y **no acepta `workspace_id` del cliente** (no recibe body).
  El workspace sale de `auth.ctx.tenantCompanyId`.
- Convención del repo para escritura: los schemas rechazan `workspace_id` con `z.never()`
  (`rejectWorkspaceId`), y el trigger `copilot_treasury_row_force_workspace` fuerza el
  workspace del servidor. El guard `copilot-api-rbac-coverage.test.ts` exige que toda ruta
  bajo `app/api/copilot` referencie `requireCopilotModule*`.
- Códigos: 401 (sin sesión), 403 (sin permiso/read-only), 404, 409/422 (validaciones
  de conciliación), 500 (error controlado).

## RLS — auditoría (read-only, tenant Summer87)

| Métrica | Valor |
|---|---|
| Tablas `public` | 88 |
| Con RLS habilitado | **88 (100%)** |
| Sin RLS | **0** |
| RLS habilitado sin policies (fail-closed) | 5 |

Tablas con RLS pero **0 policies** (deny-all para authenticated → NO hay fuga, pero
revisar si deberían tener policy explícita): `_backup_invoices_pre_resync_2026`,
`auth_login_events`, `contacts`, `financial_period_validations`, `proto_raw_imports`.
No es una vulnerabilidad de aislamiento (fail-closed); es backlog de revisión.

Advisors pre-existentes (backlog de seguridad, NO regresiones de FASE F): 2 ERROR
`security_definer_view` (invoice_financials/copilot_companies), WARNs `search_path`
en funciones, leaked-password protection off. Ver FASE 9E/I.

## Observabilidad

El reporte incluye: último cron (`zeta_pipeline_runs`), último sync y estado
(`zeta_sync_runs`), jobs pendientes (`zeta_resync_jobs`), horas desde cron/sync.
Snapshot de referencia (2026-07-17): sync OK 00:40Z, pipeline 01:20Z, 0 jobs
pendientes, **115 violaciones Zeta abiertas** (mergeadas al panel).

## Autorreparación

Solo acciones **seguras** y explícitas (nunca automáticas sobre datos reales):
recalcular snapshot, reintentar sync, reindexar/reconstruir agregados. Marcadas por
`autoRepairable` en cada finding. Nunca: borrar, ni modificar ventas/cobros/banco/clientes.

## Migración (NO aplicada)

`supabase/migrations/20260718120000_integrity_snapshots.sql` — tabla
`copilot_integrity_snapshots` (aditiva, RLS, índice, triggers, sin DML/backfill).
Estado: **MIGRATION_PENDING_AUTHORIZATION**. El motor funciona sin ella.

## Hoy

FASE F **no toca Hoy**: sin cambios de diseño, cards, navegación ni contenido visible.
El único cambio de navegación es la entrada "Integridad" (grupo Configuración, gated `admin`).
