# Bank Historical Review — Contrato de persistencia shadow histórica

> **RETIRADO DE LA UI (BANK-SIMPLE-RECONCILIATION-RESTORE-001, 2026-07-19):** la pantalla
> independiente `/copilot/revision-bancaria` y sus APIs `/api/copilot/bank-review/*` se
> eliminaron del código; el flujo vuelve a concentrarse en el módulo **Banco**
> (`/copilot/movimientos-bancarios`). La infraestructura de DB (tablas, `suggestion_scope`,
> RPC `review/reject/note`, migraciones aplicadas, eventos y las 11+2 suggestions/13 events)
> y el motor `lib/bank/intelligence/**` **NO se borran** — quedan **inactivos**. No hubo
> rollback destructivo. Este documento describe el contrato de esa infraestructura latente.

Fase: **BANK-HISTORICAL-SHADOW-PERSIST-POLICY-001** (2026-07-19).
Estado: contrato de datos + código detrás de flag (default off). **Migración creada, NO aplicada.**

## Cortes temporales (ambos intactos)
- **Global** `MIN_FINANCIAL_DATE = 2026-01-01` (`lib/copilot-operational-period.ts`). Piso absoluto.
- **Bancario operativo** `BANK_OPERATIONAL_START_DATE = 2026-07-01` (`lib/bank/canonical/historical-policy.ts`).

Los movimientos históricos **no** se convierten en operativos. Una sugerencia histórica nunca
genera tarea, alerta de Hoy, notificación, conciliación, link, allocation ni cambio de status
del movimiento. Nunca AUTO, nunca confirm/reverse RPC.

## `suggestion_scope` (columna canónica, no JSON)
`bank_reconciliation_suggestions.suggestion_scope TEXT NOT NULL DEFAULT 'operational'`
CHECK `('operational','historical_review','matched_audit')`.

| scope | significado | persiste hoy |
|---|---|---|
| `operational` | flujo post-corte normal (comportamiento actual) | sí (flujo operativo) |
| `historical_review` | movimiento `[2026-01-01, 2026-07-01)`, audit-only, REVIEW/UNIDENTIFIED, nunca AUTO | solo tras flag explícito |
| `matched_audit` | movimiento `matched` analizado explícito | **reservado** (no se persiste) |

Se eligió columna estructurada (no boolean `is_historical`) porque el dominio tiene **tres**
ámbitos y `matched_audit` debe poder extenderse sin romper el contrato.

`scope` (qué tipo de sugerencia) es **independiente** de `status` (ciclo de vida:
`generated`, `pending_review`, `confirmed`, `rejected`, `superseded`, `expired`, `reversed`).
Una sugerencia histórica nueva nace: `suggestion_scope='historical_review'`, `status='generated'`,
`recommended_action='REVIEW'`, `historicalAudit=true`, `auditOnly=true`.

## Idempotencia por ámbito
Índice único activo reemplazado:
`brs_active_uidx (workspace, movement, engine_version)` →
`brs_active_scope_uidx (workspace, movement, engine_version, suggestion_scope) WHERE status IN ('generated','pending_review')`.

Reglas:
- misma evidencia + mismo scope → `skip` (`IDEMPOTENT_UNCHANGED`);
- cambio sustancial dentro del scope → `supersede`+create;
- una `operational` **nunca** sobrescribe una `historical_review` ni viceversa (entradas de índice
  distintas + match por scope en el runner);
- estados terminales protegidos (`PROTECTED_*`);
- una fila histórica no reactiva una `superseded`;
- una fila histórica no afecta las 2 suggestions matched históricas existentes.

En la práctica cada movimiento tiene un solo ámbito (por su fecha), así que el reemplazo del
índice no puede violar unicidad con los datos existentes.

## Consultas / aislamiento funcional
Repositorios explícitos (nunca inferir por warning/JSON/movement_date en cada consumidor):
- `listOperationalSuggestions()` → `suggestion_scope='operational'`.
- `listHistoricalReviewSuggestions()` → `suggestion_scope='historical_review'`.
- `listSuggestionsByScope(scope, …)` base.

Toda consulta operativa futura debe incluir `suggestion_scope='operational'` explícito.

## Eventos
`event_type='suggestion_created'` (sin nuevos tipos). El ámbito viaja en `metadata` canónica:
`{ suggestionScope, auditOnly, historicalAudit, maskedOnly:true, … }`. Los consumidores de
`reconciliation_events` **no** deben tratar cualquier `suggestion_created` como trabajo operativo:
deben leer `suggestionScope` (o la `suggestion_scope` de la sugerencia por `entity_id`).
Hoy no hay consumidores de estas tablas fuera de `lib/bank/intelligence/**`.

