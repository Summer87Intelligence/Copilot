# Banco — Motor canónico de conciliación (Motor D)

**FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 (2026-07-20)** — decisión de arquitectura autorizada: **Motor D es el único motor canónico de conciliación bancaria de ingresos.** No se crea un segundo motor. No se mantienen rutas paralelas de escritura financiera.

**FASE BANK-CANONICAL-CONFIRM-CONTRACT-CORRECTION-001 (2026-07-20, continuación)** — auditoría exacta del hallazgo bloqueante `status='reversed'` y corrección del contrato de `confirm_bank_reconciliation_v1` (ver secciones "Auditoría exacta del estado reversed" y "Máquina de estados canónica" más abajo). Migración `20260722130000_bank_reconciliation_confirm_rpc_v2.sql` creada.

**FASE BANK-CANONICAL-CONFIRM-RPC-V2-MIGRATION-APPLY-001 (2026-07-22)** — migración `20260722130000_bank_reconciliation_confirm_rpc_v2.sql` **APLICADA en producción**, verificada con QA transaccional rollback-tested (8 escenarios). `confirm_bank_reconciliation_v1` en producción ya exige `suggestion_scope='operational'` para confirmar por sugerencia.

**FASE BANK-CANONICAL-CONFIRM-UI-001 (2026-07-22, continuación)** — primera UI de confirmación/rechazo real sobre el motor canónico (ver sección "Cambios de esta fase (BANK-CANONICAL-CONFIRM-UI-001)" más abajo). Confirmar y Rechazar ya son funcionales en código; Revertir sigue fuera de alcance (Fase futura BANK-CANONICAL-REVERSE-UI-001); aprendizaje de pagador sigue sin implementar.

**FASE BANK-CANONICAL-CONFIRM-CONTROLLED-QA-001 (2026-07-20, despliegue)** — push a producción (commit `83fa402`), deployment Vercel `READY`, QA controlada end-to-end con sesión real. Ningún caso pendiente alcanzó confianza Alta (0 de 5), así que no se ejecutó ninguna confirmación real — veredicto `GO_FOR_BANK_CANONICAL_CONFIRM_QA_REPEAT_WITH_SAFE_CASE`. La QA sí confirmó en producción: tabs/orden correctos, bandeja Conciliación 100% funcional (drawer, contadores, confianza Baja sin auto-confirmar), enlace "Revisar conciliación" desde Ingresos funcionando.

**FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001 (2026-07-20, continuación)** — decisión funcional definitiva: **la pestaña Ingresos es la única bandeja operativa diaria.** La pestaña Conciliación independiente (de la fase anterior) queda retirada de la navegación visible; su funcionalidad se absorbe dentro de Ingresos. Ver sección "Cambios de esta fase (BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001)" más abajo. Sin cambios de scoring/thresholds, sin aprendizaje de pagador, sin reversión, sin nuevas migraciones — solo unificación de experiencia sobre el mismo Motor D.

## Auditoría exacta del estado "reversed" (hallazgo bloqueante, resuelto)

**Pregunta central:** ¿qué tabla/columna recibe o debería recibir `'reversed'`?

