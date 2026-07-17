# Canonical Bank & Reconciliation Architecture (FASE E)

Última actualización: FASE E (2026-07-16).

## Decisión de fuente canónica (por evidencia)

```
Fuente canónica: public.bank_movements
Tabla legacy:    public.bank_reconciliation_movements
```

**Evidencia (tenant Summer87 `040321ff-…879986`):**

| Tabla | Filas | Operativas (≥2026-07-01) | Históricas | Conciliadas | Monedas | Rango |
|---|---|---|---|---|---|---|
| `bank_movements` | 951 | 57 | 894 | 8 | UYU+USD | 2026-01-02 … 2026-07-10 |
| `bank_reconciliation_movements` | 1 | 0 | 1 | 0 | 1 | 2026-05-13 |

`bank_movements` recibe TODAS las importaciones (Santander CSV/Excel/PDF), la
conciliación inline y el matching de ingresos. `bank_reconciliation_movements`
tiene 1 fila histórica aislada. **Riesgo de doble conteo: nulo** (la legacy no se
consume en KPIs; ver FASE-4: Tesorería lee banco por un punto de transición único
y "Banco ≠ Caja").

**Plan de transición:** legacy READ-ONLY; ninguna importación nueva escribe en
ella. Lectura histórica vía adaptador (`lib/bank/canonical/adapters`). Migración de
la única fila legacy: NO se ejecuta (requiere autorización; impacto nulo en KPIs).

## Modelo canónico (ya existente, FASE-3)

`lib/bank/canonical/`:
- `types.ts` → `CanonicalBankMovement` (importe absoluto + `direction` inflow/outflow,
  moneda obligatoria UYU/USD nunca mezcladas, `isHistorical` derivado, diagnósticos).
- `historical-policy.ts` → corte `BANK_OPERATIONAL_START_DATE = 2026-07-01` centralizado.
- `dedup.ts` → duplicados cross-source (`probable_cross_source_duplicate`).
- `snapshot.ts` → operativo vs histórico por moneda.

## Conciliación N:M auditable (FASE E — nuevo)

La conciliación inline de `bank_movements` (`matched_type`/`matched_id`) solo admite
1↔1 y no registra importe aplicado. Se agrega:

- **Tabla** `bank_movement_reconciliation_links` (migración `20260717120000`,
  **aditiva, PENDIENTE de aplicar**): relaciones N:M con `applied_amount`, `currency`,
  `direction`, `method`, `confidence`, `note`, `created_by`, `archived_at`. RLS por
  workspace, índices, unique activo por (movimiento, target). No modifica el movimiento.
- **Dominio puro** `lib/bank-movements/bank-reconciliation-links.ts`:
  - `deriveReconciliationStatus` → pending / partial / reconciled / ignored / duplicate.
  - `validateReconciliationApplication` → bloquea importe ≤ 0, cruce de monedas,
    cruce de dirección y **sobre-aplicación** (Σ aplicado ≤ importe del movimiento).
  - `remainingToApply`, `sumAppliedByMovement`.
  - `netNewMoneyFromReconciliation` ≡ 0 — **identidad anti-doble-conteo**: conciliar
    VINCULA una operación ya contabilizada; nunca crea dinero nuevo.

Relaciones soportadas: `receipt` (recibo Zeta), `planned_cash_obligation` (pago
programado), `treasury_income`, `treasury_expense`, `bank_movement` (transferencia),
`manual`, `ignored` (con motivo). Deshacer = archivar (`archived_at`), no borrar.

## Sugerencias (existente)

`lib/bank-movements/bank-movement-reconciliation.ts` ya provee un motor determinístico
(scoring importe/fecha/texto → confianza high/medium/low) para `planned_cash_obligation`.
Una sugerencia **nunca** aplica cambios sin confirmación humana. Ampliar a `receipt`/
`treasury_*` es trabajo siguiente (post-migración).

## Estado y próximos pasos (post-autorización de migración)

1. Aplicar `20260717120000` (RLS/índices verificados; sin DML/backfill).
2. Repositorio + API para crear/archivar links (schema-tolerant; degrada si la tabla falta).
3. Derivar `reconciliationStatus` del snapshot desde los links (además del inline).
4. Extender el motor de sugerencias a recibos/ingresos/egresos.
5. UI: acciones conciliación parcial/múltiple + deshacer auditable.
