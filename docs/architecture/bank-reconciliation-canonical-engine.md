# Banco — Motor canónico de conciliación (Motor D)

## Identificación de cliente — migración APLICADA + UI en lote (FASE BANK-CLIENT-IDENTIFICATION-SCHEMA-APPLY-AND-BATCH-UI-001, 2026-07-21)

`bank_movement_client_identifications` (versión `20260721223939`) está **APLICADA en producción**. Corrección de esquema antes de aplicar: se agregó `revoked_by` (faltaba en el diseño local — sin él no se podía auditar quién revoca una identificación, solo cuándo). QA transaccional real (rollback-tested, cero cambios netos: `bmci=0`, `bank_movements=1020`, `bank_payer_identities=0`, `client_payer_links=0`, `bank_movement_reconciliation_links=2`, `payment_allocations=0`, `reconciliation_events=15`, `bank_reconciliation_suggestions=11`, idénticos antes/después) cubrió: identificación individual, lote con exclusión, idempotencia (constraint `bmci_active_uidx` rechaza duplicados con `23505`), reasignación (revoke+create, motivo ahora obligatorio), cuenta compartida, pago de tercero. Se encontraron y corrigieron dos gaps reales del servicio antes del QA: no validaba `direction='inflow'` (movimientos de egreso quedaban identificables) ni el caso de un movimiento ya conciliado financieramente (creaba una identificación redundante) — `confirmBatchClientIdentification` ahora reporta `blockedNonInflow`/`alreadyReconciled` en vez de escribir. Grant a `anon` en la tabla nueva confirmado como comportamiento default de Supabase (idéntico a `bank_payer_identities`), no una regresión — mitigado por RLS scoped a `authenticated`. Cross-workspace real no verificable (proyecto single-tenant en la práctica, sin segunda empresa real).

UI: Banco → Conciliación ahora tiene dos sub-vistas (`Identificar clientes` por defecto, `Vincular recibos` = flujo existente `BankIncomeWorkspace`) — sin tabs principales nuevos. `Identificar clientes` (`BankClientIdentificationWorkspace`) pagina/busca/filtra server-side (`GET .../payer-clusters`), carga el detalle de un cluster lazy al abrir el drawer (`GET .../payer-clusters/[clusterKey]`), y confirma en lote (`POST .../client-identifications`) con selección/exclusión por movimiento, elección de cliente (búsqueda server-side reusando `clients-search`), modalidad (identificado/cuenta compartida/tercero) y resumen previo explícito ("Ningún recibo ni factura será modificado"). Historial muestra identificaciones recientes separadas de las conciliaciones financieras reales. Cliente 360 agrega actor a las identificaciones sin recibo.

## Identificación de cliente vs. conciliación financiera (FASE BANK-HISTORICAL-PAYER-IDENTIFICATION-001, 2026-07-21)

**Decisión funcional**: identificar qué cliente corresponde a un ingreso bancario y conciliarlo financieramente con Zeta son **dos hechos distintos**. La ausencia de un recibo compatible en Zeta NUNCA debe bloquear identificar manualmente el cliente, guardar memoria del pagador o reconocer transferencias futuras — pero tampoco debe permitir que el sistema afirme "conciliado con recibo" o "factura pagada" cuando esas relaciones no existen.

**Modelo de 5 niveles** (`lib/bank/canonical/bank-payer-identification.ts`, `deriveIdentificationLevel`):

1. `unidentified` — sin cliente confirmado.
2. `client_identified` — cliente confirmado (con o sin recibo compatible), sin link financiero real todavía.
3. `missing_receipt` — cliente confirmado, pero no existe ningún recibo compatible en Zeta.
4. `reconciled_with_receipt` — existe un link financiero real (`bank_movement_reconciliation_links`) sin allocations de factura.
5. `full_reconciliation` — link financiero + allocations de factura reales.

Ningún nivel se saltea: un cluster con evidencia "fuerte" es solo una **propuesta**, nunca una confirmación automática.