| # | Pregunta | Respuesta con evidencia |
|---|---|---|
| A | ¿Qué entidad representa una sugerencia revertida? | `bank_reconciliation_suggestions` con `status='reversed'` + `confirmed_link_id=NULL`. Ya implementado correctamente en `reverse_bank_reconciliation_v1` (v1, sin cambios). `'reversed'` **sí** es un valor válido de su CHECK (`generated,pending_review,confirmed,rejected,superseded,expired,reversed`) — consistente con `ShadowSuggestionStatus`/`SHADOW_TERMINAL_STATUSES` en TypeScript y con `shadow-persistence.ts`. |
| B | ¿Qué entidad representa un link revertido? | `bank_movement_reconciliation_links` con `archived_at IS NOT NULL`. Esta tabla **no tiene columna `status`** — usa el patrón archive-not-delete (auditable, nunca borra). Ya correcto, sin cambios. |
| C | ¿Qué debe hacer la reversión? | Ya implementado correctamente en `reverse_bank_reconciliation_v1`: archiva el link (no borra), marca `payment_allocations.status='reversed'` (valor válido en su CHECK: `active,reversed`), marca la sugerencia confirmada como `reversed` + limpia `confirmed_link_id`, crea evento `reconciliation_reversed`. Nada de esto cambia en esta fase. |
| D | ¿Qué columna intenta recibir `'reversed'` hoy, realmente? | **Ninguna, en la práctica.** `confirm_bank_reconciliation_v1` (v1) solo **compara** `v_mov.status IN ('ignored','reversed')` — nunca escribe ese valor. `reverse_bank_reconciliation_v1` no toca `bank_movements` en absoluto (nunca la referencia). Ningún writer en todo el codebase escribe `bank_movements.status='reversed'`. |
| E | ¿`'reversed'` ya existe en otro CHECK? | Sí, y correctamente: `bank_reconciliation_suggestions.status` y `payment_allocations.status` — ambos ya lo admiten y lo usan activamente sin problema. |
| F | ¿La RPC falla hoy en producción? | **No.** Comparar una columna `TEXT` contra una lista `IN (...)` con un literal que el CHECK no permite NO es un error de Postgres — simplemente esa rama del `IN` nunca puede ser verdadera (`bank_movements.status` físicamente no puede valer `'reversed'`). Es una comparación siempre-falsa, no un fallo de ejecución. |
| G | ¿Hay datos existentes con `bank_movements.status='reversed'`? | Imposible que existan (el CHECK lo impide). No se auditó en vivo si existen sugerencias con `status='reversed'` en producción — fuera del alcance autorizado esta fase (no se ejecutó `execute_sql`). |
| H | ¿Es de esquema o de lógica RPC? | **De lógica RPC.** El esquema es internamente coherente: el CHECK de `bank_movements.status` (`pending,suggested,matched,ignored,needs_review`) coincide exactamente con el tipo TypeScript `BankMovementStatus` (mismos 5 valores, en `lib/bank-movements/bank-movements-types.ts`). La única pista en sentido contrario es `lib/bank/intelligence/server/eligibility.ts`, que compara `movement.status === "reversed"` con `skipReason: "MOVEMENT_REVERSED"` — pero su tipo de entrada (`ShadowEligibilityMovement.status: string`) es deliberadamente laxo (no importa `BankMovementStatus`), un patrón defensivo estándar para tratar con seguridad cualquier valor futuro/inesperado, no evidencia de que el esquema deba ampliarse hoy. Tiene su propio test (`eligibility.test.ts`) que pasa igual sin tocar el esquema real. **No se amplía el CHECK de `bank_movements.status`** — sería la solución incorrecta (el enunciado de la fase lo advertía explícitamente).

**Corrección aplicada** (migración `20260722130000_bank_reconciliation_confirm_rpc_v2.sql`, ver sección RPC más abajo): se retira la rama `'reversed'` de la comparación en `confirm_bank_reconciliation_v1` — cambio de **cero comportamiento real** (la rama nunca coincidía), solo elimina una referencia incoherente con el esquema real.

## Diagrama A/B/C/D

```
Motor A — Tesorería (live, mantenido, reubicado)
  bank_movements.status/matched_type/matched_id  ←  reconcileBankMovementWithObligation()
  Empareja contra planned_cash_obligations (Tesorería), NUNCA contra clientes/recibos/facturas.
  Ya NO se llama "Conciliar"; ya NO vive en la pestaña Conciliación.

Motor B — Ingresos / identificación de pagador (live, a consolidar en Fase 3)
  client_bank_aliases / bank_income_matches  ←  bank-income-matching-service.server.ts
  Solo identifica cliente. Duplica el CONCEPTO de bank_payer_identities/client_payer_links
  con tablas propias — pendiente de mapeo/consolidación (no se migra esta fase).

Motor C — "Conciliación detallada" (legacy, RETIRADO como escritor esta fase)
  bank_movement_reconciliation_links  ←  createReconciliationLink() / archiveReconciliationLink()
  Repositorio propio: sin payment_allocations, sin reconciliation_events, sin locks
  transaccionales. POST/DELETE ahora devuelven 410 server-side. GET se conserva (lectura).

Motor D — CANÓNICO (construido, ahora con lectura conectada a UI)
  bank_reconciliation_suggestions (scope=operational)
  bank_payer_identities + client_payer_links (aprendizaje)
  confirm_bank_reconciliation_v1 / reverse_bank_reconciliation_v1 (RPC, service_role-only)
  → único camino autorizado para confirmar/revertir. UI de confirmación real: Fase 2.
```

## Fuente de verdad (una tabla por concepto, nunca duplicado)

