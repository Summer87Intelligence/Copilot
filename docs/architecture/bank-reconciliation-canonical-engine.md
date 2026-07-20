# Banco — Motor canónico de conciliación (Motor D)

**FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 (2026-07-20)** — decisión de arquitectura autorizada: **Motor D es el único motor canónico de conciliación bancaria de ingresos.** No se crea un segundo motor. No se mantienen rutas paralelas de escritura financiera.

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
| `confirm_bank_reconciliation_v1` | `supabase/migrations/20260719120200_bank_reconciliation_confirm_rpc.sql` | `bank_movement_reconciliation_links`, `payment_allocations`, `reconciliation_events`, `bank_reconciliation_suggestions` (update) | INSERT/UPDATE transaccional, `service_role` only | D · confirmación | **canonical** — única ruta autorizada. Sin UI aún (Fase 2: BANK-CANONICAL-CONFIRM-UI) |
| `reverse_bank_reconciliation_v1` | ídem | `bank_movement_reconciliation_links`, `payment_allocations`, `bank_reconciliation_suggestions` | UPDATE transaccional, `service_role` only | D · reversión | **canonical** — única ruta autorizada. Sin UI aún (Fase 2) |
| `review_bank_suggestion_v1` / `reject_bank_suggestion_v1` / `add_bank_suggestion_note_v1` | `supabase/migrations/20260721120000_bank_review_actions.sql` | `bank_reconciliation_suggestions` (reviewed_at/status), `reconciliation_events` | UPDATE/INSERT, `service_role` only | histórico | **read-only para el flujo diario** — reservado a `historical_review`; nunca debe usarse para confirmar `operational` |
| `listCanonicalOperationalEvidence()` (nuevo, esta fase) | `lib/bank/canonical/canonical-suggestion-evidence.ts` | SELECT sobre `bank_reconciliation_suggestions`, `bank_movements`, `proto_companies`, `proto_receipts`, `proto_invoices`, `bank_payer_identities`, `client_payer_links` | Solo lectura | D · lectura | **read-only** — cablea la pestaña Conciliación al motor canónico; verificado con test que ninguna llamada `insert/update/delete` ocurre |

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

**Inconsistencia encontrada:** la RPC rechaza `bank_movements.status IN ('ignored','reversed')`, pero la columna `status` solo admite `pending|suggested|matched|ignored|needs_review` — `'reversed'` no es un valor válido ahí. Rama muerta o desalineación a resolver (con migración, no aplicada esta fase) antes de construir la UI de confirmación.

## Aprendizaje de pagador — gap real

El esquema (`bank_payer_identities` + `client_payer_links`) está completo y modela exactamente lo pedido (confirmaciones, primera/última observación, conflicto sin autoasociar). **No existe código que escriba a estas tablas al confirmar una conciliación** — ni en la RPC (que no las toca) ni en ningún handler. El bucle "confirmar → aprender" es trabajo nuevo, no solo recableo, y queda para Fase 3 (BANK-PAYER-LEARNING). No se asume atomicidad entre confirmación y aprendizaje hasta que se implemente explícitamente.

## Cambios de esta fase (BANK-CANONICAL-ROUTING)

1. **Tabs**: orden final Importar · Movimientos · Ingresos · **Conciliación (★ destacada)** · Historial.
2. **Conciliación** (tab) monta `BankCanonicalReconciliationPanel`, que lee únicamente `/api/copilot/bank-movements/canonical-suggestions` (`suggestion_scope='operational'`, con evidencia de cliente/recibo/facturas candidatas/pagador/confianza humana Alta/Media/Baja/Sin sugerencia). 100% lectura — Confirmar/Rechazar quedan explícitamente para Fase 2.
3. **Motor A** renombrado ("Vincular con pago programado" / "Pagos programados de Tesorería") y reubicado como sección secundaria colapsada dentro de Movimientos — ya no aparece como "Conciliar" en el flujo de cobros.
4. **Motor C** retirado como escritor en toda capa: UI sin botones de escritura, y las rutas `POST .../reconciliation-links` y `DELETE .../reconciliation-links/[linkId]` devuelven `410 LEGACY_WRITE_RETIRED` server-side. GET se conserva (el drawer sigue mostrando links/sugerencias existentes, solo lectura).
5. Nuevo módulo de lectura `lib/bank/canonical/canonical-suggestion-evidence.ts` + labels humanos (`reconciliation-confidence.ts`, `reconciliation-reason-labels.ts`) + endpoint `GET /api/copilot/bank-movements/canonical-suggestions`.

## Límite conocido de la lectura de evidencia

`bank_reconciliation_suggestions` no persiste qué facturas propuso el motor al generar la sugerencia (`proposedInvoiceAllocations` vive solo en memoria en `ShadowProposal`, antes del insert). La lectura de esta fase recalcula "facturas abiertas candidatas" del cliente/moneda como mejor evidencia disponible — no es necesariamente la misma lista que vio el motor al generar la sugerencia original. Si esto importa para Fase 2, evaluar agregar una columna `proposed_invoice_allocations jsonb` a `bank_reconciliation_suggestions` (migración nueva, no preparada esta fase).

## No se autoriza en esta fase

Migraciones remotas, borrado de datos, confirmaciones/reversiones reales ejecutadas contra producción, backfills, push. Ver informe final de la fase para el detalle completo.

## Compatibilidad de datos existentes

No se auditaron en vivo (vía `execute_sql`) los links ya creados por A/C/D en producción esta fase — es trabajo de lectura de datos, no de código, y no estaba en el alcance autorizado ("no ejecutar confirmaciones reales" se interpretó también como no generar tráfico de escritura/lectura pesada contra producción sin pedido explícito). Queda como tarea de Fase 2 o de una auditoría de datos separada: clasificar links existentes por origen (A/C/D) y confirmar que ninguno quedó en un estado inconsistente por el bug de `status='reversed'` no válido.

## Plan de fases restante

- **Fase 2 — BANK-CANONICAL-CONFIRM-UI**: Confirmar/Rechazar/Ignorar reales en la pestaña Conciliación, llamando `confirm_/reverse_bank_reconciliation_v1`. Requiere primero resolver la inconsistencia de `status='reversed'`.
- **Fase 3 — BANK-PAYER-LEARNING**: consolidar Motor B (`client_bank_aliases`/`bank_income_matches`) con `bank_payer_identities`/`client_payer_links`; implementar el bucle confirmar→aprender; UI de conflicto (sección 8 del pedido).
- **Fase 4 — BANK-DAILY-QA**: casos reales, objetivo &lt;60 segundos, con login real y Playwright — igual patrón que las fases de QA de Ventas en este mismo proyecto.