**Auditoría histórica read-only** (`scripts/audit-bank-payer-identification-2026.ts`, ventana 2026-01-01..2026-07-20, 479 ingresos): agrupa movimientos por nombre de pagador normalizado (`clusterInflowMovements`, nunca por referencia puntual TT/LR/TR/LE/NRR ni por importe/fecha) y los cruza contra clientes reales (`matchClusterToClients`) y recibos existentes. Resultado real: 84 identidades de pagador detectadas, 24 con evidencia fuerte, 15 probable, 1 ambigua (artefacto de duplicado PDF "-- N of M --", no ambigüedad de negocio real), 44 sin candidato (mayormente personas físicas o empresas sin cliente registrado en el workspace).

**Matching de nombre robustecido**: la comparación ingenua (`normalizePayerName` + `===`) fallaba en casos reales frecuentes — puntuación distinta ("HARRISON S A" vs "HARRISON S.A"), ruido de dirección pegado al nombre cuando el extracto no cierra con una segunda barra ("NIRMEX S A CIRCUNVALACION M" vs cliente "Nirmex S.A."), y razón social abreviada vs desarrollada ("SAMYSOL SOCIEDAD ANONIMA" vs cliente "Samysol SA"). `matchClusterToClients` ahora normaliza sufijos legales uruguayos equivalentes (SA/SOCIEDAD ANONIMA, SRL/SOCIEDAD DE RESPONSABILIDAD LIMITADA, LTDA/LIMITADA) y usa coincidencia por prefijo con límite de palabra para el caso de ruido de dirección. **Limitación conocida, no corregida esta fase**: variantes con conectores distintos ("HOGAR PARA ANCIANOS COLONIA VALDENSE" vs cliente "Hogar de Ancianos de Colonia Valdense") y typos reales del extracto original ("AN ONIMA", "SAMYS OL") no se capturan — quedan como "sin candidato", correctamente destinados a revisión humana en el flujo de lote, no a un matching más agresivo que arriesgue falsos positivos.

**Extracción de nombre extendida**: se agregó el patrón "CREDITO OPERACION EN BANCA DIGITAL T<código opcional>/<NOMBRE>" (Santander) a `extractPayerNameFromDescription` — antes solo se reconocía "RECIBIDA /". Sin este patrón, casos reales como Botica del Señor SRL, Samysol SA, Dolby S.A., Dalama S.A.S. y Hogar de Ancianos nunca habrían generado una identidad de pagador ni un cluster.

**Persistencia**: tabla nueva `bank_movement_client_identifications` (migración `20260726120000_bank_movement_client_identifications.sql`, **creada, NO aplicada**) — deliberadamente separada de `bank_movement_reconciliation_links` (esa tabla exige `target_type`/`target_id` == recibo real; forzar un valor ficticio o NULL ahí rompería su contrato financiero). Estados: `identified` / `shared_account` / `third_party` / `excluded` / `revoked`; una identificación activa por movimiento vía índice único parcial (mismo patrón que `client_payer_links_active_uidx`); nunca se borra, solo se revoca (append-only). Repositorio (`client-identification-repository.server.ts`) + servicio de confirmación en lote (`confirm-client-identification.server.ts`, con idempotencia, conflictos sin autoselección, y reasignación explícita auditada) + endpoints (`GET /api/copilot/bank-reconciliation/payer-clusters` solo lectura, `POST /api/copilot/bank-reconciliation/client-identifications` confirmación en lote) + Cliente 360 (`ClientPayerMemorySection`) muestra identificaciones sin recibo bajo "Movimientos identificados sin conciliación financiera", nunca mezclado con la sección de conciliaciones reales.

**FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 (2026-07-20)** — decisión de arquitectura autorizada: **Motor D es el único motor canónico de conciliación bancaria de ingresos.** No se crea un segundo motor. No se mantienen rutas paralelas de escritura financiera.

**FASE BANK-CANONICAL-CONFIRM-CONTRACT-CORRECTION-001 (2026-07-20, continuación)** — auditoría exacta del hallazgo bloqueante `status='reversed'` y corrección del contrato de `confirm_bank_reconciliation_v1` (ver secciones "Auditoría exacta del estado reversed" y "Máquina de estados canónica" más abajo). Migración `20260722130000_bank_reconciliation_confirm_rpc_v2.sql` creada.