| Concepto | Tabla / función |
|---|---|
| Sugerencia | `bank_reconciliation_suggestions` (`suggestion_scope='operational'` para el flujo diario) |
| Confirmación | `confirm_bank_reconciliation_v1` (única ruta autorizada) |
| Link confirmado | `bank_movement_reconciliation_links` |
| Asignación financiera a factura | `payment_allocations` (vía `confirm_bank_reconciliation_v1`, nunca directo) |
| Eventos | `reconciliation_events` (append-only) |
| Aprendizaje de pagador | `bank_payer_identities` + `client_payer_links` |
| Movimiento bancario | `bank_movements` |
| Recibos/facturas | `proto_receipts` / `proto_invoices` (tablas canónicas de Zeta, sin duplicar) |

## Matriz de writers (auditoría exhaustiva, 2026-07-20)

| Writer | Archivo/RPC | Tabla | Acción | Motor | Estado futuro |
|---|---|---|---|---|---|
| `reconcileBankMovementWithObligation()` | `lib/bank-movements/bank-movement-reconciliation-service.server.ts` | `bank_movements` (status/matched_type/matched_id/metadata) | UPDATE directo | A · Tesorería | **treasury-only** — mantenido, renombrado ("Vincular con pago programado"), reubicado dentro de Movimientos (sección secundaria colapsada) |
| `changeStatus()` (acción de fila genérica) | `app/api/copilot/bank-movements/[id]/route.ts` (PATCH) | `bank_movements` (status) | UPDATE directo, sin target | ninguno (utilidad manual) | **read-only respecto a evidencia** — no reclama vínculo con cliente/recibo/factura, solo flag manual; se mantiene sin cambios |
| `createReconciliationLink()` | `lib/bank-movements/bank-reconciliation-links-repository.ts` | `bank_movement_reconciliation_links` | INSERT directo (repositorio propio, sin locks, sin `payment_allocations`, sin `reconciliation_events`) | C · legacy | **forbidden** — retirado esta fase. Ruta POST devuelve `410 LEGACY_WRITE_RETIRED` server-side (no solo oculto en UI) |
| `archiveReconciliationLink()` | `lib/bank-movements/bank-reconciliation-links-repository.ts` | `bank_movement_reconciliation_links` (archived_at) | UPDATE directo | C · legacy | **forbidden** — retirado esta fase. Ruta DELETE devuelve `410 LEGACY_WRITE_RETIRED` server-side |
| income-match handler | `lib/bank-movements/bank-income-matching-service.server.ts` + `client-bank-aliases.ts` | `bank_income_matches`, `client_bank_aliases` | INSERT | B · Ingresos | **legacy-to-migrate** — duplica el concepto de `bank_payer_identities`/`client_payer_links` con tablas propias. Consolidación es Fase 3 (BANK-PAYER-LEARNING), no esta fase |
| `insertShadowSuggestion` / `updateShadowSuggestion` / `supersedeShadowSuggestion` | `lib/bank/intelligence/server/repositories/index.ts` | `bank_reconciliation_suggestions` | INSERT/UPDATE | D · generación (shadow) | **canonical** — permitido; guardado explícitamente por `assertShadowWriteAllowed()` (`lib/bank/intelligence/server/guards.ts`), que además prohíbe a esta capa tocar tablas financieras o llamar las RPC |
| `insertSuggestionEvent` | `lib/bank/intelligence/server/repositories/index.ts` | `reconciliation_events` | INSERT | D · generación (shadow) | **canonical** |
| `confirm_bank_reconciliation_v1` (v2, aplicada) | `supabase/migrations/20260722130000_bank_reconciliation_confirm_rpc_v2.sql` | `bank_movement_reconciliation_links`, `payment_allocations`, `reconciliation_events`, `bank_reconciliation_suggestions` (update) | INSERT/UPDATE transaccional, `service_role` only | D · confirmación | **canonical** — única ruta autorizada. **UI real desde BANK-CANONICAL-CONFIRM-UI-001** vía `confirmCanonicalSuggestion()` (`lib/bank/canonical/confirm-canonical-suggestion.server.ts`) → `POST /api/copilot/bank-reconciliation/[suggestionId]/confirm` |
| `reverse_bank_reconciliation_v1` | `supabase/migrations/20260719120200_bank_reconciliation_confirm_rpc.sql` | `bank_movement_reconciliation_links`, `payment_allocations`, `bank_reconciliation_suggestions` | UPDATE transaccional, `service_role` only | D · reversión | **canonical** — única ruta autorizada. Sin UI aún — explícitamente fuera de alcance de BANK-CANONICAL-CONFIRM-UI-001 (fase futura BANK-CANONICAL-REVERSE-UI-001) |
| `reject_bank_suggestion_v1` | `supabase/migrations/20260721120000_bank_review_actions.sql` | `bank_reconciliation_suggestions` (reviewed_at/status/rejected_reason), `reconciliation_events` | UPDATE/INSERT, `service_role` only | D · rechazo | **canonical desde BANK-CANONICAL-CONFIRM-UI-001** — soporta `suggestion_scope IN ('operational','historical_review')`, nunca toca `bank_movements`. Wireado vía `rejectCanonicalSuggestion()` (`lib/bank/canonical/reject-canonical-suggestion.server.ts`) → `POST /api/copilot/bank-reconciliation/[suggestionId]/reject`, con revalidación server-side que solo acepta `operational` desde este endpoint |
| `review_bank_suggestion_v1` / `add_bank_suggestion_note_v1` | ídem | `bank_reconciliation_suggestions` (reviewed_at/status), `reconciliation_events` | UPDATE/INSERT, `service_role` only | histórico | **read-only para el flujo diario** — reservado a `historical_review`; nunca debe usarse para confirmar/rechazar `operational` |
| `listCanonicalOperationalEvidence()` | `lib/bank/canonical/canonical-suggestion-evidence.ts` | SELECT sobre `bank_reconciliation_suggestions`, `bank_movements`, `proto_companies`, `proto_receipts`, `proto_invoices`, `bank_payer_identities`, `client_payer_links` | Solo lectura | D · lectura | **read-only** — cablea la pestaña Conciliación al motor canónico; ahora acepta `?movementId=` para el enlace desde Ingresos; verificado con test que ninguna llamada `insert/update/delete` ocurre |
| `confirmCanonicalSuggestion()` (nuevo, esta fase) | `lib/bank/canonical/confirm-canonical-suggestion.server.ts` | Ninguna directa — solo `.rpc("confirm_bank_reconciliation_v1", …)` | RPC-only | D · confirmación | **canonical** — revalida `suggestionScope==='operational'`, `bankMovementId`/`proposedReceiptId` contra la sugerencia real, y cada `invoiceId` de las asignaciones contra las facturas candidatas recalculadas (misma fuente que la evidencia mostrada), antes de invocar la RPC |
| `rejectCanonicalSuggestion()` (nuevo, esta fase) | `lib/bank/canonical/reject-canonical-suggestion.server.ts` | Ninguna directa — solo `.rpc("reject_bank_suggestion_v1", …)` | RPC-only | D · rechazo | **canonical** — revalida `suggestionScope==='operational'` (restricción propia de esta capa, más estricta que la RPC) y `bankMovementId` antes de invocar la RPC |

