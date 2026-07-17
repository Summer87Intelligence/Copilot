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

### Pendiente de autorización operativa

- Revalidar dry-run controlado (mismos IDs del dry-run anterior) tras la corrección.
- Shadow persist en lote pequeño.
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