**FASE BANK-CANONICAL-CONFIRM-RPC-V2-MIGRATION-APPLY-001 (2026-07-22)** — migración `20260722130000_bank_reconciliation_confirm_rpc_v2.sql` **APLICADA en producción**, verificada con QA transaccional rollback-tested (8 escenarios). `confirm_bank_reconciliation_v1` en producción ya exige `suggestion_scope='operational'` para confirmar por sugerencia.

**FASE BANK-CANONICAL-CONFIRM-UI-001 (2026-07-22, continuación)** — primera UI de confirmación/rechazo real sobre el motor canónico (ver sección "Cambios de esta fase (BANK-CANONICAL-CONFIRM-UI-001)" más abajo). Confirmar y Rechazar ya son funcionales en código; Revertir sigue fuera de alcance (Fase futura BANK-CANONICAL-REVERSE-UI-001); aprendizaje de pagador sigue sin implementar.

**FASE BANK-CANONICAL-CONFIRM-CONTROLLED-QA-001 (2026-07-20, despliegue)** — push a producción (commit `83fa402`), deployment Vercel `READY`, QA controlada end-to-end con sesión real. Ningún caso pendiente alcanzó confianza Alta (0 de 5), así que no se ejecutó ninguna confirmación real — veredicto `GO_FOR_BANK_CANONICAL_CONFIRM_QA_REPEAT_WITH_SAFE_CASE`. La QA sí confirmó en producción: tabs/orden correctos, bandeja Conciliación 100% funcional (drawer, contadores, confianza Baja sin auto-confirmar), enlace "Revisar conciliación" desde Ingresos funcionando.

**FASE BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001 (2026-07-20, continuación)** — decisión funcional definitiva: **la pestaña Ingresos es la única bandeja operativa diaria.** La pestaña Conciliación independiente (de la fase anterior) queda retirada de la navegación visible; su funcionalidad se absorbe dentro de Ingresos. Ver sección "Cambios de esta fase (BANK-UNIFIED-INCOME-RECONCILIATION-WORKSPACE-001)" más abajo. Sin cambios de scoring/thresholds, sin aprendizaje de pagador, sin reversión, sin nuevas migraciones — solo unificación de experiencia sobre el mismo Motor D.

**FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001 (2026-07-20, continuación)** — habilita selección manual revisada de cliente/recibo/facturas cuando la sugerencia automática no alcanza (dataset productivo: 5 casos, 0 confianza Alta). **Hallazgo central de la auditoría: `confirm_bank_reconciliation_v1` NUNCA exigió que el recibo coincidiera con `proposed_receipt_id` ni conoció jamás el concepto de "cliente" — esa restricción vivía 100% en el adapter TypeScript.** No hizo falta una RPC nueva para permitir la selección manual; solo se agregó un parámetro `p_metadata` opcional (migración v3, **creada, NO aplicada**) para auditar la decisión. Ver sección "Selección manual revisada (BANK-MANUAL-CANONICAL-MATCH-SELECTION-001)" más abajo.

**FASE BANK-CANONICAL-CONFIRM-RPC-V3-MIGRATION-APPLY-001 (2026-07-21)** — intento de aplicación de la v3 **detenido en preflight**: la revisión final del SQL encontró que el INSERT a `bank_movement_reconciliation_links` derivaba `method='manual_reviewed'` de `p_metadata->>'mode'`, valor que **no pertenece** al CHECK real de esa columna en producción (`bank_movement_reconciliation_links_method_check`, admite únicamente `'manual'|'suggested_confirmed'`, verificado en vivo vía `execute_sql`). Habría violado la constraint apenas se usara `mode='manual_reviewed'`. **La v3 nunca se aplicó.** Producción continuó con v2 sin cambios.

**FASE BANK-CONFIRM-RPC-V3-MIGRATION-CORRECTION-001 (2026-07-21, continuación)** — corrección in-place del mismo archivo v3 (nunca llegó a aplicarse, así que no requirió una v4): `bank_movement_reconciliation_links.method` ahora es siempre el literal `'suggested_confirmed'` para confirmaciones vía esta RPC, en ambos modos. La distinción `suggested`/`manual_reviewed` vive **exclusivamente** en `reconciliation_events.metadata.mode` — nunca en `method`. Ver sección "Selección manual revisada" (actualizada) más abajo.