No quedan writers sin clasificar.

## Contrato de confirmación (auditado desde el SQL real de la RPC)

Respuestas verificadas contra `supabase/migrations/20260719120200_bank_reconciliation_confirm_rpc.sql`:

- **A.** Confirma movimiento → recibo: sí, un link `target_type='receipt'` por llamada.
- **B.** Confirma movimiento → factura: indirectamente, vía `payment_allocations` sobre el link.
- **C.** Factura vía aplicaciones del recibo: sí — `p_allocations jsonb` (`[{invoice_id, amount}]`) lo decide quien llama la RPC.
- **D.** Un recibo puede aplicarse a varias facturas: sí, un `payment_allocations` por factura, agregado por `invoice_id`.
- **E.** Un movimiento puede corresponder a varios recibos: sí, a nivel de `bank_movement_reconciliation_links` (múltiples links, cada uno validado contra `OVER_APPLIED_MOVEMENT`); la RPC confirma un recibo por llamada.
- **F.** `payment_allocations` persiste: `(workspace_id, reconciliation_link_id, invoice_id, applied_amount, currency, status='active', source='engine', created_by)`.
- **G.** `confirmed_link_id`: puntero anti-drift en `bank_reconciliation_suggestions` hacia el link resultante; se limpia (`NULL`) al revertir.
- **H.** Doble uso bloqueado por: idempotencia por sugerencia ya confirmada, idempotencia/conflicto por (movimiento, recibo) con `FOR UPDATE`, y validación agregada `OVER_APPLIED_MOVEMENT` / `OVER_APPLIED_RECEIPT` / `OVER_APPLIED_INVOICE`.
- **I.** Pagos parciales: soportados explícitamente — el link puede ser menor al recibo ("saldo sin aplicar"); la respuesta incluye `unappliedAmount`.
- **J.** Diferencia de monto: la RPC no define una tolerancia de negocio — solo valida topes (`+0.01` por redondeo). Cualquier regla de "diferencia menor aceptable" es una decisión de UI/negocio a construir en Fase 2, no algo que la RPC ya resuelva.

