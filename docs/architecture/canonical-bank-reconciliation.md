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

## Sugerencias (motor determinístico)

Dos motores puros, sin DB ni IA, con el mismo scoring (importe/fecha/texto → confianza
high/medium/low) y **siempre** con confirmación humana:

- `bank-movement-reconciliation.ts` (existente) — inline 1↔1 contra `planned_cash_obligation`.
- `bank-reconciliation-suggestions.ts` (FASE E) — genérico sobre un candidato normalizado
  (`ReconciliationCandidate`), reutiliza las primitivas del motor anterior y cubre
  `planned_cash_obligation`, `receipt` y (etiquetas) `treasury_income`/`treasury_expense`.
  Reglas duras: nunca cruza moneda ni dirección y el importe sugerido nunca excede el
  remanente del movimiento (`suggestedApplyAmount = min(importe candidato, remanente)`).

El loader server `bank-reconciliation-suggestions-repository.server.ts` arma los candidatos
de fuentes reales del tenant: obligaciones de la misma dirección (repo existente) y, solo
para ingresos, recibos Zeta (`proto_receipts`). Excluye targets ya vinculados activos.

## Capa server-side (FASE E — implementada)

Migración `20260717120000` **APLICADA** (RLS 4 policies, 4 índices, 2 triggers; sin DML/backfill;
`bank_movements`/legacy intactas). Sobre ella:

- `bank-reconciliation-links-repository.ts` — listar por movimiento, vista con
  aplicado/restante/estado, crear (valida con el dominio ANTES de escribir), archivar/deshacer.
  Siempre por workspace (jamás acepta `workspace_id` del cliente). Schema-tolerant (42P01 → `migrationPending`).
- API `/api/copilot/bank-movements/[id]/reconciliation-links`:
  - `GET` → vista del movimiento (aplicado/restante/estado/links).
  - `POST` → crea link; mapea INVALID_AMOUNT→400, MOVEMENT_NOT_FOUND→404,
    OVER_APPLIED/DUPLICATE/MIGRATION_PENDING→409, CROSS_CURRENCY/CROSS_DIRECTION→422.
  - `.../[linkId]` `DELETE` → archiva (auditable, no borra).
  - `.../suggestions` `GET` → sugerencias multi-entidad.
  Todos con `requireCopilotModule*` (read para GET, write para POST/DELETE): 401/403 cubiertos.

## UI (FASE E — implementada)

Sin sección paralela: la acción **"Conciliación detallada"** en cada tarjeta del panel
existente abre un drawer (`bank-movement-reconciliation-drawer.tsx`) con estado, aplicado,
restante, relaciones actuales (con **deshacer**), sugerencias (aplicar parcial/total) y
**marcar ignorado**. La conciliación inline 1↔1 previa sigue disponible.
