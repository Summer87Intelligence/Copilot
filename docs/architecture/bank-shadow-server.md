# Bank Shadow Server — Inteligencia bancaria (proposal-only)

Última actualización: 2026-07-17.
Fase: **BANK-SHADOW-MATCHED-POLICY-001** (sobre server shadow).
Estado: capa server-side + selección conservadora de recibos (empate/colisión) + **política única de elegibilidad**; **dry-run por defecto**.

## Arquitectura

```
lib/bank/intelligence/          ← motor PURO (sin DB)
  reconciliation-matching.ts    ← empate de recibos exactos (sin .find arbitrario)
lib/bank/intelligence/server/   ← capa shadow (lectura + propuestas)
  ...
  suggestion-service.ts         ← matchBankMovement → ShadowProposal + colisión batch
  runner.ts                     ← alcance controlado; aplica colisión antes de exponer/persistir
```

Flujo:

1. `runBankShadowIntelligence` exige `movementId` | `movementIds` | `limit` explícito (≤25).
2. Carga movimientos + contexto (recibos, clientes, facturas, pagadores, links) **solo lectura**, filtrado por `workspaceId`.
3. **Elegibilidad única** (`isShadowEligibleMovement`): filtra de forma idéntica en todos los caminos (ID único, lista explícita, selección automática). Ver sección Política de elegibilidad.
4. Ejecuta el motor determinístico `matchBankMovement` (selección conservadora de recibos) sobre los movimientos elegibles.
5. Emite `ShadowProposal` explicable; luego `applyReceiptCollisionPolicy` sobre el batch.
6. Modo:
   - **dry-run** (default): no escribe.
   - **shadow-persist** (`dryRun=false` && `persist=true`): escribe solo
     `bank_reconciliation_suggestions` + `reconciliation_events` de sugerencia.

## Contratos

### ShadowProposal (mínimo)

- `workspaceId`, `bankMovementId`
- `payerIdentityId` (nullable; solo si ya existe identidad leída)
- `proposedClientId` / `proposedReceiptId` (nullable)
- `confidence` 0..100
- `reasons[]` / `warnings[]`
- `recommendedAction`: `AUTO_RECONCILE_CANDIDATE` | `REVIEW` | `UNIDENTIFIED` | `REJECT`
- `engineVersion`, `movementFingerprint`, `payerFingerprint`
- `candidateEvidence`, `generatedAt`

`AUTO_RECONCILE_CANDIDATE` es **solo recomendación shadow**. Nunca ejecuta conciliación.
Nunca aparece ante empate de recibos ni ante `RECEIPT_CANDIDATE_COLLISION`.

## Política de empate de recibos (BANK-SHADOW-CORRECTION-001)

Candidatos **fuertes exactos**: misma moneda, importe exacto (tol. 1 cent), no reconciliados,
mismo workspace. Se puntúan de forma objetiva:

1. Boost material si el cliente del recibo tiene **pagador confirmado** para la huella.
2. Menor distancia absoluta de fecha al movimiento.

| Caso | `proposedReceiptId` | Acción | Warnings / reasons |
|---|---|---|---|
| Único fuerte | definido | según confidence | `MATCHING_RECEIPT`, etc. |
| Empate (mismo score máximo) | **null** | `REVIEW` | `MULTIPLE_STRONG_CANDIDATES`; evidence en `tiedCandidates` |
| Superior solo por fecha | el más cercano | no AUTO sin otras señales | `RECEIPT_DATE_DOMINANCE` |

**Desempates permitidos:** pagador confirmado; proximidad de fecha estrictamente mejor.
**Desempates prohibidos:** orden de consulta, inserción, posición en array, `receiptId` como score.

`MULTIPLE_STRONG_CANDIDATES`: hay ≥2 recibos (o clientes por nombre) con el mismo nivel de
evidencia relevante; el motor **no** elige uno arbitrario. Confidence ≤ 50 en empate de recibos.

## Política de colisión entre movimientos (mismo batch)

Si dos+ propuestas del mismo `runBankShadowIntelligence` fijan el mismo `proposedReceiptId`:

- warning obligatorio `RECEIPT_CANDIDATE_COLLISION`;
- `proposedReceiptId = null` en ambas;
- `recommendedAction = REVIEW`;
- `collisionDetected = true`;
- no se reserva ni escribe el recibo.

Significado: el recibo no puede presentarse como candidato único seguro para más de un
movimiento en la misma ejecución shadow.

## Contratos (campos de ambigüedad)

Además del mínimo anterior: `tiedCandidates`, `ambiguityReason`, `collisionDetected`,
y en `candidateEvidence` la lista completa de empatados.

## Política de elegibilidad de movimientos (BANK-SHADOW-MATCHED-POLICY-001)

Fuente de verdad **única**: `isShadowEligibleMovement()` en
`lib/bank/intelligence/server/eligibility.ts`. Se aplica **igual** en todos los caminos
(movementId único, movementIds explícitos, selección automática/limitada y futuros
runners). Antes de esta política, el camino por IDs explícitos no aplicaba el filtro
`pendingOnly` que sí usaba el escaneo automático; ahora la decisión es idéntica y
path-independiente.