**Inconsistencia encontrada y CORREGIDA (v2):** la v1 de la RPC rechazaba `bank_movements.status IN ('ignored','reversed')`, pero la columna `status` solo admite `pending|suggested|matched|ignored|needs_review` — `'reversed'` nunca fue un valor alcanzable ahí. Ver "Auditoría exacta del estado reversed" arriba para la evidencia completa. **v2 retira esa rama** (cero cambio de comportamiento real) **y además agrega** `AND suggestion_scope = 'operational'` a la validación de sugerencia confirmable — gap real encontrado en esta fase: la v1 permitía confirmar una sugerencia `historical_review` o `matched_audit` igual que una `operational`, contradiciendo la separación operativa/histórica ya establecida en el resto del sistema.

## Máquina de estados canónica

| Entidad | Antes | Acción | Después | Evento |
|---|---|---|---|---|
| `bank_reconciliation_suggestions` | `generated` \| `pending_review` | Confirmar (`confirm_bank_reconciliation_v1`) | `confirmed` + `confirmed_link_id=<link>` | — (el evento lo genera el link, no la sugerencia) |
| `bank_reconciliation_suggestions` | `confirmed` | Revertir (`reverse_bank_reconciliation_v1`) | `reversed` + `confirmed_link_id=NULL` | — |
| `bank_movement_reconciliation_links` | (no existe) | Confirmar | creado, `archived_at=NULL` (= activo) | `reconciliation_confirmed` |
| `bank_movement_reconciliation_links` | `archived_at=NULL` (activo) | Revertir | `archived_at=now()` (= revertido; sin columna `status`, solo el timestamp) | `reconciliation_reversed` |
| `payment_allocations` | `active` | Revertir (vía link) | `reversed` | `allocation_created` se generó al confirmar; la reversión no emite un evento de allocation propio, viaja dentro de `reconciliation_reversed` |
| `bank_movements.status` | cualquiera | Confirmar o revertir | **sin cambios** — ninguna de las dos RPC toca esta columna hoy (ver hallazgo abajo) | — |
| `reconciliation_events` | (append-only) | Cualquier acción financiera | nueva fila, nunca UPDATE/DELETE | `reconciliation_confirmed` \| `reconciliation_reversed` \| `allocation_created` |

**Observación relacionada (fuera de alcance de esta fase, no se corrige):** ninguna de las dos RPC actualiza `bank_movements.status` — ni al confirmar (no pasa a `matched`) ni al revertir. La única fuente de verdad de "¿está conciliado?" es la existencia de un link activo en `bank_movement_reconciliation_links`, no la columna `status` del movimiento. Esto es coherente con el diseño de capas ya documentado (el link es la fuente financiera única), pero significa que el filtro "Estado" de la pestaña Movimientos no reflejará una confirmación canónica hasta que se decida explícitamente si eso debe cambiar — decisión de negocio para una fase futura, no ampliada aquí sin aprobación.

## Decisión de contrato (Modelo elegido)

**Modelo A confirmado para `bank_reconciliation_suggestions`**: `'reversed'` es un estado terminal válido de la sugerencia — ya estaba correctamente definido en el CHECK, en `ShadowSuggestionStatus`/`SHADOW_TERMINAL_STATUSES` (TypeScript), en `shadow-persistence.ts`, y la RPC v1 ya lo usaba bien. Se confirma con evidencia (no se asumió): las 4 condiciones pedidas por el negocio se cumplen — el estado ya está definido en TypeScript, tests/repositorios lo tratan como terminal, la RPC fue diseñada explícitamente para eso, y no contradice ningún índice (`brs_active_scope_uidx` excluye explícitamente los estados terminales de su unicidad). **Ningún cambio necesario en este punto.**