**FASE BANK-V3-APPLY-PDF-IMPORT-FIX-AND-DEMO-READY-001 (2026-07-21, continuación)** — v3 **APLICADA en producción** (migración `20260723120000_bank_reconciliation_confirm_rpc_v3.sql`). Hallazgo de despliegue (no de diseño): `CREATE OR REPLACE FUNCTION` no reemplaza una función cuando cambia la lista de parámetros — la v3 agrega `p_metadata`, así que coexistía como una SEGUNDA sobrecarga junto a la v2 de 7 parámetros, y cualquier llamada existente (modo `suggested`, sin `p_metadata`) fallaba con `42725: function ... is not unique`. Corregido con un follow-up mínimo y explícito, `20260723120100_bank_reconciliation_confirm_rpc_v3_drop_legacy_overload.sql` (`DROP FUNCTION` de la firma vieja), aplicado en el mismo despliegue. QA rollback-tested (escenarios A-K) confirmó **cero cambios productivos netos** (snapshot antes/después idéntico: 950 movimientos, 11 sugerencias, 2 links, 15 eventos). La QA también reprodujo un bug latente pre-existente en v2 (no introducido por la v3): `record "v_receipt" is not assigned yet` al llamar la RPC con `p_receipt_id=NULL` en una conexión "fría" (quirk de cacheo de planes PL/pgSQL por sesión). No se tocó la RPC ya verificada; se mitigó en la capa de aplicación exigiendo recibo obligatorio en `confirm-canonical-suggestion.server.ts` (ambos modos) y en el botón "Confirmar selección manual" del drawer — documentado como gap conocido de la RPC para una futura fase.

Esta misma fase corrigió, además, el importador de extractos Santander PDF: ver `docs/architecture/santander-pdf-parser.md` para el detalle completo (bug de descarte silencioso del último movimiento, saldo negativo truncado a positivo, `operation_group_key`, identidad de pagador, validación de saldo, fingerprint de deduplicación).

**FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001 (2026-07-21, continuación)** — navegación final Importar/Movimientos/Conciliación/Historial, manual draft, Cliente 360 read-only. Migración v4 creada localmente (ver más abajo).

**FASE BANK-PAYER-MEMORY-V4-APPLY-AND-CONTROLLED-QA-001 (2026-07-21, continuación)** — migración `20260725120000_bank_reconciliation_confirm_rpc_v4_payer_learning.sql` **APLICADA en producción** (registrada en `supabase_migrations.schema_migrations` como `20260721170547_bank_reconciliation_confirm_rpc_v4_payer_learning`; verificado vía `pg_get_functiondef` que el cuerpo vivo de `confirm_bank_reconciliation_v1` coincide exactamente con el aprendizaje de pagador de esta fase; único overload de 8 parámetros; grants correctos, solo `postgres`/`service_role`). `reverse_bank_reconciliation_v1` sin cambios (verificado). CHECK constraints reales de `bank_payer_identities`/`client_payer_links` (fingerprint_strength, status, source) coinciden exactamente con lo que la RPC asume. Snapshot post-apply (solo lectura): 1020 movimientos, 11 sugerencias, 2 links, 0 allocations, 15 eventos, **0 payer identities, 0 client_payer_links** — el escritor recién se conecta con el adapter de esta misma fase (`confirmCanonicalSuggestion`), que todavía no está desplegado a producción (commit local `b98566b`, sin push), así que no hay confirmaciones reales que hayan pasado `p_metadata.payer` todavía. Los 2 links existentes (Samysol SA USD 318,18 y Botica del Señor SRL UYU 10.004, confirmados 2026-07-21 ~00:52 UTC) son operaciones de negocio reales previas a esta fase, con `metadata` vacío — no son residuo de QA. **Nota de documentación**: el archivo de migración local y el comentario `COMMENT ON FUNCTION` que quedó commiteado en `b98566b` conservan la redacción original "PREPARADA LOCALMENTE, NO APLICAR SIN AUTORIZACIÓN EXPLÍCITA" — mismo patrón ya usado con v3 (su archivo local también sigue diciendo "NO APLICAR" pese a estar aplicada): el archivo de migración queda como documento histórico de intención al momento de crearlo, y el estado real vive en esta narrativa. El `COMMENT ON FUNCTION` realmente ejecutado en producción sí quedó actualizado a "...FASE BANK-PAYER-MEMORY-V4-APPLY-AND-CONTROLLED-QA-001 — APLICADA." Próximo paso: push + QA controlada end-to-end con un caso real (confirmar un movimiento con nombre de pagador parseable y verificar que `bank_payer_identities`/`client_payer_links` se pueblan atómicamente).

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

