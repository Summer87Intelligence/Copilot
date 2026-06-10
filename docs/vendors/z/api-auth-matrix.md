# Copilot — Matriz de auth `/api/zeta/*`

Actualizado: hardening FASE 1 (P0-001, P1-011).

## Regla general

Toda ruta bajo `/api/zeta/*` exige **una** de estas credenciales en el edge (middleware):

1. Cookie `copilot_session` válida (formato UUID), **o**
2. Header `Authorization: Bearer <CRON_SECRET>` (solo rutas cron explícitas)

Acceso anónimo → **401 JSON** (`UNAUTHENTICATED`).

Los handlers aplican auth adicional según la categoría.

Implementación: `lib/integrations/zeta/zeta-api-auth.ts` + `middleware.ts`.

---

## Categorías

| Categoría | Guard handler | Rol / credencial | Rutas |
|-----------|---------------|------------------|-------|
| **Diagnóstico** | `requireZetaSuperAdminAuth` | Superadmin + sesión | `test-connection`, `test-clients`, `test-clients-mapped`, `test-clients-import-preview`, `clients` |
| **Sync manual** | `requireZetaCopilotAuth` | Usuario Copilot autenticado (tenant desde `app_users`) | `sync-*`, `import-*`, `resync` |
| **Cron operador** | `requireZetaCronAuth` | `Bearer CRON_SECRET` | `sync-installments-backfill` |
| **Prohibido** | — | Sin auth pública | Ninguna ruta debe quedar sin guard |

---

## Detalle por ruta

### Diagnóstico (superadmin)

- `GET /api/zeta/test-connection`
- `GET /api/zeta/test-clients`
- `GET /api/zeta/test-clients-mapped`
- `GET /api/zeta/test-clients-import-preview`
- `GET /api/zeta/clients`

Usuario autenticado no superadmin → **403** (`FORBIDDEN`).

### Sync manual (tenant)

- `POST /api/zeta/sync-customer-vouchers`
- `POST /api/zeta/sync-collection-receipts`
- `POST /api/zeta/sync-vendor-payments`
- `POST /api/zeta/sync-saldos-all-clients`
- `POST /api/zeta/sync-contacts`
- `POST /api/zeta/sync-commercial-data-client`
- `POST /api/zeta/import-contacts-initial`
- `POST /api/zeta/import-companies-initial`
- `POST /api/zeta/import-customer-vouchers-history`
- `POST /api/zeta/resync`

### Cron (CRON_SECRET)

- `POST /api/zeta/sync-installments-backfill`

Sin secret o Bearer incorrecto → **401** (`UNAUTHORIZED`).

---

## Scripts y operaciones

- Scripts locales que usen Supabase: **solo** variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Nunca commitear claves.
- Invocar backfill de cuotas: `Authorization: Bearer $CRON_SECRET` contra `/api/zeta/sync-installments-backfill`.

---

## Checklist al agregar ruta nueva

1. Clasificar: diagnóstico / sync manual / cron.
2. Usar el helper correspondiente en `zeta-api-auth.ts`.
3. Confirmar que middleware bloquea anónimos.
4. Agregar test en `zeta-api-routes-auth.test.ts` o `zeta-api-auth.test.ts`.
