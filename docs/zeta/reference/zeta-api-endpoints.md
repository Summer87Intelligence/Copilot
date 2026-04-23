# Zeta API — Endpoints relevantes

Este documento resume la **colección Postman oficial** incluida en el repositorio, útil como mapa estructural de endpoints REST ZetaSoftware para el conector Copilot.

## Artefactos de referencia

| Archivo | Descripción |
|---------|-------------|
| `docs/zeta/reference/ZetaSoftware-REST-10-2025.json` | Colección exportada (**ZetaSoftware REST**, octubre 2025). |
| `docs/zeta/reference/Postman-Ejemplo-de-consultas.pdf` | Guía práctica *Postman: Ejemplo de consultas* (export PDF; enlaces a ayuda Zeta embebidos). |

**Ejemplos de JSON, observaciones y reglas implícitas:** [`zeta-postman-examples.md`](./zeta-postman-examples.md).

---

## Parámetros esperados (patrón general)

En esta colección, los `POST` a `{{baseUrl}}/APIs/{NombreMetodoREST}` (con `baseUrl` = `https://api.zetasoftware.com/rest`) suelen seguir:

1. **Clave raíz por operación:** `QueryIn`, `QuerySaldosPendientesIn`, `QueryComprobantesIn`, `SaveIn`, `LoadIn`, `DeleteIn`, `AgregarIn`, etc. No hay consultas estándar con raíz plana `{ Connection, Data }` en el export analizado.
2. **`Connection`:** credenciales de desarrollador + empresa + `RolCodigo`; la plantilla OpenAPI incluye también `UsuarioCodigo` / `UsuarioClave` (pueden omitirse en integraciones solo API si el gateway lo permite; validar en tenant).
3. **`Data`:** según método — muchas *Query* usan `Page` + `Filters`; **`RESTComprobantesClienteV1Query`** es una excepción: `Data` trae `ClienteCodigo`, `Mes`, `Anio`, `FechaDesde`, `FechaHasta` sin `Page`/`Filters`.

Los tipos `<string>`, `<integer>`, `<date>` en la colección son **placeholders** del contrato; en runtime muchos campos aceptan string numérico, pero un desajuste de **forma** (objeto vs string, o raíz incorrecta) suele producir **HTTP 400** genérico.

---

## Endpoints críticos (cliente / comprobantes / facturas / saldos)

