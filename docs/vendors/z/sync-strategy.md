# ZetaSoftware API — Sync Strategy

## Principios

- Zeta no debe consultarse en vivo por cada request de usuario.
- Persistir datos localmente.
- Usar sync incremental/acotado cuando la documentación lo permita.
- Evitar consultas completas frecuentes.
- Respetar `query-guidelines.md`.
- Usar jobs idempotentes.
- Guardar `last_sync_at`.
- Guardar `raw_payload`.
- Guardar logs de sync.

## Estrategia inicial recomendada

### Ventas / Facturas

- Sync por período cuando el endpoint use `Mes/Anio`.
- Evitar barridos históricos frecuentes.
- Ejecutar carga histórica inicial una sola vez.
- Luego sincronizar períodos recientes con frecuencia controlada.

### Saldos pendientes

- Consulta inicial completa solo una vez si la documentación lo permite.
- Luego consultar por `ClienteCodigo` o filtros disponibles.
- Marcar limitaciones cuando no haya fecha incremental documentada.

### Clientes

- `BLOQUEADO` hasta contar con endpoint oficial completo de clientes/contactos.

### Pagos/Cobros

- `BLOQUEADO` hasta contar con endpoint oficial completo de pagos/cobros.

## Idempotencia

Claves sugeridas:

- `tenant_id + external_id`
- `tenant_id + RegistroId` para saldos (si aplica)
- `tenant_id + FacturaId` para facturas (si aplica)

Si no hay ID claro en el endpoint:

- marcar `PENDIENTE`.

## Errores

- Retries con backoff solo para errores transitorios.
- No reintentar errores de validación.
- Loguear endpoint, tenant_id, rango consultado, status y error normalizado.
- Nunca loguear `Connection` completo ni claves.

## Frecuencia sugerida

No hay límites oficiales documentados en esta carpeta.

Enfoque conservador:

- Sync manual.
- Sync programado fuera de horario pico.
- Frecuencia configurable por tenant.

Rate limits oficiales:

- `PENDIENTE` (no documentados en fuentes operativas actuales).
