# Bank Shadow Server — Inteligencia bancaria (proposal-only)

Última actualización: 2026-07-17.  
Fase: **BANK-SHADOW-SERVER-IMPLEMENTATION-001**.  
Estado: capa server-side implementada; **dry-run por defecto**; persistencia shadow opcional.

## Arquitectura

```
lib/bank/intelligence/          ← motor PURO (sin DB)
lib/bank/intelligence/server/   ← capa shadow (lectura + propuestas)
  types.ts
  guards.ts
  money.ts
  repositories/                 ← lecturas workspace-scoped + writes allowlist
  loaders/shadow-context-loader.ts
  mappers/
  suggestion-service.ts         ← matchBankMovement → ShadowProposal
  shadow-persistence.ts         ← decide create|update|supersede|skip
  shadow-persist-apply.ts       ← aplica decisión vía ports
  runner.ts                     ← alcance controlado
```

Flujo:

1. `runBankShadowIntelligence` exige `movementId` | `movementIds` | `limit` explícito (≤25).
2. Carga movimientos + contexto (recibos, clientes, facturas, pagadores, links) **solo lectura**, filtrado por `workspaceId`.
3. Ejecuta el motor determinístico `matchBankMovement`.
4. Emite `ShadowProposal` explicable (confidence, reasons, warnings, recommendedAction).
5. Modo:
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

### Runner

| Opción | Default | Notas |
|---|---|---|
| `dryRun` | `true` | Sin persistencia |
| `persist` | `false` | Requiere también `dryRun=false` para escribir |
| `limit` | — | Obligatorio si no hay IDs; máx 25 |
| `movementId` / `movementIds` | — | Alcance explícito |

**Prohibido:** recorrer automáticamente todos los movimientos del workspace (~951).

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

## Límites y deuda

- Límite runner: 25 movimientos por invocación.
- Concurrencia multi-writer en unique index activo: no cubierta por tests de dos conexiones en esta fase (deuda documentada en rollout).
- Shadow **no crea** `bank_payer_identities` (solo lectura); aprendizaje de pagadores = etapa futura.
- No se ejecuta el runner contra producción en esta fase.

## Siguiente etapa (futura, autorización)

1. Dry-run controlado sobre un sample real (autorización).
2. Shadow persist acotado + métricas de precisión.
3. UI de revisión / confirmación asistida (RPC financiera aparte).