| Dominio (extracto) | Método HTTP | Segmento REST | Raíz JSON body |
|----------------------|-------------|---------------|----------------|
| APIs › Datos Comerciales Cliente › RESTClienteV3Delete | POST | `RESTClienteV3Delete` | `DeleteIn` |
| APIs › Datos Comerciales Cliente › RESTClienteV3Load | POST | `RESTClienteV3Load` | `LoadIn` |
| APIs › Datos Comerciales Cliente › RESTClienteV3Query | POST | `RESTClienteV3Query` | `QueryIn` |
| APIs › Datos Comerciales Cliente › RESTClienteV3Save | POST | `RESTClienteV3Save` | `SaveIn` |
| APIs › Comprobantes por Cliente › RESTComprobantesClienteV1Query | POST | `RESTComprobantesClienteV1Query` | `QueryIn` |
| APIs › Comprobantes › RESTComprobantesV1Query | POST | `RESTComprobantesV1Query` | `QueryIn` |
| APIs › Sucursal del contacto › RESTContactosSucursalesV1Delete | POST | `RESTContactosSucursalesV1Delete` | `DeleteIn` |
| APIs › Sucursal del contacto › RESTContactosSucursalesV1Load | POST | `RESTContactosSucursalesV1Load` | `LoadIn` |
| APIs › Sucursal del contacto › RESTContactosSucursalesV1Query | POST | `RESTContactosSucursalesV1Query` | `QueryIn` |
| APIs › Sucursal del contacto › RESTContactosSucursalesV1Save | POST | `RESTContactosSucursalesV1Save` | `SaveIn` |
| APIs › Contactos › RESTContactosV3Delete | POST | `RESTContactosV3Delete` | `DeleteIn` |
| APIs › Contactos › RESTContactosV3Load | POST | `RESTContactosV3Load` | `LoadIn` |
| APIs › Contactos › RESTContactosV3Query | POST | `RESTContactosV3Query` | `QueryIn` |
| APIs › Contactos › RESTContactosV3Save | POST | `RESTContactosV3Save` | `SaveIn` |
| APIs › Cuotas Pendientes Clientes › RESTCuotasV1QueryCliente | POST | `RESTCuotasV1QueryCliente` | `QueryClienteIn` |
| APIs › Facturas de Clientes › RESTFacturaClienteV4Agregar | POST | `RESTFacturaClienteV4Agregar` | `AgregarIn` |
| APIs › Facturas de Clientes › RESTFacturaClienteV4QueryMovimientosStock | POST | `RESTFacturaClienteV4QueryMovimientosStock` | `QueryMovimientosStockIn` |
| APIs › Facturas de Clientes › RESTFacturaClienteV4QuerySaldosPendientes | POST | `RESTFacturaClienteV4QuerySaldosPendientes` | `QuerySaldosPendientesIn` |
| APIs › Facturas de Clientes › RESTFacturaClienteV4QueryVentas | POST | `RESTFacturaClienteV4QueryVentas` | `QueryVentasIn` |
| APIs › Facturas de Clientes › RESTFacturaClienteV4URLPDF | POST | `RESTFacturaClienteV4URLPDF` | `URLPDFIn` |
| APIs › Facturas de Clientes › RESTFacturaClienteV4VentaDetallada | POST | `RESTFacturaClienteV4VentaDetallada` | `VentaDetalladaIn` |
| APIs › Facturas de Clientes › RESTFacturaClienteV4Ventas | POST | `RESTFacturaClienteV4Ventas` | `VentasIn` |
| APIs › Facturas de Clientes › RESTFacturaClienteV4VentasDetalladas | POST | `RESTFacturaClienteV4VentasDetalladas` | `VentasDetalladasIn` |
| APIs › Facturas de Proveedores › RESTFacturaProveedorV1Agregar | POST | `RESTFacturaProveedorV1Agregar` | `AgregarIn` |
| APIs › Facturas de Proveedores › RESTFacturaProveedorV1Compras | POST | `RESTFacturaProveedorV1Compras` | `ComprasIn` |
| APIs › Facturas de Proveedores › RESTFacturaProveedorV1ComprasDetalladas | POST | `RESTFacturaProveedorV1ComprasDetalladas` | `ComprasDetalladasIn` |
| APIs › Facturas de Proveedores › RESTFacturaProveedorV1QueryCompras | POST | `RESTFacturaProveedorV1QueryCompras` | `QueryComprasIn` |
| APIs › Facturas de Proveedores › RESTFacturaProveedorV1QueryMovimientosStock | POST | `RESTFacturaProveedorV1QueryMovimientosStock` | `QueryMovimientosStockIn` |
| APIs › Facturas de Proveedores › RESTFacturaProveedorV1QuerySaldosPendientes | POST | `RESTFacturaProveedorV1QuerySaldosPendientes` | `QuerySaldosPendientesIn` |
| APIs › Grupos de Contactos › RESTGruposContactosV1Delete | POST | `RESTGruposContactosV1Delete` | `DeleteIn` |
| APIs › Grupos de Contactos › RESTGruposContactosV1Load | POST | `RESTGruposContactosV1Load` | `LoadIn` |
| APIs › Grupos de Contactos › RESTGruposContactosV1Query | POST | `RESTGruposContactosV1Query` | `QueryIn` |
| APIs › Grupos de Contactos › RESTGruposContactosV1Save | POST | `RESTGruposContactosV1Save` | `SaveIn` |
| APIs › Numeradores de Comprobantes › RESTNumeradoresV1Delete | POST | `RESTNumeradoresV1Delete` | `DeleteIn` |
| APIs › Numeradores de Comprobantes › RESTNumeradoresV1Load | POST | `RESTNumeradoresV1Load` | `LoadIn` |
| APIs › Numeradores de Comprobantes › RESTNumeradoresV1Query | POST | `RESTNumeradoresV1Query` | `QueryIn` |
| APIs › Numeradores de Comprobantes › RESTNumeradoresV1Save | POST | `RESTNumeradoresV1Save` | `SaveIn` |
| APIs › Origen de los Contactos › RESTOrigenContactosV1Delete | POST | `RESTOrigenContactosV1Delete` | `DeleteIn` |
| APIs › Origen de los Contactos › RESTOrigenContactosV1Load | POST | `RESTOrigenContactosV1Load` | `LoadIn` |
| APIs › Origen de los Contactos › RESTOrigenContactosV1Query | POST | `RESTOrigenContactosV1Query` | `QueryIn` |
| APIs › Origen de los Contactos › RESTOrigenContactosV1Save | POST | `RESTOrigenContactosV1Save` | `SaveIn` |
| APIs › Recibo de Cobro › RESTRecibosCobranzaV2QueryComprobantes | POST | `RESTRecibosCobranzaV2QueryComprobantes` | `QueryComprobantesIn` |
| APIs › Recibo de Pago › RESTRecibosPagosV1QueryComprobantes | POST | `RESTRecibosPagosV1QueryComprobantes` | `QueryComprobantesIn` |
| APIs › Tarjetas Recibidas › RESTVouchersV1Query | POST | `RESTVouchersV1Query` | `QueryIn` |

