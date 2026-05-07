# ZetaSoftware API — Endpoints Index

Este índice resume endpoints y capacidades observadas en la documentación disponible en `docs/vendors/z/`.

## Endpoints documentados

| Endpoint / Capacidad | Propósito | Método HTTP | URL/Base path documentado | Input root | Output root | Fuente | Estado | Notas |
|---|---|---|---|---|---|---|---|---|
| `RESTFacturaClienteV4Agregar` | Agregar factura/comprobante de cliente | POST | `https://api.zetasoftware.com/rest/APIs/RESTFacturaClienteV4Agregar` | `AgregarIn` | PENDIENTE (no identificado explícitamente en docs actuales) | `invoices.md`, `examples.md`, `README.md` | DOCUMENTADO | Regla crítica: `Movimiento` como objeto (no array) según nota operativa. |
| `RESTFacturaClienteV4VentasDetalladas` | Consultar ventas detalladas por período | POST | `https://api.zetasoftware.com/APIs/RESTFacturaClienteV4VentasDetalladas` | `VentasDetalladasIn` | `VentasDetalladasOut` | `invoices.md`, `examples.md`, `README.md` | DOCUMENTADO | Usa `Mes` y `Anio` en `Data`. |
| `RESTQuerySaldoPendienteCliente` | Consultar saldos pendientes de clientes | POST | `https://api.zetasoftware.com/rest/APIs/RESTQuerySaldoPendienteCliente` | `QuerySaldosPendientesIn` | `QuerySaldosPendientesOut` | `invoices.md`, `examples.md`, `README.md` | DOCUMENTADO | Consulta global sin `ClienteCodigo` solo una vez según guía. |
| `RESTArticuloSave` (mencionado) | Operación sobre artículos (detalle no expandido en docs operativos) | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | `README.md` (fuentes oficiales usadas) | PARCIAL | Solo aparece como ejemplo mencionado en fuente esperada; falta contrato operativo local. |
| Clientes (sync completo) | Importar/sincronizar clientes/contactos | BLOQUEADO | BLOQUEADO | BLOQUEADO | BLOQUEADO | `clients.md` | BLOQUEADO | `clients.md` solo tiene campos indirectos observados, sin endpoint oficial completo. |
| Pagos/Cobros (sync completo) | Importar/sincronizar pagos y cobros | BLOQUEADO | BLOQUEADO | BLOQUEADO | BLOQUEADO | `payments.md` | BLOQUEADO | No hay endpoint completo documentado para flujo integral de pagos/cobros. |
| Webhooks | Recibir eventos push desde Zeta | BLOQUEADO | BLOQUEADO | BLOQUEADO | BLOQUEADO | `webhooks.md` | BLOQUEADO | No se encontró documentación de webhooks en fuentes iniciales. |

## Notas operativas

- Si un endpoint no tiene contrato completo (`request/response`) en esta carpeta, tratarlo como `PENDIENTE` o `BLOQUEADO`.
- No inventar output root cuando no está explícito en los documentos disponibles.
- Antes de implementar, validar base URL por proyecto/entorno.
