# Modelo Canónico de Conciliación Bancaria (FASE BANK-SCHEMA-CORRECTION-001)

Última actualización: 2026-07-17. Estado: **corrección de esquema** (migraciones NO aplicadas).

## Regla central: una sola fuente por hecho

| Hecho | Fuente canónica | Nunca |
|---|---|---|
| Vínculo financiero ("mov X aplicado a recibo por $Y") | `bank_movement_reconciliation_links` (FASE E) | no se duplica |
| Propuesta del motor (cliente/recibo/confianza/razones) | `bank_reconciliation_suggestions` | no es fuente financiera |
| Aplicación a factura | `payment_allocations` (→ link canónico) | no referencia la sugerencia |
| Trazabilidad | `reconciliation_events` (append-only) | no guarda secretos |

## Flujo (una dirección)

```
bank_movement
     ↓  motor puro (shadow, proposal-only)
bank_reconciliation_suggestions   (generated → pending_review)
     ↓  confirm_bank_reconciliation_v1  (RPC transaccional)
bank_movement_reconciliation_link  (FASE E · fuente financiera canónica)
     ↓
payment_allocations
     ↓
proto_invoices (saldo)

bank_payer_identity → client_payer_links → proto_companies
```

Una sugerencia **confirmada** NO se vuelve el vínculo: la RPC crea/reutiliza el link
canónico y recién ahí `suggestions.status='confirmed'` + `confirmed_link_id` (CHECK
`brs_confirmed_requires_link`). Rechazada/superseded nunca tiene link.

## Anti-drift

- `suggestions.status='confirmed'` ⇒ `confirmed_link_id NOT NULL` (CHECK).
- `suggestions.status IN ('rejected','superseded')` ⇒ `confirmed_link_id NULL` (CHECK).
- `payment_allocations.reconciliation_link_id` referencia el link canónico (NOT NULL),
  nunca una sugerencia.
- Una sola sugerencia activa por `(workspace, movement, engine_version)` (unique parcial).
- La conciliación efectiva vive SOLO en `bank_movement_reconciliation_links`.

## Estados

- **Sugerencia**: generated · pending_review · confirmed · rejected · superseded · expired.
- **Link (FASE E)**: activo (`archived_at IS NULL`) / archivado (revertido). Estado derivado
  del movimiento: pending / partial / reconciled / ignored / duplicate.
- **Allocation**: active / reversed.

## RPC transaccional — `confirm_bank_reconciliation_v1`

`SECURITY INVOKER`, `search_path='public, pg_temp'`. **Solo `service_role`** puede
ejecutarla (decisión de revisión): `authenticated`/`anon`/`public` **no** tienen
EXECUTE → sin superficie de spoofing de `p_workspace_id`/`p_created_by` desde el
navegador. El servidor (cliente service_role, auth propia por cookie Copilot) deriva
workspace y actor de la sesión; la RPC **valida `p_created_by`** contra `app_users`
del workspace (`is_active`), y mantiene el guard `WORKSPACE_MISMATCH` para un eventual
camino authenticated. Corre como service_role → RLS omitida → **la función valida
todo** (workspace en cada FK).

Inputs: `p_workspace_id, p_movement_id, p_receipt_id, p_suggestion_id, p_allocations,
p_applied_amount, p_created_by`. `p_applied_amount` = importe del link (permite saldo
sin aplicar); las allocations se **agregan por factura** (dedup del JSON).

Pasos (en UNA transacción): idempotencia (sugerencia ya confirmada / link ya existente)
→ lock movimiento (`FOR UPDATE`) + validar workspace/dirección/estado → lock recibo +
validar moneda → sumar allocations → validar sumas (movimiento/recibo/factura, con locks)
→ crear link canónico → crear allocations (validando saldo de cada factura bloqueada) →
`suggestion.status='confirmed'` → eventos → devolver `{linkId, appliedAmount, ...}`.

### Validación de sumas (transaccional, no CHECK de fila)

```
Σ links activos del movimiento + nuevo ≤ importe del movimiento
Σ links activos del recibo   + nuevo ≤ importe del recibo
cada allocation ≤ saldo (balance_amount) de su factura, misma moneda
Σ allocations = importe del link  (o link = importe del recibo si no hay allocations)
```

Contrato puro espejado y testeado en `lib/bank/intelligence/allocation-validation.ts`.

### Idempotencia / concurrencia

`FOR UPDATE` serializa confirmaciones del mismo movimiento. **Repetición idéntica**
(mismo movimiento↔recibo, mismo importe) → devuelve el link existente (`already_linked`)
sin escribir. **Conflicto** (misma clave, importe distinto) → `IDEMPOTENCY_CONFLICT`
(no devuelve un link incompatible en silencio). Reversión es idempotente (doble
reversión = no-op), archiva sin borrar, y marca la sugerencia como **`reversed`**
(preserva que SÍ fue confirmada; no vuelve a `pending_review`). El historial completo
vive en `reconciliation_events` (append-only; FKs `ON DELETE SET NULL`/`RESTRICT` → un
evento no desaparece por borrar/archivar otra entidad).

## Saldo sin aplicar

Un movimiento conciliado con recibo pero sin factura (pago adelantado / saldo a favor)
= link canónico con importe y **0 allocations**. `sin aplicar = importe del link − Σ
allocations activas`. Se muestra como "Sin aplicar" / "Saldo a favor" (nunca "vencido").

## Cardinalidades (ya cubiertas por FASE E)

1 mov → 1 recibo · 1 mov → N recibos · N mov → 1 recibo · 1 link → 1..N facturas
(vía allocations) · parcial · reversión. No se amplían cardinalidades: FASE E ya las cubre.

## Seguridad

RLS por workspace en todas las tablas (events solo SELECT/INSERT). La RPC valida que
movimiento/recibo/facturas pertenezcan al workspace (service_role omite RLS → la función
valida en código). Sin `anon`/`public`.

## Migraciones (NO aplicadas)

| Migración | Contenido | Aplicada |
|---|---|---|
| `20260719120000` | `bank_payer_identities` + `client_payer_links` | NO |
| `20260719120100` | `bank_reconciliation_suggestions` + `payment_allocations` + `reconciliation_events` | NO |
| `20260719120200` | RPCs `confirm/reverse_bank_reconciliation_v1` | NO |

Próximo: revisión manual de migraciones antes de aplicar (dev). Ver
`bank-reconciliation-rollout.md`.
