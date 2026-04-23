# Matriz de cobertura — Copilot vs ZetaSoftware

**Fuente normativa:** `docs/zeta/catalog/zeta-capabilities.json` (catálogo interno) + código en `lib/integrations/zeta/` y `app/api/zeta/`.

**Leyenda estado integración (columna “integrado”)**

| Valor | Significado |
|-------|-------------|
| **sí** | Llamada HTTP real a Zeta en flujo productivo o import recurrente. |
| **pruebas** | Rutas `test-*` o diagnósticos sin persistencia operativa. |
| **no** | Sin implementación en repo. |

**Producción:** en este repo no hay despliegue declarado; “producción” se interpreta como *código listo para uso operativo* (APIs internas Copilot + pipelines). Ajustar según vuestro entorno real.

---

## Tabla principal

| dominio | capacidad (`id`) | método REST | método SOAP | documentado (md) | probado (código) | integrado | usado en producción¹ | prioridad siguiente | observaciones |
|---------|------------------|-------------|-------------|------------------|------------------|-----------|----------------------|---------------------|---------------|
| transversal | transversal_connection | — | — | sí | sí | sí | depende env | — | `buildZetaConnectionBlock`; no es un `REST*` con nombre. |
| transversal | transversal_protocols | (varios en Postman) | (legacy) | sí | parcial | parcial | depende env | baja | Política REST; ejemplo `RESTFacturaClienteV4QuerySaldosPendientes` en ayuda. |
| transversal | transversal_api_methods | — | — | sí | implícito | sí | depende env | — | Patrón `QueryIn` / paginación usado en clientes y saldos. |
| master | master_contacts | `RESTContactosV3Query` | `asoapcontactosv3` | sí | sí | sí | depende env | alta incremental | Ayuda SOAP; REST por Postman (comentarios en código). Import: `app/api/zeta/import-contacts-initial`. |
| master | master_contact_branches | *pendiente Postman* | `asoapcontactossucursalesv1` | sí | no | no | no | media | |
| master | master_commercial_data_client | *pendiente Postman* | `asoapclientev4` | sí | no | no | no | alta | Complementa CRM; sin código hoy. |
| master | master_commercial_data_supplier | *pendiente Postman* | `asoapproveedorv3` | sí | no | no | no | media | |
| transactional | transactional_customer_invoices | *otros ops no en código* | `asoapfacturaclientev4` | sí | no | parcial² | depende env | alta escritura | Solo subconjunto “saldos” integrado vía REST. |
| transactional | transactional_customer_pending_balances | `RESTFacturaClienteV4QuerySaldosPendientes` | `asoapfacturaclientev4` | sí | sí | sí | depende env | — | `zeta-factura-cliente.ts`, `zeta-saldos-pipeline.ts`, `test-connection`. |
| transactional | transactional_invoices_per_customer | *pendiente Postman* | `asoapcomprobantesclientev1` | sí | no | no | no | media | |
| transactional | transactional_installments | *pendiente Postman* | `asoapcuotasv1` | sí | no | no | no | media | |
| transactional | transactional_collection_receipts | *pendiente Postman* | `asoapreciboscobranzav2` | sí | no | no | no | media | |
| transactional | transactional_payment_receipts | *pendiente Postman* | `asoaprecibospagosv1` | sí | no | no | no | media | |
| transactional | transactional_cash_movements | *pendiente Postman* | `asoapmovimientoscajav1` | sí | no | no | no | media | |
| transactional | transactional_bank_movements | *pendiente Postman* | `asoapmovimientosbancariosv1` | sí | no | no | no | media | |
| accounting | accounting_balance | *pendiente Postman* | `asoapbalancev1` | sí | no | no | no | media | |
| accounting | accounting_entries_query | *pendiente Postman* | `asoapasientov1` | sí | no | no | no | media | |
| accounting | accounting_entries_inbox | *pendiente Postman* | `asoapbandejaentradaasientosv1` | sí | no | no | no | baja | |
| accounting | accounting_chart_of_accounts | *pendiente Postman* | `asoapplancuentasv2` | sí | no | no | no | media | |

¹ *Producción*: el repositorio no define entorno; marcar “depende env” donde el código existe y las credenciales definen si corre en prod.

² *Parcial*: la entidad “facturas cliente” tiene API amplia en documentación; Copilot solo consume **consulta de saldos pendientes** por REST.

---

## Rutas de código (referencia rápida)

| Método REST | Archivos relevantes |
|-------------|---------------------|
| `RESTContactosV3Query` | `lib/integrations/zeta/zeta-clients.ts`, `zeta-contacts-fetch.ts`, `app/api/zeta/clients/route.ts`, `app/api/zeta/test-clients/route.ts`, `app/api/zeta/import-contacts-initial/route.ts`, `zeta-client-mapper.ts` |
| `RESTFacturaClienteV4QuerySaldosPendientes` | `lib/integrations/zeta/zeta-factura-cliente.ts`, `zeta-saldos-pipeline.ts`, `app/api/zeta/test-connection/route.ts`, `app/api/copilot/integrations/zeta/sync-saldos-pendientes/route.ts` |
| Invocación genérica | `lib/integrations/zeta/zeta-invoke.ts`, `zeta-http-client.ts` |

---

## Brecha resumida

1. **REST:** solo 2 métodos REST explícitos en código; el markdown de muchas APIs detalla **SOAP** — completar nombres `REST*` vía **Postman oficial** (ZIP enlazado en ayuda) y volcar al catálogo.
2. **Maestro comercial:** datos comerciales cliente/proveedor y sucursales sin integración.
3. **Transaccional amplio:** caja, bancos, cuotas, recibos, comprobantes por cliente sin integración.
4. **Contable:** sin integración en código revisado.

---

*Última actualización del documento: alineada con el catálogo `zeta-capabilities.json` versión 1.0.0.*