## Runner: `persistHistoricalForReview` (flag, default false)
Persistencia histórica detrás de flag explícito. Precondiciones (fallan antes de cargar/escribir):
- requiere `includeHistoricalForShadow=true` (`HISTORICAL_PERSIST_REQUIRES_INCLUDE`);
- requiere `persist=true` + `dryRun=false` (`HISTORICAL_PERSIST_REQUIRES_PERSIST`);
- requiere IDs explícitos (`HISTORICAL_SCOPE_REQUIRES_IDS`).

En una corrida `persistHistoricalForReview`: **solo** persiste `historical_review`; los movimientos
post-corte (operational) y `matched` se **omiten** (`skipped`). Escribe únicamente
`bank_reconciliation_suggestions` + `reconciliation_events`. Nunca AUTO, nunca selección
automática, nunca cron. `includeHistoricalForShadow` sin este flag sigue siendo dry-run only.

## Política SIN_EVIDENCIA (sin cambios)
UNIDENTIFIED + confidence 0 + sin client/receipt + reasons vacías → `INSUFFICIENT_EVIDENCE`,
**no** persiste, **no** evento. No se llena la tabla histórica con filas sin valor revisable.

## Rollback lógico
- Reversión de esquema: ver bloque ROLLBACK CONCEPTUAL en `20260720120000_bank_suggestion_scope.sql`
  (restaura `brs_active_uidx`, quita índices/constraint/columna). No ejecutar sin autorización.
- Reversión de datos: una sugerencia histórica se retira por `status='superseded'`/`rejected`
  (append-only en eventos); nunca se borra.

## Acciones humanas de revisión (BANK-HISTORICAL-REVIEW-ACTIONS-001)

Acciones **no financieras** sobre sugerencias. Contrato de ciclo de vida **Modelo A**:
"revisada" NO agrega un `status` nuevo — usa las columnas existentes `reviewed_at`/
`reviewed_by`. `status` permanece `generated`. "rechazada" usa `status='rejected'`.

| Acción | Ámbitos | Efecto en la suggestion | Evento |
|---|---|---|---|
| Marcar revisada | **solo** `historical_review` | `reviewed_at=now()`, `reviewed_by=actor` (status intacto) | `suggestion_reviewed` |
| Agregar nota | operational · historical_review | — (no muta la suggestion) | `suggestion_note_added` |
| Rechazar | operational · historical_review | `status='rejected'`, `rejected_reason`, `reviewed_at/by` | `suggestion_rejected` |

- **Estado derivado (UI/filtros)**: `rejected` (status) > `reviewed` (reviewed_at≠null) > `pending`.
- **Pendientes** = `status ∈ {generated,pending_review}` **y** `reviewed_at IS NULL`. Una histórica
  revisada conserva `status='generated'` pero deja de contar como pendiente.
- **Atomicidad**: cada acción es una RPC transaccional (SECURITY INVOKER, `search_path` fijo,
  service_role only): `review_bank_suggestion_v1`, `reject_bank_suggestion_v1`,
  `add_bank_suggestion_note_v1` — actualizan suggestion **y** appendean el evento en la misma
  transacción. `reconciliation_events` sigue append-only. **No** reutilizan confirm/reverse;
  **no** crean links ni allocations; **no** tocan movimientos/recibos/facturas.
- **Idempotencia**: revisar dos veces → `already_reviewed` (sin evento nuevo, sin cambiar
  timestamp); rechazar dos veces → `already_rejected`; nota con `clientToken` repetido →
  `already_recorded`. Concurrencia: `UPDATE` condicionado (`WHERE … reviewed_at IS NULL` /
  status activo) + `count=1` o `CONCURRENT_UPDATE`.
- **Scope/estado validados server-side** dentro de la RPC (nunca desde el cliente/tab).
- **RBAC**: `requireCopilotModuleWriteAccess("bank_movements")` — usuario read-only → 403;
  sin módulo → 403; workspace cruzado → 404 (sin filtrar existencia). Actor = `appUser.id` de sesión.
- **Notas**: texto `1..1000`, trim, sin cuentas/documentos completos (`maskedOnly=true`).
- **Migración** `20260721120000_bank_review_actions.sql` (aditiva): amplía `event_type` con los 3
  tipos + crea las 3 RPC + helper `bank_review_assert_actor` + índice `brs_ws_scope_reviewed_idx`.
  **NO aplicada** (requiere autorización). **Confirmar conciliación operativa queda fuera de alcance**
  (será RPC financiera en fase posterior).

## Limitaciones
- Migración **no aplicada** (requiere autorización posterior).
- El flag de persistencia histórica **no** se ejecutó en producción (solo tests con mocks).
- Las 2 suggestions matched históricas quedan `operational` por defecto; su tratamiento
  (¿reclasificar a `matched_audit`?) se decide en fase separada. No se borran/rechazan/supersedan.
- UI de revisión histórica: fuera de alcance de esta fase.
