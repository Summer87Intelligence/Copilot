# Rollout — Conciliación Bancaria Inteligente (FASE DOMAIN-IA-BANK-001)

Estrategia por etapas, priorizando seguridad sobre automatización prematura. Cada
etapa requiere autorización explícita del usuario antes de avanzar.

## Etapa 0 — Auditoría (COMPLETA)

- Fuente canónica: `bank_movements`. Legacy read-only. N:M FASE E reutilizable.
- Señales de pagador identificadas (`bank_reference`/`account_label`/`description`/`metadata`).
- Motor puro + huella + normalizador implementados y testeados (25 tests).
- Migraciones aditivas creadas, **NO aplicadas**.

## Estado de migraciones

Las migraciones `20260719120000`, `20260719120100` y `20260719120200` están
**aplicadas en producción** (`erzdifkvvailxnwdukzf`) desde 2026-07-17. Son
inmutables: no reaplicar, editar ni revertir. Cualquier corrección debe entregarse
mediante una migración nueva.

## Etapa 1 — Shadow server (COMPLETA en código; corrección de ambigüedad aplicada)

Implementado en `lib/bank/intelligence/server/` (ver
`docs/architecture/bank-shadow-server.md`):

- Lectura workspace-scoped de movimientos, recibos, clientes, facturas, pagadores y sugerencias.
- Ejecución del motor determinístico existente → `ShadowProposal` explicable.
- **BANK-SHADOW-CORRECTION-001:** empate de recibos exactos → `proposedReceiptId=null` +
  `MULTIPLE_STRONG_CANDIDATES`; colisión inter-movimiento → `RECEIPT_CANDIDATE_COLLISION`.
  Sin `.find()` arbitrario; desempate solo por señales materiales (pagador confirmado / fecha).
- **dry-run por defecto** (sin persistencia).
- **shadow persist** opcional (`dryRun=false` && `persist=true`) solo en
  `bank_reconciliation_suggestions` + `reconciliation_events`.
- Runner con alcance obligatorio (`movementId` | `movementIds` | `limit` ≤25).
  No recorre los ~951 movimientos automáticamente.
- Guardas + tests: sin RPC financiera, sin links/allocations, sin mutar tablas financieras.

### Política de elegibilidad (BANK-SHADOW-MATCHED-POLICY-001, 2026-07-17)

Fuente única `isShadowEligibleMovement()` aplicada de forma idéntica en todos los caminos.
Por defecto excluye: `matched`, `ignored`, `reversed`, egreso, link canónico activo,
fuera de workspace y anterior al corte operativo (`2026-07-01`). Los `matched` solo pueden
incluirse con `includeMatchedForAudit=true` (server-side, default false), y quedan
**audit-only**: `auditOnly=true`, warning `MATCHED_MOVEMENT_AUDIT`, nunca AUTO, **no
persisten** y no modifican nada (dry-run únicamente en esta fase).

**Dos sugerencias `matched` históricas:** la primera persistencia
(BANK-CONTROLLED-SHADOW-PERSIST-REVIEW-001) creó 2 sugerencias `generated` para
movimientos ya `matched` (`49bd2ddc…`, `1c611fcd…`) **antes** de esta política. Son datos
legítimos previos, no un error; se conservan para revisión manual y **no** se eliminan,
rechazan ni supersedan en esta fase.

### Modo historical shadow (BANK-SHADOW-HISTORICAL-SCOPE-001, 2026-07-19)

Dos cortes distintos, ambos intactos: **global** `MIN_FINANCIAL_DATE = 2026-01-01` (piso
financiero del sistema) y **bancario** `BANK_OPERATIONAL_START_DATE = 2026-07-01` (corte
operativo del flujo bancario). El flujo operativo sigue excluyendo `< 2026-07-01`
(`MOVEMENT_BEFORE_CUTOFF`).

Nuevo `includeHistoricalForShadow=true` (server-side, default false): permite analizar
movimientos `[2026-01-01, 2026-07-01)` como **historical-audit** — `historicalAudit=true`,
`auditOnly=true`, warning `HISTORICAL_SHADOW_AUDIT`, nunca AUTO. Es **dry-run only**
(`persist=true` → `HISTORICAL_PERSIST_NOT_ALLOWED`) y **exige IDs explícitos**
(sin IDs → `HISTORICAL_SCOPE_REQUIRES_IDS`). `< 2026-01-01` siempre excluido
(`MOVEMENT_BEFORE_GLOBAL_FLOOR`). Los 424 pending históricos **no** se procesan
automáticamente: solo por IDs explícitos, uno a uno / lote pequeño, sin cron ni escaneo.

Los tres flujos (operativo, matched-audit, historical-audit) se mantienen separados; no se
reutilizan flags ambiguos.

### Contrato de persistencia histórica (BANK-HISTORICAL-SHADOW-PERSIST-POLICY-001, 2026-07-19)

