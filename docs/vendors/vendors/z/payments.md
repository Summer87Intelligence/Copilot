# ZetaSoftware API — Pagos / Cobros

## Estado

Documentación parcial.

## Observación

El PDF menciona que RESTFacturaClienteV4Agregar también cubre Recibos de Cobro, además de facturas, notas correctivas, pedidos y remitos.

## Bloqueos

Antes de implementar pagos/cobros:

documentar comprobantes requeridos
documentar CodigoComprobante para recibos
documentar relación con facturas
documentar response
documentar reglas de cancelación/saldos
documentar si existe endpoint de consulta de pagos/cobros

## Regla interna

No inferir pagos completos únicamente desde saldos pendientes. Usar saldos como indicador financiero, no como historial completo de pagos salvo que la documentación lo confirme.