## Aprendizaje de pagador — implementado y APLICADO en producción

**FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001** + **FASE BANK-PAYER-MEMORY-V4-APPLY-AND-CONTROLLED-QA-001**: el bucle confirmar→aprender vive en la misma transacción que la confirmación financiera.

1. Migración `20260725120000_bank_reconciliation_confirm_rpc_v4_payer_learning.sql`: **APLICADA en producción** (ver entrada de fase arriba); misma firma de 8 parámetros que v3; upsert de `bank_payer_identities` / `client_payer_links` cuando `p_metadata.payer.accountHash` está presente; cliente final desde `proto_receipts.company_id`; conflicto multi-cliente → `conflicted` sin autoselección; early-return idempotente no re-incrementa.
2. Adapter `confirmCanonicalSuggestion` siempre envía `p_metadata` (v3 ya en producción) y deriva `payer` con helpers puros (`lib/bank/canonical/payer-identity.ts`) — nunca usa TT/LR/TR/LE como identidad permanente. **Commit local, sin push todavía** — hasta que se despliegue, ninguna confirmación real pasa `payer` a la RPC (tablas siguen en 0 filas).
3. Manual draft: `POST /api/copilot/bank-reconciliation/manual-draft` crea/reutiliza suggestion operational sin link/allocation.
4. Cliente 360 (Cobranza): sección read-only "Pagos y cuentas utilizadas"; correcciones deshabilitadas (fase posterior append-only).
5. Navegación final: Importar · Movimientos · Conciliación · Historial.

## Aprendizaje de pagador — gap histórico (pre-fase, cerrado)

El esquema (`bank_payer_identities` + `client_payer_links`) estaba completo sin escritor. Ese gap quedó cerrado con la v4, aplicada en producción — pendiente únicamente de push + una confirmación real para ejercitar el escritor por primera vez.

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

## Selección manual revisada (BANK-MANUAL-CANONICAL-MATCH-SELECTION-001)

### Auditoría del contrato (con evidencia del SQL real)

| # | Pregunta | Respuesta con evidencia |
|---|---|---|
| A | ¿La RPC recibe explícitamente suggestion_id, movement_id y receipt_id? | Sí, los tres son parámetros independientes. Ningún JOIN interno fuerza `p_receipt_id` a coincidir con lo que la sugerencia propuso. |
| B | ¿El cliente se deriva del recibo o se envía como argumento? | **Ninguno.** La RPC nunca recibe `client_id`. No conoce ni valida "cliente" en absoluto — solo movimiento/recibo/facturas, todos acotados por `workspace_id`. |
| C | ¿Qué validación obliga a usar proposed_receipt_id? | Ninguna a nivel de RPC. Era 100% del adapter TypeScript (`confirmCanonicalSuggestion()`, líneas de `RECEIPT_MISMATCH`). |
| D | ¿La restricción está en endpoint/adapter/RPC/varios niveles? | **Únicamente en el adapter.** |
| E | ¿La RPC puede validar un recibo alternativo del mismo workspace? | Sí, ya lo hacía (`proto_receipts` acotado por `workspace_company_id`, sin filtrar por cliente/sugerencia). |
| F | ¿El recibo alternativo debe pertenecer al cliente seleccionado? | La RPC no lo exige — es una regla de negocio que se agrega en el **adapter** (`RECEIPT_CLIENT_MISMATCH`), no en el esquema. |
| G | ¿Cómo se validan sus facturas? | La RPC valida workspace/saldo/moneda/suma por factura (con locks); nunca valida pertenencia a cliente — el adapter filtra `candidateInvoices` por el cliente **seleccionado** (antes hardcodeado a `suggestion.proposedClientId`). |
| H | ¿La suggestion debe actualizarse para registrar la opción elegida? | La RPC solo toca `status/confirmed_link_id/reviewed_by/reviewed_at`. `proposed_client_id`/`proposed_receipt_id` **permanecen intactos** (Opción A del pedido: propuesta original inmutable). |
| I | ¿Qué evento distingue confirmación automática de manual revisada? | Antes de esta fase, ninguno (`reconciliation_events.metadata` quedaba en `{}` por defecto). Ahora: `p_metadata` (nuevo, opcional) puebla ese JSONB con `{mode, selectedClientId, selectedReceiptId, proposedClientId, proposedReceiptId, reason}`. |
| J | ¿Hay columnas existentes suficientes o requiere migración? | Para permitir un recibo/cliente distinto: **no requiere migración**, ya funcionaba con la v2. Para auditar la decisión: sí conviene una migración mínima aditiva (v3) — pero usa `reconciliation_events.metadata`, columna que **ya existía** desde 20260719120100. No se agregan columnas nuevas a ninguna tabla. |