Columna canónica `suggestion_scope` (`operational` | `historical_review` | `matched_audit`)
separa estructuralmente los ámbitos (antes vivía solo en `warnings` JSON). Idempotencia por
ámbito (`brs_active_scope_uidx`), consultas explícitas `listOperationalSuggestions()` /
`listHistoricalReviewSuggestions()`, eventos con `metadata.suggestionScope`. Persistencia
histórica detrás de `persistHistoricalForReview` (flag server-side, default false; requiere
`includeHistoricalForShadow=true` + `persist=true` + IDs; solo persiste `historical_review`;
nunca AUTO/post-corte/matched/cron). SIN_EVIDENCIA sigue sin persistir.
**Migración `20260720120000_bank_suggestion_scope.sql` creada, NO aplicada** (requiere
autorización). Las 5 sugerencias existentes quedan `operational`; las 2 matched históricas
no se reclasifican en esta fase. Detalle: `docs/architecture/bank-historical-review-contract.md`.

### Acciones de revisión humana (BANK-HISTORICAL-REVIEW-ACTIONS-001, 2026-07-19)

Acciones no financieras sobre sugerencias: marcar revisada (solo historical), agregar nota,
rechazar (op/hist). Ciclo de vida **Modelo A**: revisada = `reviewed_at`/`reviewed_by` (sin
status nuevo); rechazada = `status='rejected'`. Atomicidad vía 3 RPC transaccionales
(SECURITY INVOKER, service_role only) que actualizan la suggestion y appendean el evento
(`suggestion_reviewed`/`suggestion_note_added`/`suggestion_rejected`). Idempotencia
(already_reviewed/rejected/recorded) + concurrencia (UPDATE condicionado). RBAC de escritura
`bank_movements`. **Confirmar conciliación operativa fuera de alcance** (RPC financiera futura).
**Migración `20260721120000_bank_review_actions.sql` creada, NO aplicada** (autorización pendiente).
Contadores "Pendientes" = activo + `reviewed_at IS NULL`. Detalle: `docs/architecture/bank-historical-review-contract.md`.

### Pendiente de autorización operativa

- Aplicar `20260720120000_bank_suggestion_scope.sql` en producción (preflight + autorización). **[APLICADA 2026-07-19]**
- Aplicar `20260721120000_bank_review_actions.sql` (event types + 3 RPC de revisión) — preflight + autorización.
- Persistencia histórica controlada por IDs (tras aplicar la migración) con `persistHistoricalForReview`.
- Shadow persist en lote pequeño (movimientos **operativos** elegibles; `matched`/histórico separados).
- Medir precisión por rango de confianza / % sin identificar / conflictos.

### Deuda conocida

- Concurrencia real multi-conexión sobre el unique index activo: no cerrada.
- Shadow no materializa `bank_payer_identities` (solo lectura).
- Colisión solo se detecta **dentro del mismo batch** del runner (no cross-run global).
## Etapa 2 — Revisión manual asistida

- UI Banco "Para revisar": el usuario confirma/cambia/distribuye/ignora.
- Cada acción emite `reconciliation_events` y ajusta `client_payer_links` (aprendizaje).
- Confirmaciones aumentan la confianza del pagador para futuros pagos.

## Etapa 3 — Confirmación asistida (semi-auto)

- Candidatos ≥ 95 sin bloqueos: precargados para confirmación de 1 clic (no automáticos).
- El usuario sigue siendo el que confirma; reversible siempre.
- Usa `confirm_bank_reconciliation_v1` (fuera del shadow).

## Etapa 4 — Automatización limitada (bajo métricas)

- Solo tras acumular métricas de precisión aceptable en un rango de confianza.
- Auto-conciliar únicamente: pagador confirmado + recibo exacto + moneda + fecha próxima,
  sin ninguno de los bloqueos de seguridad. Con evento y posibilidad de reversión.

## Etapa 5 — Automatización completa (futuro, condicionada)

- Solo si las métricas de las etapas previas lo justifican. Siempre auditable y reversible.

## Autorizaciones requeridas (explícitas)

| Acción | Requiere |
|---|---|
| Corregir esquema aplicado | autorización + migración nueva; nunca editar/reaplicar las tres aplicadas |
| Dry-run controlado contra datos reales | autorización (solo lectura) |
| Shadow persist en lote pequeño | autorización separada |
| Habilitar confirmación asistida (UI + RPC) | autorización |
| Rollout de auto-conciliación | autorización + métricas |
| Push / deploy | autorización |

## Invariante de seguridad permanente

Nunca auto-conciliar con: moneda distinta, candidatos empatados, cuenta multi-cliente
sin señal extra, diferencia de importe, duplicado, recibo ya conciliado, factura pagada,
sobre-aplicación, cruce de workspace, fecha fuera de rango, revertido, o ingreso no
comercial. La conciliación confirmada aparece en Banco, Cobranza y Cliente 360 leyendo
**la misma relación canónica** (sin duplicar entidades).