**Para `bank_movements`**: no aplica ninguno de los Modelos A/B/C planteados para "suggestion" — es una entidad distinta. La corrección fue simplemente **retirar la comparación incoherente**, no elegir un modelo de estados nuevo para el movimiento (eso sería ampliar el contrato sin aprobación, explícitamente fuera de alcance).

## Aprendizaje de pagador — gap real

El esquema (`bank_payer_identities` + `client_payer_links`) está completo y modela exactamente lo pedido (confirmaciones, primera/última observación, conflicto sin autoasociar). **No existe código que escriba a estas tablas al confirmar una conciliación** — ni en la RPC (que no las toca) ni en ningún handler. El bucle "confirmar → aprender" es trabajo nuevo, no solo recableo, y queda para Fase 3 (BANK-PAYER-LEARNING). No se asume atomicidad entre confirmación y aprendizaje hasta que se implemente explícitamente.

## Cambios de esta fase (BANK-CANONICAL-ROUTING)

1. **Tabs**: orden final Importar · Movimientos · Ingresos · **Conciliación (★ destacada)** · Historial.
2. **Conciliación** (tab) monta `BankCanonicalReconciliationPanel`, que lee únicamente `/api/copilot/bank-movements/canonical-suggestions` (`suggestion_scope='operational'`, con evidencia de cliente/recibo/facturas candidatas/pagador/confianza humana Alta/Media/Baja/Sin sugerencia). 100% lectura — Confirmar/Rechazar quedan explícitamente para Fase 2.
3. **Motor A** renombrado ("Vincular con pago programado" / "Pagos programados de Tesorería") y reubicado como sección secundaria colapsada dentro de Movimientos — ya no aparece como "Conciliar" en el flujo de cobros.
4. **Motor C** retirado como escritor en toda capa: UI sin botones de escritura, y las rutas `POST .../reconciliation-links` y `DELETE .../reconciliation-links/[linkId]` devuelven `410 LEGACY_WRITE_RETIRED` server-side. GET se conserva (el drawer sigue mostrando links/sugerencias existentes, solo lectura).
5. Nuevo módulo de lectura `lib/bank/canonical/canonical-suggestion-evidence.ts` + labels humanos (`reconciliation-confidence.ts`, `reconciliation-reason-labels.ts`) + endpoint `GET /api/copilot/bank-movements/canonical-suggestions`.

## Cambios de FASE BANK-CANONICAL-CONFIRM-CONTRACT-CORRECTION-001

1. Auditoría exacta del hallazgo bloqueante `status='reversed'` (ver sección arriba) — concluida como **lógica de RPC**, no de esquema.
2. Migración de corrección `20260722130000_bank_reconciliation_confirm_rpc_v2.sql` (**creada, NO aplicada**): retira la rama inalcanzable `'reversed'` de `confirm_bank_reconciliation_v1` (cero cambio de comportamiento) + agrega `suggestion_scope='operational'` obligatorio al confirmar por sugerencia (gap real corregido: antes se podía confirmar una sugerencia `historical_review`/`matched_audit`). `reverse_bank_reconciliation_v1` auditada de nuevo, sin cambios necesarios.
3. Máquina de estados documentada por entidad (sugerencia/link/allocation/movimiento/evento).
4. **No se implementó ninguna UI de confirmación real** — sigue explícitamente fuera de alcance (Fase 2). La pestaña Conciliación sigue 100% read-only.
5. **No se implementó aprendizaje de pagador** — sigue fuera de alcance (Fase 3, BANK-PAYER-LEARNING-001). Si en el futuro la UI muestra algo al respecto, no debe afirmar "Copilot aprendió esta cuenta" ni "se asociará automáticamente la próxima vez" — puede decir "Aprendizaje de pagador pendiente de activación."

## Límite conocido de la lectura de evidencia

`bank_reconciliation_suggestions` no persiste qué facturas propuso el motor al generar la sugerencia (`proposedInvoiceAllocations` vive solo en memoria en `ShadowProposal`, antes del insert). La lectura de esta fase recalcula "facturas abiertas candidatas" del cliente/moneda como mejor evidencia disponible — no es necesariamente la misma lista que vio el motor al generar la sugerencia original. Si esto importa para Fase 2, evaluar agregar una columna `proposed_invoice_allocations jsonb` a `bank_reconciliation_suggestions` (migración nueva, no preparada esta fase).

## Cambios de esta fase (BANK-CANONICAL-CONFIRM-UI-001)

