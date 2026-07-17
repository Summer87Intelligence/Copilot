# Rollout — Conciliación Bancaria Inteligente (FASE DOMAIN-IA-BANK-001)

Estrategia por etapas, priorizando seguridad sobre automatización prematura. Cada
etapa requiere autorización explícita del usuario antes de avanzar.

## Etapa 0 — Auditoría (COMPLETA)

- Fuente canónica: `bank_movements`. Legacy read-only. N:M FASE E reutilizable.
- Señales de pagador identificadas (`bank_reference`/`account_label`/`description`/`metadata`).
- Motor puro + huella + normalizador implementados y testeados (25 tests).
- Migraciones aditivas creadas, **NO aplicadas**.

## Etapa 1 — Shadow (propuesta, sin escritura)

- Correr el motor sobre movimientos operativos → generar candidatos + confianza + razones.
- Comparar contra conciliaciones existentes (N:M FASE E) sin modificar nada.
- **Requiere:** aplicar migraciones (`20260719120000`, `20260719120100`, `20260719120200`)
  para persistir `bank_reconciliation_suggestions` (status `generated`/`pending_review`) y
  habilitar la RPC de confirmación. Sin ellas: solo motor + fixtures. La conciliación
  efectiva vive SOLO en `bank_movement_reconciliation_links` (ver canonical-model).
- Métrica objetivo: precisión por rango de confianza; % sin identificar; conflictos.

## Etapa 2 — Revisión manual asistida

- UI Banco "Para revisar": el usuario confirma/cambia/distribuye/ignora.
- Cada acción emite `reconciliation_events` y ajusta `client_payer_links` (aprendizaje).
- Confirmaciones aumentan la confianza del pagador para futuros pagos.

## Etapa 3 — Confirmación asistida (semi-auto)

- Candidatos ≥ 95 sin bloqueos: precargados para confirmación de 1 clic (no automáticos).
- El usuario sigue siendo el que confirma; reversible siempre.

## Etapa 4 — Automatización limitada (bajo métricas)

- Solo tras acumular métricas de precisión aceptable en un rango de confianza.
- Auto-conciliar únicamente: pagador confirmado + recibo exacto + moneda + fecha próxima,
  sin ninguno de los bloqueos de seguridad. Con evento y posibilidad de reversión.

## Etapa 5 — Automatización completa (futuro, condicionada)

- Solo si las métricas de las etapas previas lo justifican. Siempre auditable y reversible.

## Autorizaciones requeridas (explícitas)

| Acción | Requiere |
|---|---|
| Aplicar migraciones de pagadores/conciliación | autorización + `apply_migration` (archivo por archivo) |
| Correr shadow contra datos reales | autorización (lectura; escritura solo tras migración) |
| Habilitar confirmación asistida (UI) | autorización + migración aplicada |
| Rollout de auto-conciliación | autorización + métricas |
| Push / deploy | autorización |

## Invariante de seguridad permanente

Nunca auto-conciliar con: moneda distinta, candidatos empatados, cuenta multi-cliente
sin señal extra, diferencia de importe, duplicado, recibo ya conciliado, factura pagada,
sobre-aplicación, cruce de workspace, fecha fuera de rango, revertido, o ingreso no
comercial. La conciliación confirmada aparece en Banco, Cobranza y Cliente 360 leyendo
**la misma relación canónica** (sin duplicar entidades).