---

## Listado por dominio (agrupación carpeta Postman)

### Artículos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTArticulosV3CamposAdicionales` | `CamposAdicionalesIn` |
| REST Service | POST | `RESTArticulosV3Delete` | `DeleteIn` |
| REST Service | POST | `RESTArticulosV3Load` | `LoadIn` |
| REST Service | POST | `RESTArticulosV3Query` | `QueryIn` |
| REST Service | POST | `RESTArticulosV3Save` | `SaveIn` |

### Auxiliares

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTAuxiliaresV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTAuxiliaresV1Load` | `LoadIn` |
| REST Service | POST | `RESTAuxiliaresV1Query` | `QueryIn` |
| REST Service | POST | `RESTAuxiliaresV1Save` | `SaveIn` |

### Balance Contable

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTBalanceV1Query` | `QueryIn` |

### Bancos y Financieras

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTBancosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTBancosV1Load` | `LoadIn` |
| REST Service | POST | `RESTBancosV1Query` | `QueryIn` |
| REST Service | POST | `RESTBancosV1Save` | `SaveIn` |

### Bandeja Entrada Asientos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTBandejaEntradaAsientosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTBandejaEntradaAsientosV1Load` | `LoadIn` |
| REST Service | POST | `RESTBandejaEntradaAsientosV1Query` | `QueryIn` |
| REST Service | POST | `RESTBandejaEntradaAsientosV1Save` | `SaveIn` |

### Cajas

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCajasV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTCajasV1Load` | `LoadIn` |
| REST Service | POST | `RESTCajasV1Query` | `QueryIn` |
| REST Service | POST | `RESTCajasV1Save` | `SaveIn` |

### Campañas

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCampaniasV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTCampaniasV1Load` | `LoadIn` |
| REST Service | POST | `RESTCampaniasV1Query` | `QueryIn` |
| REST Service | POST | `RESTCampaniasV1Save` | `SaveIn` |

### Campos Adicionales

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCamposAdicionalesV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTCamposAdicionalesV1Load` | `LoadIn` |
| REST Service | POST | `RESTCamposAdicionalesV1Query` | `QueryIn` |
| REST Service | POST | `RESTCamposAdicionalesV1Save` | `SaveIn` |

### Categoría de Contratos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCategoriasContratosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTCategoriasContratosV1Load` | `LoadIn` |
| REST Service | POST | `RESTCategoriasContratosV1Query` | `QueryIn` |
| REST Service | POST | `RESTCategoriasContratosV1Save` | `SaveIn` |

### Categorías de Artículos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCategoriasArticulosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTCategoriasArticulosV1Load` | `LoadIn` |
| REST Service | POST | `RESTCategoriasArticulosV1Query` | `QueryIn` |
| REST Service | POST | `RESTCategoriasArticulosV1Save` | `SaveIn` |

### Categorías de Oportunidades

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCategoriasOportunidadesV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTCategoriasOportunidadesV1Load` | `LoadIn` |
| REST Service | POST | `RESTCategoriasOportunidadesV1Query` | `QueryIn` |
| REST Service | POST | `RESTCategoriasOportunidadesV1Save` | `SaveIn` |

### Categorías de Proveedores

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCategoriasProveedoresV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTCategoriasProveedoresV1Load` | `LoadIn` |
| REST Service | POST | `RESTCategoriasProveedoresV1Query` | `QueryIn` |
| REST Service | POST | `RESTCategoriasProveedoresV1Save` | `SaveIn` |

