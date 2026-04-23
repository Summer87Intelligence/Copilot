# API Facturas de Clientes - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-clientes/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-clientes/

---

## Contenido

# API Facturas de Clientes

Esta API permite generar y consultar comprobantes asociados a clientes, incluyendo ventas, movimientos de stock y recibos de cobranza. Está orientada a la inserción de nuevos movimientos en el sistema y a la consulta posterior de comprobantes, saldos, detalles de venta y documentos emitidos.

La API no actualiza comprobantes existentes. Su implementación requiere conocer la configuración funcional de la empresa, incluyendo comprobantes, monedas, clientes, artículos, depósitos, cajas, vendedores, centros de costo y condiciones de pago.

## Casos de uso

-   Generar ventas contado y crédito.
-   Registrar notas de crédito y otros comprobantes correctivos.
-   Registrar movimientos de stock de clientes, como pedidos y remitos.
-   Registrar recibos de cobranza.
-   Consultar ventas emitidas y sus saldos pendientes.
-   Obtener el detalle de líneas de comprobantes de venta.
-   Recuperar la URL del PDF de un comprobante emitido.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapfacturaclientev4?wsdl](https://api.zetasoftware.com/z.apis.asoapfacturaclientev4?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapfacturaclientev4](https://api.zetasoftware.com/z.apis.asoapfacturaclientev4)

## Requisitos previos

-   Acceso habilitado a la API.
-   Configuración previa de comprobantes, monedas, clientes, artículos, cajas, locales y usuarios.
-   Conocimiento de los códigos internos utilizados por la empresa.
-   Definición correcta del tipo de comprobante a generar o consultar.

## Método Agregar

Permite generar nuevos comprobantes de clientes, incluyendo ventas contado, ventas crédito, notas correctivas, movimientos de stock y recibos de cobranza.

Este método genera el comprobante, pero no realiza su emisión electrónica. La emisión de un comprobante electrónico implica su firma, envío a DGI y envío al cliente, y debe realizarse posteriormente desde ZetaSoftware.

### Encabezado del comprobante

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoComprobante` | N(3) | Sí | Tipo de comprobante a generar. |
| `Serie` | T(6) | No | Serie del comprobante. Puede asignarse automáticamente según configuración. |
| `Numero` | N(10) | No | Número del comprobante. Puede asignarse automáticamente según configuración. |
| `Fecha` | AAAAMMDD | Sí | Fecha del comprobante. |
| `CodigoMoneda` | N(2) | Sí | Código de moneda. |
| `Cotizacion` | N(7.7) | No | Cotización de la moneda. |
| `CodigoCliente` | T(10) | Sí | Código del cliente. |
| `CodigoVendedor` | T(3) | No | Código del vendedor. |
| `CodigoPrecio` | N(3) | No | Código de lista de precios. |
| `CodigoCondicionPago` | N(3) | No | Aplica a comprobantes de venta crédito. |
| `CodigoDepositoOrigen` | N(3) | No | Depósito de origen. |
| `CodigoDepositoDestino` | N(3) | No | Depósito de destino. |
| `FechaEntrega` | AAAAMMDD | No | Fecha prevista de entrega. |
| `CodigoCentroCosto` | T(10) | No | Centro de costo asociado. |
| `CodigoReferencia` | N(10) | No | Referencia externa. |
| `Notas` | T(30) | No | Notas adicionales. En venta por cuenta ajena debe enviarse `#CUENTAAJENA`. |
| `TotalRecibo` | N(10.2) | No | Solo para recibos de cobranza. |
| `CodigoLocal` | N(3) | Sí | Código del local. |
| `CodigoUsuario` | N(3) | Sí | Código del usuario que realiza la operación. |
| `CodigoCaja` | N(3) | Sí | Código de la caja. |

### Datos eventuales del cliente

Estos datos complementan el encabezado del comprobante y son especialmente relevantes en operaciones con requisitos fiscales específicos o en ventas por cuenta ajena.

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `ClienteNombre` | T(100) | Obligatorio en venta por cuenta ajena. Debe corresponder al proveedor en ese caso. |
| `ClienteTipoDocumento` | T(1) | Tipo de documento. Obligatorio en venta por cuenta ajena. |
| `ClientePais` | T(3) | Código de país válido. Obligatorio en venta por cuenta ajena. |
| `ClienteDocumento` | T(30) | Sin puntos, guiones ni espacios. Obligatorio en determinadas condiciones fiscales o por cuenta ajena. |
| `ClienteDireccion` | T(100) | Dirección del cliente. |
| `ClienteDepartamento` | T(50) | Departamento del cliente. |
| `ClienteCiudad` | T(50) | Ciudad del cliente. |
| `ClienteCP` | N(10) | Código postal. |
| `ClienteTelefono` | T(30) | Teléfono del cliente. |
| `ClienteSucursal` | N(3) | Sucursal del cliente. |
| `ClienteEmail` | T(50) | Correo electrónico. |
| `ClienteEntrega` | T(100) | Dirección de entrega si difiere de la dirección principal. |

### Líneas del comprobante

Debe enviarse una línea por cada artículo o servicio incluido en el comprobante.

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `CodigoArticulo` | T(20) | Código del artículo o servicio. |
| `Concepto` | T(50) | Descripción del artículo o servicio. |
| `CodigoLote` | T(20) | Obligatorio si el artículo maneja lote. |
| `Vencimiento` | AAAAMMDD | Obligatorio si el artículo maneja vencimiento. |
| `Cantidad` | N(17.5) | Obligatorio. Debe ser mayor a cero. |
| `PrecioUnitario` | N(17.5) | Precio unitario. El cálculo de totales se realiza automáticamente. |
| `Descuento1` | N(5.2) | Primer descuento. |
| `Descuento2` | N(5.2) | Segundo descuento. |
| `Descuento3` | N(5.2) | Tercer descuento. |
| `CodigoIVA` | N(2) | Código de IVA aplicable. |
| `Notas` | T(1000) | Notas adicionales de la línea. |

### Formas de pago

Esta sección aplica según el tipo de comprobante y la modalidad de cobro o cancelación.

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `CodigoFormaPago` | N(3) | Obligatorio. Forma de pago. |
| `CodigoMonedaPago` | N(2) | Moneda del pago. |
| `MontoMonedaPago` | N(17.2) | Importe abonado en la moneda del pago. |
| `MontoMonedaMovimiento` | N(17.2) | Importe equivalente en la moneda del comprobante. |

#### Datos adicionales del documento de pago

-   `CodigoComprobante`
-   `Serie`
-   `Numero`
-   `FechaEmision`
-   `FechaVencimiento`
-   `Concepto`
-   `CodigoCaja`
-   `CodigoBancoFinanciera`
-   `CodigoCtaBancaria`
-   `Titular`
-   `NumeroTarjeta`
-   `AutorizacionTarjeta`
-   `PlanTarjeta`

### Resultado del método Agregar

```
OK
Error
Mensaje
```

## Método QueryVentas

Permite consultar comprobantes de venta y notas de crédito generados a clientes.

### Filtros

-   `Mes` – Obligatorio.
-   `Anio` – Obligatorio.
-   `FechaDesde`
-   `FechaHasta`
-   `DocSerie`
-   `NumeroDesde`
-   `NumeroHasta`
-   `ClienteCodigo`
-   `ComprobanteCodigo`
-   `MonedaCodigo`
-   `LocalCodigo`
-   `Page` – Obligatorio.

### Campos principales devueltos

-   `RegistroId`
-   `Fecha`
-   `ComprobanteCodigo`
-   `ComprobanteNombre`
-   `ComprobanteTipo`
-   `EsCFE`
-   `TipoDeCFECodigo`
-   `Serie`
-   `Numero`
-   `ClienteCodigo`
-   `ClienteNombre`
-   `MonedaCodigo`
-   `Total`
-   `Saldo`
-   `Emitido`
-   `UsuarioCodigo`
-   `RegistroFecha`
-   `RegistroHora`

## Método QueryMovimientosStock

Permite consultar comprobantes vinculados a movimientos de stock, como remitos y pedidos.

### Filtros

-   `Mes` – Obligatorio.
-   `Anio` – Obligatorio.
-   `FechaDesde`
-   `FechaHasta`
-   `Serie`
-   `NumeroDesde`
-   `NumeroHasta`
-   `ClienteCodigo`
-   `ComprobanteCodigo`
-   `MonedaCodigo`
-   `LocalCodigo`
-   `PendienteSN`

### Campos principales devueltos

-   `RegistroId`
-   `Fecha`
-   `ComprobanteCodigo`
-   `ComprobanteNombre`
-   `EsCFE`
-   `Serie`
-   `Numero`
-   `ClienteCodigo`
-   `ClienteNombre`
-   `MonedaCodigo`
-   `Subtotal`
-   `IVA`
-   `Total`
-   `Pendiente`
-   `Emitido`
-   `UsuarioCodigo`

## Método QuerySaldosPendientes

Permite consultar comprobantes con saldo pendiente, incluyendo ventas crédito y notas de crédito.

### Filtros

-   `ClienteCodigo`
-   `Id` – Debe enviarse vacío.
-   `ComprobanteCodigo`
-   `FechaDesde`
-   `FechaHasta`
-   `Serie`
-   `Numero`
-   `MonedaCodigo`
-   `LocalCodigo`
-   `SaldoDesde`
-   `SaldoHasta`
-   `Emitido`
-   `Page` – Obligatorio.

### Campos principales devueltos

-   `RegistroId`
-   `ComprobanteCodigo`
-   `ComprobanteAbreviacion`
-   `ComprobanteNombre`
-   `ClienteCodigo`
-   `ClienteNombre`
-   `Fecha`
-   `Serie`
-   `Numero`
-   `MonedaCodigo`
-   `Total`
-   `TotalSigno`
-   `Saldo`
-   `SaldoSigno`
-   `Emitido`
-   `Notas`

## Método Ventas

Devuelve un listado de comprobantes de venta a clientes, excluyendo movimientos de stock.

### Filtros

-   `Mes` – Obligatorio.
-   `Anio` – Obligatorio.
-   `Moneda` – Define la moneda de salida.

## Método VentasDetalladas

Permite obtener ventas con detalle de líneas de artículos. Este método debe ejecutarse como máximo una vez al día.

### Filtros

-   `Mes` – Obligatorio.
-   `Anio` – Obligatorio.
-   `Moneda` – Define la moneda de salida.

### Detalle adicional devuelto

-   `ArticuloCodigo`
-   `ArticuloNombre`
-   `MarcaCodigo`
-   `MarcaNombre`
-   `CategoriaArticuloCodigo`
-   `CategoriaArticuloNombre`
-   `FamiliaCodigo`
-   `FamiliaNombre`
-   `ProveedorArticuloCodigo`
-   `ProveedorArticuloNombre`
-   `ConceptoCodigo`
-   `ConceptoNombre`
-   `LineaConcepto`
-   `LineaLoteCodigo`
-   `LineaLoteVencimiento`
-   `LineaCantidad`
-   `LineaPrecioDigitado`
-   `LineaPrecio`
-   `LineaDtoPorcentaje1`
-   `LineaDtoPorcentaje2`
-   `LineaDtoPorcentaje3`
-   `IVACodigo`
-   `IVATasa`
-   `IVANombre`
-   `IVATipo`
-   `LineaPendienteRemision`
-   `LineaDescuentos`
-   `LineaSubtotal`
-   `LineaIVA`
-   `LineaTotal`

## Método VentaDetallada

Permite obtener el detalle completo de una venta específica a partir de `FacturaId`.

### Filtro

-   `FacturaId` – Obligatorio.

## Método URLPDF

Permite obtener la URL del PDF de un comprobante emitido.

### Parámetro de entrada

-   `FacturaId` – Obligatorio. Identificador único del comprobante.

### Resultado

-   `URLComprobante` – URL del PDF.
-   `MensajeError` – Mensaje devuelto si el comprobante no existe o no fue firmado electrónicamente.

## Observaciones

-   El método Agregar crea el comprobante, pero no lo emite electrónicamente.
-   La emisión debe realizarse luego desde ZetaSoftware.
-   Los totales se calculan automáticamente según configuración del comprobante y de la moneda.
-   Las ventas por cuenta ajena requieren datos eventuales del cliente y la nota `#CUENTAAJENA`.
-   El método VentasDetalladas debe ejecutarse como máximo una vez por día.

## Buenas prácticas de integración

-   Mantener una base de datos local para consultas frecuentes.
-   Evitar consultas generales sin filtros de fechas o rangos.
-   Usar consultas acotadas para reducir carga sobre la base principal.
-   No programar ejecuciones repetitivas ni múltiples veces por día.
-   Evitar ejecución automática durante horarios comerciales.
-   Persistir registros procesados para minimizar reprocesamiento.

[API Facturas de Clientes - PreviousAPI Cuotas Pendientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cuotas-de-cliente-y-proveedor/)[Next - API Facturas de ClientesAPI Facturas de Proveedores](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-proveedores/)

---

## Links relacionados

- [API Facturas de Clientes - PreviousAPI Cuotas Pendientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cuotas-de-cliente-y-proveedor/)
- [Next - API Facturas de ClientesAPI Facturas de Proveedores](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-proveedores/)