**Conclusión de diseño:** no se creó una RPC nueva ni una v4. La v3 agrega ÚNICAMENTE `p_metadata jsonb DEFAULT '{}'::jsonb` (aditivo, con default) — el modo "suggested" llama la RPC exactamente igual que antes (sin ese parámetro), así que sigue funcionando contra la v2 ya en producción sin requerir esta migración.

### Modelo operativo: dos modos, un solo contrato financiero

- **`mode: "suggested"`**: confirma exactamente cliente/recibo/facturas propuestos por el motor. Mismo comportamiento que antes de esta fase.
- **`mode: "manual_reviewed"`**: la persona elige explícitamente cliente/recibo/facturas distintos. Motivo obligatorio (3-500 caracteres). Revalidación server-side completa: cliente real del workspace, recibo perteneciente a ESE cliente (`receipt.company_id === selectedClientId`), facturas dentro de las candidatas del cliente seleccionado (no del propuesto).

Ambos modos terminan en la **misma** llamada a `confirm_bank_reconciliation_v1` — no existe una RPC para sugerencias y otra que escriba directo para manuales.

### Endpoint extendido (no uno nuevo)

`POST /api/copilot/bank-reconciliation/[suggestionId]/confirm` — mismo endpoint de la fase anterior, body extendido: `mode`, `selectedClientId`, `selectedReceiptId` (reemplaza `expectedReceiptId`), `manualReason`. Workspace/actor se derivan del contexto de sesión, nunca del body (sin cambios).

### Búsqueda server-side (dos endpoints nuevos, ambos solo lectura)

- `GET /api/copilot/bank-reconciliation/clients-search?q=&limit=&offset=` — búsqueda paginada (máx. 50), nunca carga el portfolio completo.
- `GET /api/copilot/bank-reconciliation/receipts-search?clientId=&currency=` — recibos + facturas candidatas de un cliente puntual, con flag `used` cruzado contra `bank_movement_reconciliation_links` activos (nunca confiado del cliente).

### UI (drawer de Ingresos)

"Otra coincidencia" (colapsada por defecto, nunca mezclada visualmente con "Confirmar conciliación" de la sugerencia): buscador de cliente (debounced 300ms) → recibos del cliente (usados deshabilitados, con diferencia vs. el movimiento) → facturas candidatas → motivo (5 opciones + "Otro" con texto libre) → "Confirmar selección manual". Cambiar de cliente o de recibo limpia la selección de facturas.

### Explícitamente NO implementado esta fase

- **Casos sin ninguna suggestion** (sección 15 del pedido): la RPC ya soporta `p_suggestion_id = NULL` estructuralmente (confirmado en el SQL — las tres validaciones de sugerencia están dentro de `IF p_suggestion_id IS NOT NULL`), pero construir el flujo seguro completo (generar una suggestion `manual_draft` primero, o permitir movementId-only) requiere más auditoría de `engine_version`/idempotencia. Documentado como gap, no implementado — el confirm sigue exigiendo una sugerencia operational existente.
- Agrupación visual "Coincidencia exacta / Cercanos / Otros recibos" (sección 5): implementada como lista única simple, ordenada por fecha, con diferencia mostrada — sin la agrupación en tres niveles.
- Filtro "cliente"/"período" dedicados en Ingresos (ya documentado como limitación de la fase anterior).