1. **Confirmación real**: `POST /api/copilot/bank-reconciliation/[suggestionId]/confirm` — Zod-validado, RBAC `requireCopilotModuleWriteAccess("bank_movements")`, deriva workspace/actor del contexto de sesión (nunca del body). Delega 100% en `confirmCanonicalSuggestion()`, que revalida `expectedMovementId`/`expectedReceiptId` contra la sugerencia real y cada factura seleccionada contra las candidatas recalculadas, antes de llamar `confirm_bank_reconciliation_v1` una única vez.
2. **Rechazo real**: `POST /api/copilot/bank-reconciliation/[suggestionId]/reject` — mismo patrón de RBAC/derivación server-side. Usa `reject_bank_suggestion_v1`, que nunca toca `bank_movements`: el movimiento sigue disponible para una futura sugerencia. Semánticamente distinto de "ignorar movimiento".
3. **UI de la bandeja diaria** (`bank-canonical-reconciliation-panel.tsx`): confirmación rápida (≤2 clicks) cuando confianza es Alta y no hay conflicto de pagador; para confianza Media/Baja o conflicto, exige abrir el drawer de evidencia. Drawer con selección explícita de facturas candidatas para asignación (nunca confirma una factura fuera de la evidencia mostrada). Estado optimista por `suggestionId` (no un booleano global), `already_confirmed`/`already_rejected` tratados como éxito idempotente, avance automático al siguiente caso pendiente, sin recarga completa de página.
4. **Contador "Conciliados hoy"**: nuevo (`countOperationalConfirmedSince()`), fecha de corte en huso Montevideo (UTC−3 fijo), solo cuenta `suggestion_scope='operational'` + `status='confirmed'`.
5. **Enlace Ingresos → Conciliación** (sección 19 del pedido): botón "Revisar conciliación" en Ingresos cuando el motor canónico ya tiene una sugerencia operativa para ese movimiento (detectado vía `GET canonical-suggestions?movementId=`). Solo navega — no asocia ni escribe nada desde Ingresos, y no reactiva Motor B como flujo de conciliación.
6. **Reversión**: explícitamente NO implementada en esta fase. No hay botón ni endpoint de reversión — queda para una fase futura dedicada (BANK-CANONICAL-REVERSE-UI-001).
7. **Aprendizaje de pagador**: sigue sin implementar. Ninguna escritura nueva a `bank_payer_identities`/`client_payer_links`. Copy explícito en el drawer: "La identificación automática de pagadores se habilitará en una fase posterior."
8. Errores de RPC traducidos a mensajes en español (`canonical-rpc-error-messages.ts`) — nunca se muestra el código crudo solo.
9. Motor C sigue retirado como escritor (sin cambios); test de rutina actualizado para reflejar que el panel ahora sí escribe, pero exclusivamente hacia los dos endpoints canónicos nuevos.

## Cambios de esta fase (BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001)

**Regla definitiva**: los ingresos bancarios se identifican y concilian en una única bandeja (Ingresos). Movimientos es el libro bancario; Historial contiene decisiones terminadas. La pestaña Conciliación independiente fue absorbida por Ingresos.