### Centros de Costo

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCentrosCostoV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTCentrosCostoV1Load` | `LoadIn` |
| REST Service | POST | `RESTCentrosCostoV1Query` | `QueryIn` |
| REST Service | POST | `RESTCentrosCostoV1Save` | `SaveIn` |

### CFEs Recibidos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCFEsRecibidosV1CFERecibidoDetalle` | `CFERecibidoDetalleIn` |
| REST Service | POST | `RESTCFEsRecibidosV1CFEsRecibidos` | `CFEsRecibidosIn` |

### Cheques Recibidos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTChequesRecibidosV1Query` | `QueryIn` |

### Comprobantes

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTComprobantesV1Query` | `QueryIn` |

### Comprobantes por Cliente

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTComprobantesClienteV1Query` | `QueryIn` |

### Conceptos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTConceptosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTConceptosV1Load` | `LoadIn` |
| REST Service | POST | `RESTConceptosV1Query` | `QueryIn` |
| REST Service | POST | `RESTConceptosV1Save` | `SaveIn` |

### Condiciones de Pago

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCondicionesPagoV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTCondicionesPagoV1Load` | `LoadIn` |
| REST Service | POST | `RESTCondicionesPagoV1Query` | `QueryIn` |
| REST Service | POST | `RESTCondicionesPagoV1Save` | `SaveIn` |

### Consulta de Asientos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTAsientoV1Lista` | `ListaIn` |

### Contactos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTContactosV3Delete` | `DeleteIn` |
| REST Service | POST | `RESTContactosV3Load` | `LoadIn` |
| REST Service | POST | `RESTContactosV3Query` | `QueryIn` |
| REST Service | POST | `RESTContactosV3Save` | `SaveIn` |

### Cotización de Monedas

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTMonedasCotizacionesV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTMonedasCotizacionesV1Load` | `LoadIn` |
| REST Service | POST | `RESTMonedasCotizacionesV1Query` | `QueryIn` |
| REST Service | POST | `RESTMonedasCotizacionesV1Save` | `SaveIn` |

### Cuentas Bancarias

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCuentasV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTCuentasV1Load` | `LoadIn` |
| REST Service | POST | `RESTCuentasV1Query` | `QueryIn` |
| REST Service | POST | `RESTCuentasV1Save` | `SaveIn` |

### Cuotas Pendientes Clientes

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCuotasV1QueryCliente` | `QueryClienteIn` |

### Cuotas Pendientes Proveedor

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTCuotasV1QueryProveedor` | `QueryProveedorIn` |

### Datos Comerciales Cliente

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTClienteV3Delete` | `DeleteIn` |
| REST Service | POST | `RESTClienteV3Load` | `LoadIn` |
| REST Service | POST | `RESTClienteV3Query` | `QueryIn` |
| REST Service | POST | `RESTClienteV3Save` | `SaveIn` |

### Datos Comerciales Proveedor

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTProveedorV2Delete` | `DeleteIn` |
| REST Service | POST | `RESTProveedorV2Load` | `LoadIn` |
| REST Service | POST | `RESTProveedorV2Query` | `QueryIn` |
| REST Service | POST | `RESTProveedorV2Save` | `SaveIn` |

### Departamentos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTDepartamentosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTDepartamentosV1Load` | `LoadIn` |
| REST Service | POST | `RESTDepartamentosV1Query` | `QueryIn` |
| REST Service | POST | `RESTDepartamentosV1Save` | `SaveIn` |

### Depósitos de Stock

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTDepositosStockV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTDepositosStockV1Load` | `LoadIn` |
| REST Service | POST | `RESTDepositosStockV1Query` | `QueryIn` |
| REST Service | POST | `RESTDepositosStockV1Save` | `SaveIn` |

### Ejercicios Contables

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTEjerciciosV1Query` | `QueryIn` |

### Eliminar Remito

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTEliminarRemitoV1WSEliminarRemito` | `WSEliminarRemitoIn` |

### Estados de Oportunidades

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTEstadosOportunidadesV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTEstadosOportunidadesV1Load` | `LoadIn` |
| REST Service | POST | `RESTEstadosOportunidadesV1Query` | `QueryIn` |
| REST Service | POST | `RESTEstadosOportunidadesV1Save` | `SaveIn` |

