# Resultados — Validación local de conciliación (FASE BANK-LOCAL-POSTGRES-VALIDATION-001)

## Entorno

| Herramienta | Disponible |
|---|---|
| Docker | **NO** |
| `psql` / `pg_ctl` | **NO** |
| Supabase CLI | sí (2.108.0) — pero `supabase start` requiere Docker |
| driver Node `pg` | **NO** (`npm i -D pg` pendiente) |
| Postgres local/efímero | **NO disponible** |

**Conclusión:** en este entorno **no fue posible ejecutar** las migraciones ni las RPC
contra un Postgres real. Ejecutar contra Supabase remoto está prohibido (guard). Por lo
tanto los casos funcionales y de concurrencia **NO se ejecutaron** aquí — no se declaran
resultados empíricos. El harness queda listo para correr donde exista un Postgres local.

## Corrección realizada (por revisión de concurrencia §28)

| Problema | Archivo | Solución | Commit |
|---|---|---|---|
| El loop de locks de facturas iteraba en orden no determinístico (`GROUP BY` sin orden) → riesgo de **deadlock** entre confirmaciones concurrentes con facturas en distinto orden | `20260719120200_..._rpc.sql` | `ORDER BY 1` (invoice_id ASC) → orden de locks determinístico | (esta fase) |

Orden global de locks de la RPC: **movimiento → recibo → facturas (invoice_id ASC)** —
consistente en todas las llamadas → sin deadlock cruzado.

## Entregado (listo para ejecutar)

- `lib/bank/intelligence/reconciliation-local-guard.ts` (+ test) — guard que
  solo permite Postgres local (rechaza `*.supabase.co`, project ref, hosts con dominio).
- `lib/bank/intelligence/reconciliation-postgres.pg.test.ts` — harness que
  se **omite** salvo `LOCAL_PG_URL` local válido + driver `pg`; verifica migraciones
  aplicadas y deja el guion de la batería 8–28.
- `scripts/bank-reconciliation-local-validation/fixtures.sql` — fixtures WS A/B (UUIDs
  previsibles, sin datos reales).
- `scripts/bank-reconciliation-local-validation/README.md` — pasos, baseline, batería.

## Matriz de casos (estado)

| Caso | Esperado | Estado |
|---|---|---|
| Confirmación básica / saldo sin aplicar / parcial / N mov→1 recibo | link canónico, sumas OK | **NO EJECUTADO** (sin PG local) |
| Over-application movimiento/recibo/factura | rollback + código | **NO EJECUTADO** |
| Factura repetida en JSON | agrega y valida una vez | **NO EJECUTADO** |
| Moneda / workspace / actor / estados no conciliables | códigos claros | **NO EJECUTADO** |
| Idempotencia idéntica / conflicto | mismo link / `IDEMPOTENCY_CONFLICT` | **NO EJECUTADO** |
| Reversión / doble reversión | archiva, reversed, no-op | **NO EJECUTADO** |
| Concurrencia (mismo mov/recibo/factura, orden inverso) | serialización, sin deadlock | **NO EJECUTADO** |
| Contrato de sumas (puro) + esquema (estático) | invariantes | **EJECUTADO verde** (45 tests intelligence) |
| Guard local-only | rechaza remoto | **EJECUTADO verde** |

## Estado remoto posterior

Las migraciones bancarias `20260719120000`, `20260719120100` y `20260719120200`
fueron aplicadas en producción (`erzdifkvvailxnwdukzf`) el 2026-07-17 por una
operación externa a este harness. No deben reaplicarse, editarse ni revertirse:
cualquier corrección debe ser una migración nueva.

La limitación de este documento permanece: la batería funcional 8–24 y la
concurrencia 25–28 no se ejecutaron en este equipo por falta de PostgreSQL local.
La validación post-migración de producción fue read-only; no ejecutó RPCs ni creó
conciliaciones sobre datos reales.

## Próximo paso

Re-ejecutar esta batería en un entorno aislado con Docker (`supabase start`) o
`psql` + `npm i -D pg`. No usar producción para completar los casos pendientes.