### Corrección: `method` vs. `metadata.mode` (BANK-CONFIRM-RPC-V3-MIGRATION-CORRECTION-001)

**Semántica definitiva de `bank_movement_reconciliation_links.method`:** representa el **mecanismo financiero** del link (cómo se originó técnicamente), no el nivel de intervención humana en la UI. El CHECK real de producción (`bank_movement_reconciliation_links_method_check`) admite únicamente `'manual'|'suggested_confirmed'` — sin cambios, sin ampliar. Para toda confirmación vía `confirm_bank_reconciliation_v1` (ambos modos, `suggested` y `manual_reviewed`), `method` es siempre `'suggested_confirmed'`.

**Semántica definitiva de `reconciliation_events.metadata.mode`:** representa la **modalidad humana** de la confirmación (`suggested`|`manual_reviewed`), junto con `selectedClientId`/`selectedReceiptId`/`proposedClientId`/`proposedReceiptId`/`reason`. Vive exclusivamente en el evento de auditoría — nunca en `method`, nunca afecta la semántica financiera del link.

**Qué pasó:** el primer intento de aplicar la migración v3 (`BANK-CANONICAL-CONFIRM-RPC-V3-MIGRATION-APPLY-001`) se detuvo en preflight porque la revisión final del SQL encontró que el INSERT a `bank_movement_reconciliation_links` derivaba `method='manual_reviewed'` de `p_metadata->>'mode'` — un valor no permitido por el CHECK real, que habría causado una violación de constraint en cuanto se usara `manual_reviewed` en producción (justo el caso que la fase existe para habilitar). La migración v3 **nunca se aplicó** — se corrigió en el mismo archivo (no se creó una v4, porque el archivo nunca había llegado a producción) para que `method` sea siempre `'suggested_confirmed'`, y la cobertura de tests se amplió con un fixture tomado del CHECK real capturado en vivo (`lib/bank/canonical/bank-canonical-confirm-rpc-v3-schema-contract.test.ts`) para que una regresión futura de este tipo falle en CI en vez de en producción.

## No se autoriza en esta fase

Confirmaciones/reversiones reales ejecutadas contra producción durante el desarrollo (todo el trabajo de esta fase fue código + tests locales, sin tráfico de escritura contra datos reales), aprendizaje de pagador, UI de reversión, cambios de scoring/thresholds, otras migraciones, push. Ver informe final de la fase para el detalle completo.

## Compatibilidad de datos existentes

No se auditaron en vivo (vía `execute_sql`) los links ya creados por A/C/D en producción esta fase — es trabajo de lectura de datos, no de código, y no estaba en el alcance autorizado ("no ejecutar confirmaciones reales" se interpretó también como no generar tráfico de escritura/lectura pesada contra producción sin pedido explícito). Queda como tarea de Fase 2 o de una auditoría de datos separada: clasificar links existentes por origen (A/C/D) y confirmar que ninguno quedó en un estado inconsistente por el bug de `status='reversed'` no válido.

## Plan de fases restante

- **BANK-CANONICAL-REVERSE-UI-001**: reversión real en la pestaña Historial/Conciliación, llamando `reverse_bank_reconciliation_v1`. QA de reversión debe correr separada de la QA de confirmación (no mezclar en el mismo pase).
- **BANK-PAYER-LEARNING-001**: consolidar Motor B (`client_bank_aliases`/`bank_income_matches`) con `bank_payer_identities`/`client_payer_links`; implementar el bucle confirmar→aprender; UI de conflicto (sección 8 del pedido original).
- **BANK-DAILY-QA-001**: casos reales, objetivo &lt;60 segundos, con login real y Playwright — igual patrón que las fases de QA de Ventas en este mismo proyecto. Incluye QA controlada de confirmar/rechazar contra un entorno seguro (nunca producción real sin autorización explícita adicional).