### Facturas de Clientes

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTFacturaClienteV4Agregar` | `AgregarIn` |
| REST Service | POST | `RESTFacturaClienteV4QueryMovimientosStock` | `QueryMovimientosStockIn` |
| REST Service | POST | `RESTFacturaClienteV4QuerySaldosPendientes` | `QuerySaldosPendientesIn` |
| REST Service | POST | `RESTFacturaClienteV4QueryVentas` | `QueryVentasIn` |
| REST Service | POST | `RESTFacturaClienteV4URLPDF` | `URLPDFIn` |
| REST Service | POST | `RESTFacturaClienteV4VentaDetallada` | `VentaDetalladaIn` |
| REST Service | POST | `RESTFacturaClienteV4VentasDetalladas` | `VentasDetalladasIn` |
| REST Service | POST | `RESTFacturaClienteV4Ventas` | `VentasIn` |

### Facturas de Proveedores

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTFacturaProveedorV1Agregar` | `AgregarIn` |
| REST Service | POST | `RESTFacturaProveedorV1ComprasDetalladas` | `ComprasDetalladasIn` |
| REST Service | POST | `RESTFacturaProveedorV1Compras` | `ComprasIn` |
| REST Service | POST | `RESTFacturaProveedorV1QueryCompras` | `QueryComprasIn` |
| REST Service | POST | `RESTFacturaProveedorV1QueryMovimientosStock` | `QueryMovimientosStockIn` |
| REST Service | POST | `RESTFacturaProveedorV1QuerySaldosPendientes` | `QuerySaldosPendientesIn` |

### Familias de Artículos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTFamiliasV2Delete` | `DeleteIn` |
| REST Service | POST | `RESTFamiliasV2Load` | `LoadIn` |
| REST Service | POST | `RESTFamiliasV2Query` | `QueryIn` |
| REST Service | POST | `RESTFamiliasV2Save` | `SaveIn` |

### Formas de Pago

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTFormasPagoV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTFormasPagoV1Load` | `LoadIn` |
| REST Service | POST | `RESTFormasPagoV1Query` | `QueryIn` |
| REST Service | POST | `RESTFormasPagoV1Save` | `SaveIn` |

### Formatos de Impresión

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTFormatosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTFormatosV1Load` | `LoadIn` |
| REST Service | POST | `RESTFormatosV1Query` | `QueryIn` |
| REST Service | POST | `RESTFormatosV1Save` | `SaveIn` |

### Foto de Artículo

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTArticuloFotoV1ObtenerFoto` | `ObtenerFotoIn` |

### Giros Comerciales

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTGirosComercialesV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTGirosComercialesV1Load` | `LoadIn` |
| REST Service | POST | `RESTGirosComercialesV1Query` | `QueryIn` |
| REST Service | POST | `RESTGirosComercialesV1Save` | `SaveIn` |

### Grupos de Conceptos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTGruposConceptosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTGruposConceptosV1Load` | `LoadIn` |
| REST Service | POST | `RESTGruposConceptosV1Query` | `QueryIn` |
| REST Service | POST | `RESTGruposConceptosV1Save` | `SaveIn` |

### Grupos de Contactos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTGruposContactosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTGruposContactosV1Load` | `LoadIn` |
| REST Service | POST | `RESTGruposContactosV1Query` | `QueryIn` |
| REST Service | POST | `RESTGruposContactosV1Save` | `SaveIn` |

### Grupos de Cuentas

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTGruposCuentasV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTGruposCuentasV1Load` | `LoadIn` |
| REST Service | POST | `RESTGruposCuentasV1Query` | `QueryIn` |
| REST Service | POST | `RESTGruposCuentasV1Save` | `SaveIn` |

### Listas de Precios

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTListasV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTListasV1Load` | `LoadIn` |
| REST Service | POST | `RESTListasV1QueryPrecios` | `QueryPreciosIn` |
| REST Service | POST | `RESTListasV1Query` | `QueryIn` |
| REST Service | POST | `RESTListasV1Save` | `SaveIn` |

### Locales Comerciales

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTLocalesComercialesV1Query` | `QueryIn` |

### Marcas

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTMarcasV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTMarcasV1Load` | `LoadIn` |
| REST Service | POST | `RESTMarcasV1Query` | `QueryIn` |
| REST Service | POST | `RESTMarcasV1Save` | `SaveIn` |