Por defecto (conservador) se **excluye** (no genera suggestion ni event, no persiste):

| Condición | `skipReason` |
|---|---|
| Fuera del workspace | `WORKSPACE_MISMATCH` |
| Egreso (no `inflow`) | `NON_COMMERCIAL_DIRECTION` |
| Con link canónico activo | `MOVEMENT_HAS_ACTIVE_LINK` |
| Anterior al corte operativo (`2026-07-01`) | `MOVEMENT_BEFORE_CUTOFF` |
| `status = ignored` | `MOVEMENT_IGNORED` |
| `status = reversed` | `MOVEMENT_REVERSED` |
| `status = matched` | `MOVEMENT_ALREADY_MATCHED` |
| Cualquier otro status no elegible | `MOVEMENT_STATUS_NOT_ELIGIBLE` |

Elegibles (procesables): `status ∈ {pending, suggested, needs_review}`, inflow, post-corte,
en el workspace y **sin** link canónico activo.

### Modo audit-only para `matched` (`includeMatchedForAudit=true`)

- Solo server-side; **default `false`**.
- Único status que habilita: `matched` (las exclusiones duras —workspace, egreso, link
  activo, corte, ignored, reversed— siguen teniendo prioridad).
- La propuesta resultante queda marcada `auditOnly=true`, con warning
  `MATCHED_MOVEMENT_AUDIT` y `recommendedAction` **nunca** `AUTO_RECONCILE_CANDIDATE`.
- **No persiste** (ni con `persist=true`), no confirma/revierte, no modifica el movimiento.
- En esta fase el modo audit-only es **solo dry-run** (no hay persistencia audit-only).
  Cualquier persistencia audit-only futura debe quedar claramente diferenciada y fuera de
  esta fase.

### Runner

| Opción | Default | Notas |
|---|---|---|
| `dryRun` | `true` | Sin persistencia |
| `persist` | `false` | Requiere también `dryRun=false` para escribir |
| `limit` | — | Obligatorio si no hay IDs; máx 25 |
| `movementId` / `movementIds` | — | Alcance explícito |
| `includeMatchedForAudit` | `false` | Server-side; incluye `matched` como audit-only (nunca persiste) |

**Prohibido:** recorrer automáticamente todos los movimientos del workspace (~950).

## Persistencia shadow (idempotente)

| Decisión | Cuándo |
|---|---|
| `create` | No hay sugerencia activa `(ws, movement, engineVersion)` |
| `update` | Activa existe y el cambio es menor |
| `supersede` | Cambio sustancial → marca anterior `superseded` + crea nueva |
| `skip` | Idéntica / evidencia insuficiente / fila terminal mal clasificada |

No sobrescribe filas `confirmed` / `rejected` / `reversed` / `superseded`.  
No borra eventos (append-only).  
No persiste si `UNIDENTIFIED` con confidence baja, sin cliente/recibo y sin reasons.

## Seguridad

- Server-side only; `service_role` no se expone al cliente.
- `workspaceId` obligatorio en cada repositorio; sin consultas cross-workspace.
- Sin cuentas bancarias completas (solo hash / máscara).
- Guardas (`guards.ts`) bloquean escritura en:
  - `bank_movement_reconciliation_links`
  - `payment_allocations`
  - `bank_movements` / `proto_receipts` / `proto_invoices`
  - y RPCs `confirm_bank_reconciliation_v1` / `reverse_bank_reconciliation_v1`

## Expresamente prohibido en esta fase

- Llamar RPC de confirmación/reversión
- Escribir links o allocations
- Modificar movimientos / recibos / facturas
- Cron, UI, runner contra producción, SQL remoto, push

## Dos sugerencias `matched` históricas (pre-política)

En la primera persistencia shadow (BANK-CONTROLLED-SHADOW-PERSIST-REVIEW-001, 2026-07-17)
se crearon 2 sugerencias `generated` para movimientos que ya estaban en `status=matched`,
porque el camino por IDs explícitos aún no aplicaba el filtro de elegibilidad:

- movimiento `49bd2ddc-1609-4ee8-ad6e-f255a09e2c6d` (USD 318.18)
- movimiento `1c611fcd-18fe-4c30-a26b-b5f34c8f79ce` (UYU 10004)

Son **datos legítimos creados antes de la política**, no un error de datos. Bajo la política
actual esos movimientos se excluirían (`MOVEMENT_ALREADY_MATCHED`). **No** se eliminan,
rechazan ni supersedan en esta fase; quedan como `generated` para revisión manual. Ambas son
`REVIEW` (nunca AUTO) y no afectan estado financiero.

## Límites y deuda

- Límite runner: 25 movimientos por invocación.
- Concurrencia multi-writer en unique index activo: no cubierta por tests de dos conexiones en esta fase (deuda documentada en rollout).
- Shadow **no crea** `bank_payer_identities` (solo lectura); aprendizaje de pagadores = etapa futura.
- No se ejecuta el runner contra producción en esta fase.

## Siguiente etapa (futura, autorización)

1. Dry-run controlado sobre un sample real (autorización).
2. Shadow persist acotado + métricas de precisión.
3. UI de revisión / confirmación asistida (RPC financiera aparte).
