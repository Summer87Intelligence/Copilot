# Validación local de conciliación bancaria (FASE BANK-LOCAL-POSTGRES-VALIDATION-001)

Valida las 3 migraciones pendientes y las RPC contra un **PostgreSQL LOCAL/efímero**.
**Nunca** contra Supabase remoto (el harness rechaza `*.supabase.co` y el project ref).

## Estado en este entorno

No ejecutado aquí: **no hay Docker, `psql`, `pg_ctl` ni el driver `pg`** disponibles
(la Supabase CLI 2.108.0 está, pero `supabase start` requiere Docker). El harness,
las fixtures y los tests quedan listos para correr donde exista un Postgres local.
Ver `docs/technical/bank-reconciliation-local-validation.md`.

## Prerrequisitos (en un entorno con Postgres local)

- Docker + Supabase CLI (`supabase start`) **o** un Postgres local (`psql`).
- Driver de Node: `npm i -D pg`.

## Pasos

1. **Baseline** — dos estrategias:
   - Preferida: aplicar las migraciones históricas hasta FASE E (excluyendo las 3 nuevas
     y `integrity_snapshots`) para tener `companies`, `app_users`, `proto_*`,
     `bank_movements`, `bank_movement_reconciliation_links` y los helpers de workspace
     (`copilot_current_workspace_company_id`, `copilot_set_updated_at`,
     `copilot_treasury_row_force_workspace`).
   - Alternativa: un fixture SQL mínimo que replique exactamente esas tablas/funciones
     (sin stubs que cambien el comportamiento).
2. **Aplicar** en orden:
   ```
   psql "$LOCAL_PG_URL" -f supabase/migrations/20260719120000_bank_payer_identities_and_links.sql
   psql "$LOCAL_PG_URL" -f supabase/migrations/20260719120100_bank_reconciliation_suggestions.sql
   psql "$LOCAL_PG_URL" -f supabase/migrations/20260719120200_bank_reconciliation_confirm_rpc.sql
   ```
3. **Fixtures**: `psql "$LOCAL_PG_URL" -f scripts/bank-reconciliation-local-validation/fixtures.sql`
4. **Tests**:
   ```
   LOCAL_PG_URL=postgres://postgres:postgres@localhost:54322/postgres \
     npx vitest run lib/bank/intelligence
   ```
   Sin `LOCAL_PG_URL` local válido, el suite de integración se **omite** (queda verde).

## Batería de casos (guion)

Funcionales (§8–24): confirmación básica (mov 10.000 → recibo 10.000 → facturas
6.000+4.000), saldo sin aplicar (link 10.000 / alloc 6.000), pago parcial, varias
facturas (JSON agregado, orden irrelevante, factura repetida agrupada), N movimientos
→ 1 recibo (4.000+6.000, tercero → `OVER_APPLIED_RECEIPT`), over-application de
movimiento/recibo/factura (rollback total), moneda (`CURRENCY_MISMATCH`), workspace
(`WORKSPACE_MISMATCH`/`INVALID_ACTOR`), actor (inexistente/inactivo/otro workspace →
`INVALID_ACTOR`), estados no conciliables (egreso/reversed/ignored/suggestion
rejected/superseded/expired/de otro movimiento), idempotencia (repetición idéntica →
mismo link; conflicto → `IDEMPOTENCY_CONFLICT`), reversión (archiva, allocations
reversed, suggestion reversed, evento) y doble reversión (no-op).

Concurrencia (§25–28, dos conexiones reales): mismo movimiento (Σ ≤ importe),
mismo recibo, misma factura (existing+new recalculado tras lock), y orden inverso de
facturas (locks determinísticos por `invoice_id ASC` → sin deadlock).

## Seguridad del harness

`lib/bank/intelligence/reconciliation-local-guard.ts` rechaza URLs remotas
y solo permite `localhost`/`127.0.0.1`/host de contenedor. No incluir contraseñas,
dumps ni datos reales en este directorio.