### Monedas

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTMonedasV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTMonedasV1Load` | `LoadIn` |
| REST Service | POST | `RESTMonedasV1Query` | `QueryIn` |
| REST Service | POST | `RESTMonedasV1Save` | `SaveIn` |

### Motivos de Pérdidas

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTMotivosPerdidasV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTMotivosPerdidasV1Load` | `LoadIn` |
| REST Service | POST | `RESTMotivosPerdidasV1Query` | `QueryIn` |
| REST Service | POST | `RESTMotivosPerdidasV1Save` | `SaveIn` |

### Movimientos Bancarios

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTMovimientosBancariosV1Query` | `QueryIn` |

### Movimientos de Artículos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTMovimientosArticuloV3Query` | `QueryIn` |

### Movimientos de Caja

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTMovimientosCajaV1Query` | `QueryIn` |

### Numeradores de Comprobantes

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTNumeradoresV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTNumeradoresV1Load` | `LoadIn` |
| REST Service | POST | `RESTNumeradoresV1Query` | `QueryIn` |
| REST Service | POST | `RESTNumeradoresV1Save` | `SaveIn` |

### Numeradores de Impresión

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTFanfoldV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTFanfoldV1Load` | `LoadIn` |
| REST Service | POST | `RESTFanfoldV1Query` | `QueryIn` |
| REST Service | POST | `RESTFanfoldV1Save` | `SaveIn` |

### Números de RUT

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTRUTV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTRUTV1Load` | `LoadIn` |
| REST Service | POST | `RESTRUTV1Query` | `QueryIn` |
| REST Service | POST | `RESTRUTV1Save` | `SaveIn` |

### Origen de los Contactos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTOrigenContactosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTOrigenContactosV1Load` | `LoadIn` |
| REST Service | POST | `RESTOrigenContactosV1Query` | `QueryIn` |
| REST Service | POST | `RESTOrigenContactosV1Save` | `SaveIn` |

### Países

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTPaisesV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTPaisesV1Load` | `LoadIn` |
| REST Service | POST | `RESTPaisesV1Query` | `QueryIn` |
| REST Service | POST | `RESTPaisesV1Save` | `SaveIn` |

### Plan de Cuentas

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTPlanCuentasV2Query` | `QueryIn` |

### Precio Base y Precio de Venta

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTPreciosArticulosV2GrabarPrecioBase` | `GrabarPrecioBaseIn` |
| REST Service | POST | `RESTPreciosArticulosV2ObtenerPrecioBase` | `ObtenerPrecioBaseIn` |
| REST Service | POST | `RESTPreciosArticulosV2ObtenerPrecioVenta` | `ObtenerPrecioVentaIn` |

### Precios Base

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTPreciosBaseV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTPreciosBaseV1Load` | `LoadIn` |
| REST Service | POST | `RESTPreciosBaseV1Query` | `QueryIn` |
| REST Service | POST | `RESTPreciosBaseV1Save` | `SaveIn` |

### Precios de Venta

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTPreciosVentaV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTPreciosVentaV1Load` | `LoadIn` |
| REST Service | POST | `RESTPreciosVentaV1Query` | `QueryIn` |
| REST Service | POST | `RESTPreciosVentaV1Save` | `SaveIn` |

### Recibo de Cobro

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTRecibosCobranzaV2Data` | `DataIn` |
| REST Service | POST | `RESTRecibosCobranzaV2Load` | `LoadIn` |
| REST Service | POST | `RESTRecibosCobranzaV2QueryComprobantes` | `QueryComprobantesIn` |
| REST Service | POST | `RESTRecibosCobranzaV2QueryPendientes` | `QueryPendientesIn` |
| REST Service | POST | `RESTRecibosCobranzaV2Save` | `SaveIn` |

### Recibo de Pago

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTRecibosPagosV1Data` | `DataIn` |
| REST Service | POST | `RESTRecibosPagosV1Load` | `LoadIn` |
| REST Service | POST | `RESTRecibosPagosV1QueryComprobantes` | `QueryComprobantesIn` |
| REST Service | POST | `RESTRecibosPagosV1QueryPendientes` | `QueryPendientesIn` |
| REST Service | POST | `RESTRecibosPagosV1Save` | `SaveIn` |

### Referencias

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTReferenciasV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTReferenciasV1Load` | `LoadIn` |
| REST Service | POST | `RESTReferenciasV1Query` | `QueryIn` |
| REST Service | POST | `RESTReferenciasV1Save` | `SaveIn` |

