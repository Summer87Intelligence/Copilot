# Conciliación Bancaria Inteligente (FASE DOMAIN-IA-BANK-001)

Última actualización: 2026-07-17. Estado: **motor puro + migraciones no aplicadas + modo shadow (diseño)**.

## Problema

Banco debe conciliar movimientos de Santander con clientes/recibos/facturas aunque
el pagador no coincida con el nombre visible. Ej.: "El País" puede cobrar desde una
cuenta de "Pepito S.A." (misma cuenta paga por varias empresas del grupo). El
sistema debe **aprender** qué cuentas pagan por cada cliente, sin depender del nombre.

## Estado actual (auditoría)

| Entidad | Tabla | Fuente | Uso | Duplicación | Decisión |
|---|---|---|---|---|---|
| Movimiento | `bank_movements` (21 col) | import Santander | canónico | — | **CANÓNICA** |
| Legacy conciliación | `bank_reconciliation_movements` (26 col, 1 fila) | legacy | — | read-only | LEGACY (no escribir) |
| Conciliación N:M | `bank_movement_reconciliation_links` (FASE E) | Copilot | inline auditable | — | REUSAR/EXTENDER |
| Sugerencias inline | `bank_movement_match_suggestions` | Copilot | matching obligaciones | — | REUSAR |
| Recibo | `proto_receipts` | Zeta | cobro | — | CANÓNICA |
| Factura | `proto_invoices` | Zeta | documento/saldo | — | CANÓNICA |
| Cliente | `proto_companies` | Zeta | maestro | — | CANÓNICA |

Señales disponibles en `bank_movements`: `import_id` (lote), `bank_name`,
`account_label`, `description`/`raw_description` (payer), `bank_reference`,
`metadata` (jsonb), `amount`, `currency`, `direction`, `movement_date`.

## Entidades nuevas (migraciones aditivas, **NO aplicadas**)

- `bank_payer_identities` — identidad estable del pagador (huella por
  referencia/cuenta/documento; nombre solo ayuda; `masked_account` + `account_hash`,
  nunca cuenta completa).
- `client_payer_links` — relación **N:M** pagador↔cliente con `confidence` y `status`
  (detected/suggested/confirmed/learned/conflicted/inactive/rejected). No booleano.
- `bank_reconciliation_suggestions` — PROPUESTA por movimiento (cliente/pagador/recibo,
  confianza, `reasons`/`warnings`, estado, engine_version). **No es la fuente financiera**:
  la confirmación crea el link canónico (FASE E) vía RPC. Ver
  `bank-reconciliation-canonical-model.md`.
- `payment_allocations` — aplicación a factura(s), parcial/múltiple; Σ ≤ movimiento,
  ≤ saldo factura, ≤ importe recibo.
- `reconciliation_events` — trazabilidad append-only (sin secretos).

## Modelo de identidad / huella

⚠ **Corrección de auditoría (evidencia real Summer87):** `bank_reference` es
mayormente per-operación (674/942 distintas), **no** identidad de pagador; y
`account_label` = cuentas EASY propias (2 valores), **no** la cuenta origen. Por eso
se separan dos huellas en `lib/bank/intelligence/payer-fingerprint.ts`:

- **`deriveMovementFingerprint`** (dedup de operación): `bank_reference` + importe +
  fecha. NO identifica al pagador.
- **`derivePayerFingerprint`** (identidad estable): documento/RUT → cuenta ORIGEN del
  pagador (nunca `account_label` propio) → nombre normalizado (último recurso).
  **Nunca** usa `bank_reference` ni el nombre como identidad "estable" única.

Puro, versionado, sha256 truncado, cuenta siempre enmascarada.

Normalización de nombres: `lib/bank/intelligence/name-normalizer.ts` (conservador;
"PEPITO S.A." = "Pepito SA" = "P E P I T O S.A." → `pepito`; no une nombres distintos).

## Motor de matching (puro, determinístico, explicable)

`lib/bank/intelligence/reconciliation-matching.ts` — sin IA, sin DB, dinero en
**minor units** (enteros). Señales por peso:

1. pagador confirmado (+45) / aprendido (+10)
2. recibo Zeta coincidente (+35) + importe exacto (+10)
3. factura exacta / combinación (+10..)
4. proximidad de fecha (+5)
5. nombre normalizado (+5, último recurso)

Cada resultado incluye `reasons[]`, `warnings[]`, `confidence` y `recommendedAction`
(`AUTO_RECONCILE_CANDIDATE` / `REVIEW` / `UNIDENTIFIED` / `REJECT`).

### Niveles de confianza (versionado)

- ≥ 95 → candidato a conciliación automática (solo si no hay bloqueos)
- 75–94 → sugerencia para confirmar
- 40–74 → revisión necesaria
- < 40 → sin identificar

### Reglas de seguridad (nunca auto-conciliar)

moneda distinta · dos candidatos igualmente fuertes · cuenta que paga por varios
clientes sin otra señal · diferencia de importe no explicada · posible duplicado ·
recibo ya conciliado · factura ya pagada · sobre-aplicación · cruce de workspace ·
fecha fuera de rango · movimiento revertido · ingreso no comercial. Cubiertas por 15
casos de test.

## Explicabilidad (ejemplo)

```
Cliente sugerido: El País — Confianza: alta (96%)
✓ cuenta habitual confirmada  ✓ mismo recibo  ✓ mismo importe
✓ misma moneda  ✓ fechas próximas
⚠ esta cuenta también pagó por otro cliente una vez
```

## Estados en español (mapa)

sin analizar · sin identificar · sugerencia disponible · pendiente de confirmación ·
conciliado automáticamente · conciliado manualmente · conciliado parcialmente ·
diferencia detectada · duplicado · ignorado · revertido. Cobranza: "atrasado" /
"días de atraso" (nunca "vencido"; "fecha de vencimiento" solo para la fecha).

## Seguridad / RLS

Todas las tablas: workspace-scoped (companies.id), RLS SELECT/INSERT/UPDATE/DELETE por
`copilot_current_workspace_company_id()`, trigger `force_workspace` (la app usa
service_role → bypass conservando el workspace del servidor). Sin `anon`/`public`.
Aislamiento probado en el motor (cross-workspace → REJECT).

## Modo shadow (primera versión)

El motor **solo propone**: analiza, calcula confianza, explica; no confirma, no aplica
pagos, no cambia facturas/recibos/saldos. Persistir en `bank_reconciliation_suggestions`
con status `generated`/`pending_review` requiere aplicar las migraciones (autorización). Mientras tanto:
motor puro + fixtures + tests (no se simula persistencia falsa).

## UI (diseño)

- **Banco**: Resumen · Para revisar · Conciliados · Sin identificar · Diferencias ·
  Importaciones · Pagadores (importes UYU/USD separados). Fila "Para revisar" con
  pagador, cuenta enmascarada, cliente sugerido, recibo, factura(s), confianza,
  razones, estado, acciones (Confirmar/Cambiar/Distribuir/Ignorar).
- **Pagadores**: lista con clientes relacionados, confianza, total por moneda, estado,
  conflictos.
- **Cliente 360 → Cuentas y pagadores**: pagador, banco, cuenta enmascarada, relación,
  confianza, operaciones, total conciliado por moneda, último pago, estado.

Estas UIs se implementan **después** de aplicar migraciones (necesitan datos persistidos).

## Pendientes

Ver `docs/technical/bank-reconciliation-rollout.md`.