1. **Navegación**: tabs finales `Importar · Movimientos · Ingresos (★ destacada) · Historial` — Conciliación retirada de la navegación visible. `BankTab` ya no incluye `"conciliacion"`.
2. **Deep links**: `?tab=reconciliation` / `?tab=conciliacion` normalizan a `?tab=ingresos` preservando `movementId`. La bandeja unificada abre el movimiento y su drawer directamente, sin un segundo tab.
3. **Unidad principal**: el `bank_movement` positivo. Cada ingreso aparece una única vez, en `BankIncomeWorkspace` (`components/copilot/bank-movements/bank-income-workspace.tsx`), reemplazando tanto `BankIncomePanel` como `BankCanonicalReconciliationPanel` (ambos **eliminados** — sin consumidores tras el refactor; su lógica se extrajo a piezas reutilizables, no se duplicó).
4. **Piezas compartidas**: `components/copilot/bank-movements/canonical-evidence-ui.tsx` (evidencia, drawer, `confirmCanonicalEvidence`/`rejectCanonicalEvidence`) — mismos endpoints canónicos de siempre (`/api/copilot/bank-reconciliation/[suggestionId]/confirm|reject`), sin escritura nueva.
5. **Estados derivados** (`lib/bank/canonical/income-workspace.ts`, puro y testeado): `sin_identificar` · `cliente_sugerido` · `con_coincidencia` · `requiere_revision` · `conciliado` · `sugerencia_rechazada` · `ignorado`. Deliberadamente **no** se deriva de la confianza humana (Alta/Media/Baja) — un caso Baja con cliente+recibo concretos y sin conflicto es "con coincidencia" (solo conservador en el score); un caso sin cliente o con advertencias siempre es "requiere revisión", sin importar el score. `pickCurrentSuggestionForMovement()` elige la sugerencia vigente por movimiento (confirmed > rejected > activa > ninguna) cuando hay historial de sugerencias superseded/expired.
6. **Fetch batch (sin N+1)**: `?workspace=income&movementIds=...` en el endpoint canónico existente devuelve, en un solo request, estado+evidencia para el subconjunto operativo (post-corte) de movimientos ya cargados por el cliente. Los históricos nunca tienen sugerencias `operational` (política de corte ya establecida) — el cliente no necesita pedir evidencia para ellos.
7. **Motor B** (`bank-income-matching`) se conserva como identificación **preliminar** (`PreliminaryIdentification`, solo se muestra cuando no hay sugerencia canónica) — nunca compite visualmente con la evidencia de Motor D, nunca completa una conciliación.
8. **Confianza Media/Baja confirmable manualmente**: el botón de confirmación rápida (1 clic) sigue exigiendo Alta + sin conflicto + recibo propuesto; el drawer ("Revisar evidencia") permite confirmar Media/Baja tras revisión explícita — el mismo mecanismo de la fase anterior, ahora con guarda explícita: el drawer deshabilita Confirmar si no hay recibo propuesto (`item.receipt == null`) y muestra "Este caso requiere revisión manual y todavía no puede confirmarse desde Copilot." Auditoría de distinción auto-sugerida vs. manual-revisada: no existe columna dedicada, pero la confianza (`confidence`/`recommended_action`) de la sugerencia vinculada ya permite reconstruirlo post-hoc — no se amplía el esquema.
9. **Historial** (`BankHistoryPanel`) ahora también muestra "Conciliaciones y decisiones recientes" (`?workspace=history`, mismas sugerencias operational en estado `confirmed`/`rejected`) — botón "Revertir" presente pero deshabilitado (fuera de alcance).
10. **Sin motor nuevo, sin writer paralelo**: cero escrituras directas a `bank_movement_reconciliation_links`/`payment_allocations`; los únicos endpoints de escritura siguen siendo `confirm`/`reject` de la fase anterior.

## No se autoriza en esta fase

Confirmaciones/reversiones reales ejecutadas contra producción durante el desarrollo (todo el trabajo de esta fase fue código + tests locales, sin tráfico de escritura contra datos reales), aprendizaje de pagador, UI de reversión, cambios de scoring/thresholds, otras migraciones, push. Ver informe final de la fase para el detalle completo.

## Compatibilidad de datos existentes

No se auditaron en vivo (vía `execute_sql`) los links ya creados por A/C/D en producción esta fase — es trabajo de lectura de datos, no de código, y no estaba en el alcance autorizado ("no ejecutar confirmaciones reales" se interpretó también como no generar tráfico de escritura/lectura pesada contra producción sin pedido explícito). Queda como tarea de Fase 2 o de una auditoría de datos separada: clasificar links existentes por origen (A/C/D) y confirmar que ninguno quedó en un estado inconsistente por el bug de `status='reversed'` no válido.

## Plan de fases restante

- **BANK-CANONICAL-REVERSE-UI-001**: reversión real en la pestaña Historial/Conciliación, llamando `reverse_bank_reconciliation_v1`. QA de reversión debe correr separada de la QA de confirmación (no mezclar en el mismo pase).
- **BANK-PAYER-LEARNING-001**: consolidar Motor B (`client_bank_aliases`/`bank_income_matches`) con `bank_payer_identities`/`client_payer_links`; implementar el bucle confirmar→aprender; UI de conflicto (sección 8 del pedido original).
- **BANK-DAILY-QA-001**: casos reales, objetivo &lt;60 segundos, con login real y Playwright — igual patrón que las fases de QA de Ventas en este mismo proyecto. Incluye QA controlada de confirmar/rechazar contra un entorno seguro (nunca producción real sin autorización explícita adicional).