### Retenciones y Percepciones

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTRetencionesPercepcionesV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTRetencionesPercepcionesV1Load` | `LoadIn` |
| REST Service | POST | `RESTRetencionesPercepcionesV1Query` | `QueryIn` |
| REST Service | POST | `RESTRetencionesPercepcionesV1Save` | `SaveIn` |

### Roles de Usuarios

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTUsuariosEmpresaV1Query` | `QueryIn` |

### Stock Actual

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTStockActualArticuloV1Query` | `QueryIn` |
| REST Service | POST | `RESTStockActualV1Query` | `QueryIn` |
| REST Service | POST | `RESTStockActualV2Query` | `QueryIn` |
| REST Service | POST | `RESTStockActualV2StockActualModificado` | `StockActualModificadoIn` |
| REST Service | POST | `RESTStockActualV3Query` | `QueryIn` |
| REST Service | POST | `RESTStockActualV3StockActualModificado` | `StockActualModificadoIn` |

### Sucursal del contacto

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTContactosSucursalesV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTContactosSucursalesV1Load` | `LoadIn` |
| REST Service | POST | `RESTContactosSucursalesV1Query` | `QueryIn` |
| REST Service | POST | `RESTContactosSucursalesV1Save` | `SaveIn` |

### Tarjetas Recibidas

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTVouchersV1Query` | `QueryIn` |

### Tasas de IVA

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTTasasIVAV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTTasasIVAV1Load` | `LoadIn` |
| REST Service | POST | `RESTTasasIVAV1Query` | `QueryIn` |
| REST Service | POST | `RESTTasasIVAV1Save` | `SaveIn` |

### Textos Predefinidos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTTextosPredefinidosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTTextosPredefinidosV1Load` | `LoadIn` |
| REST Service | POST | `RESTTextosPredefinidosV1Query` | `QueryIn` |
| REST Service | POST | `RESTTextosPredefinidosV1Save` | `SaveIn` |

### Tipos de Asientos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTTiposAsientosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTTiposAsientosV1Load` | `LoadIn` |
| REST Service | POST | `RESTTiposAsientosV1Query` | `QueryIn` |
| REST Service | POST | `RESTTiposAsientosV1Save` | `SaveIn` |

### Tipos de CFE

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTTipoCFEV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTTipoCFEV1Load` | `LoadIn` |
| REST Service | POST | `RESTTipoCFEV1Query` | `QueryIn` |
| REST Service | POST | `RESTTipoCFEV1Save` | `SaveIn` |

### Tipos de Descuentos

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTDescuentosV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTDescuentosV1Load` | `LoadIn` |
| REST Service | POST | `RESTDescuentosV1Query` | `QueryIn` |
| REST Service | POST | `RESTDescuentosV1Save` | `SaveIn` |

### Unidades de Stock

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTUnidadesStockV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTUnidadesStockV1Load` | `LoadIn` |
| REST Service | POST | `RESTUnidadesStockV1Query` | `QueryIn` |
| REST Service | POST | `RESTUnidadesStockV1Save` | `SaveIn` |

### Vendedores y Cobradores

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTVendedoresV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTVendedoresV1Load` | `LoadIn` |
| REST Service | POST | `RESTVendedoresV1Query` | `QueryIn` |
| REST Service | POST | `RESTVendedoresV1Save` | `SaveIn` |

### Ventajas Competitivas

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTVentajasCompetitivasV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTVentajasCompetitivasV1Load` | `LoadIn` |
| REST Service | POST | `RESTVentajasCompetitivasV1Query` | `QueryIn` |
| REST Service | POST | `RESTVentajasCompetitivasV1Save` | `SaveIn` |

### Zonas

| Nombre request | HTTP | Segmento REST | Raíz body |
|----------------|------|---------------|-----------|
| REST Service | POST | `RESTZonasV1Delete` | `DeleteIn` |
| REST Service | POST | `RESTZonasV1Load` | `LoadIn` |
| REST Service | POST | `RESTZonasV1Query` | `QueryIn` |
| REST Service | POST | `RESTZonasV1Save` | `SaveIn` |

