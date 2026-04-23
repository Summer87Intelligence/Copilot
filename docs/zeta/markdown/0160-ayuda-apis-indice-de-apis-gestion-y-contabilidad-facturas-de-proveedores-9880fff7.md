# API Facturas de Proveedores - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-proveedores/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-proveedores/

---

## Contenido

# API Facturas de Proveedores

Esta API permite incorporar comprobantes de proveedores, incluyendo compras contado, compras crédito, compras de gastos, notas correctivas, movimientos de stock de proveedores y recibos de pago. También expone métodos de consulta para compras, movimientos de stock y saldos pendientes.

La API está orientada a la generación de nuevos movimientos. No permite modificar comprobantes ya existentes.

## Casos de uso

-   Registrar compras contado y crédito.
-   Registrar compras de gastos y sus notas correctivas.
-   Incorporar pedidos y remitos de proveedores.
-   Registrar recibos de pago.
-   Consultar compras de proveedores por período.
-   Consultar movimientos de stock vinculados a proveedores.
-   Obtener comprobantes con saldo pendiente.
-   Obtener compras resumidas o detalladas para análisis e integración.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapfacturaproveedorv1?wsdl](https://api.zetasoftware.com/z.apis.asoapfacturaproveedorv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapfacturaproveedorv1](https://api.zetasoftware.com/z.apis.asoapfacturaproveedorv1)

## Requisitos previos

-   Acceso habilitado a la API.
-   Conocimiento de la configuración funcional de la empresa.
-   Disponibilidad de códigos válidos de comprobante, proveedor, moneda, condición de pago, depósitos, centro de costo, local, usuario y caja.
-   Validación previa de artículos, conceptos, IVA y formas de pago según el tipo de comprobante a registrar.

## Método Agregar

Permite generar nuevos comprobantes de proveedores, incluyendo compras contado, compras crédito, compras de gastos, notas correctivas, movimientos de stock y recibos de pago.

### Parámetros del encabezado

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoComprobante` | N(3) | Sí | Tipo de comprobante a generar. |
| `Serie` | T(6) | No | Serie del comprobante. |
| `Numero` | N(10) | No | Número del comprobante. |
| `Fecha` | AAAAMMDD | Sí | Fecha del comprobante. |
| `CodigoMoneda` | N(2) | Sí | Moneda del movimiento. |
| `Cotizacion` | N(7.7) | No | Cotización de la moneda. |
| `CodigoProveedor` | N(10) | No | Código del proveedor. |
| `CodigoCondicionPago` | N(3) | No | Condición de pago. |
| `CodigoDepositoOrigen` | N(3) | No | Depósito de origen. |
| `CodigoDepositoDestino` | N(3) | No | Depósito de destino. |
| `CodigoCentroCosto` | T(10) | No | Centro de costo asociado. |
| `CodigoReferencia` | N(10) | No | Referencia externa. |
| `Notas` | T(30) | No | Notas del comprobante. |
| `CodigoLocal` | N(3) | No | Código del local. |
| `CodigoUsuario` | N(3) | No | Código del usuario que registra la operación. |
| `CodigoCaja` | N(3) | No | Código de caja. |

### Líneas del comprobante

Debe enviarse una línea por cada artículo o concepto incluido en el comprobante.

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `CodigoArticulo` | T(20) / T(10) | Obligatorio. T(20) para artículos en compras. T(10) para conceptos en compras de gastos. |
| `Concepto` | T(50) | Descripción de la línea. |
| `CodigoLote` | T(20) | Obligatorio si el artículo opera con lotes. |
| `Vencimiento` | AAAA-MM-DD | Obligatorio si el artículo tiene vencimiento. |
| `Cantidad` | N(17.5) | Obligatorio. Debe ser mayor a cero. |
| `PrecioUnitario` | N(17.5) | Precio unitario. El sistema calcula neto, IVA y total según configuración. |
| `Descuento1` | N(5.2) | Descuento opcional. En compras de gastos debe ser cero. |
| `Descuento2` | N(5.2) | Descuento opcional. En compras de gastos debe ser cero. |
| `Descuento3` | N(5.2) | Descuento opcional. En compras de gastos debe ser cero. |
| `CodigoIVA` | N(2) | Código de IVA aplicable a la línea. |
| `Notas` | T(1000) | Observaciones adicionales de la línea. |

### Formas de pago

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `CodigoFormaPago` | N(3) | Forma de pago utilizada. |
| `CodigoMonedaPago` | N(2) | Moneda en la que se realiza el pago. |
| `MontoMonedaPago` | N(17.2) | Importe pagado en la moneda del pago. |
| `MontoMonedaMovimiento` | N(17.2) | Importe equivalente en la moneda del movimiento. |

### Resultado

```
Ok
Error
Mensaje
```

## Método QueryCompras

Permite consultar comprobantes de compra de un proveedor en un período determinado.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Mes` | T(MM) | Sí | Mes de la consulta. |
| `Anio` | T(AAAA) | Sí | Año de la consulta. |
| `FechaDesde` | AAAA-MM-DD | No | Fecha inicial. |
| `FechaHasta` | AAAA-MM-DD | No | Fecha final. |
| `ProveedorCodigo` | T(10) | Sí | Código del proveedor. |
| `ComprobanteCodigo` | N(3) | No | Tipo de comprobante. |
| `MonedaCodigo` | N(2) | No | Moneda del comprobante. |
| `LocalCodigo` | N(3) | No | Código del local. |
| `Page` | N(2) | Sí | Número de página. |

### Campos principales devueltos

```
RegistroId
Fecha
ComprobanteCodigo
ComprobanteNombre
ComprobanteTipo
ComprobanteTipoNombre
EsGasto
Serie
Numero
ProveedorCodigo
ProveedorNombre
ProveedorRazonSocial
ProveedorPaisCodigo
ProveedorPaisNombre
ProveedorDepartamentoCodigo
ProveedorDepartamentoNombre
ProveedorGrupoCodigo
ProveedorGrupoNombre
ProveedorGiroCodigo
ProveedorGiroNombre
ProveedorZonaCodigo
ProveedorZonaNombre
ProveedorCategoriaCodigo
ProveedorCategoriaNombre
MonedaCodigo
MonedaSimbolo
CotizacionEspecial
CondicionCodigo
CondicionNombre
LocalCodigo
LocalNombre
CajaCodigo
CajaNombre
CentroCostosCodigo
CentroCostosNombre
Referencia
DepositoOrigenCodigo
DepositoOrigenNombre
DepositoDestinoCodigo
DepositoDestinoNombre
Subtotal
SubtotalSigno
IVA
IVASigno
Total
TotalSigno
Saldo
SaldoSigno
Emitido
UsuarioCodigo
UsuarioNombre
RegistroFecha
RegistroHora
```

## Método QueryMovimientosStock

Permite consultar comprobantes asociados a movimientos de stock de proveedores, como remitos y pedidos.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Mes` | T(MM) | Sí | Mes de la consulta. |
| `Anio` | T(AAAA) | Sí | Año de la consulta. |
| `FechaDesde` | Date | No | Fecha inicial. |
| `FechaHasta` | Date | No | Fecha final. |
| `Serie` | String | No | Serie del comprobante. |
| `NumeroDesde` | Long | No | Número inicial. |
| `NumeroHasta` | Long | No | Número final. |
| `ProveedorCodigo` | String | No | Código del proveedor. |
| `ComprobanteCodigo` | Short | No | Tipo de comprobante. |
| `MonedaCodigo` | Byte | No | Código de moneda. |
| `LocalCodigo` | Short | No | Código del local. |
| `PendienteSN` | String | No | `S`, `N` o vacío. Indica si existen artículos pendientes. |

### Campos principales devueltos

```
RegistroId
Fecha
ComprobanteCodigo
ComprobanteNombre
EsCFE
Serie
Numero
ProveedorCodigo
ProveedorNombre
ProveedorRazonSocial
ProveedorPaisCodigo
ProveedorPaisNombre
ProveedorDepartamentoCodigo
ProveedorDepartamentoNombre
ProveedorGrupoCodigo
ProveedorGrupoNombre
ProveedorGiroCodigo
ProveedorGiroNombre
ProveedorZonaCodigo
ProveedorZonaNombre
ProveedorCategoriaCodigo
ProveedorCategoriaNombre
MonedaCodigo
MonedaSimbolo
CotizacionEspecial
PrecioVentaCodigo
PrecioVentaNombre
CondicionCodigo
CondicionNombre
VendedorCodigo
VendedorNombre
LocalCodigo
LocalNombre
CentroCostosCodigo
CentroCostosNombre
Referencia
DepositoOrigenCodigo
DepositoOrigenNombre
DepositoDestinoCodigo
DepositoDestinoNombre
Subtotal
IVA
Total
Pendiente
Emitido
Notas
UsuarioCodigo
UsuarioNombre
RegistroFecha
RegistroHora
```

## Método QuerySaldosPendientes

Permite consultar comprobantes de proveedores con saldo pendiente, incluyendo compras crédito y notas de crédito.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `ProveedorCodigo` | T(10) | No | Código del proveedor. Si se envía vacío, consulta todos los proveedores. |
| `Id` | – | Sí | Debe enviarse vacío. |
| `ComprobanteCodigo` | N(3) | No | Tipo de comprobante. |
| `FechaDesde` | AAAAMMDD | No | Fecha inicial. |
| `FechaHasta` | AAAAMMDD | No | Fecha final. |
| `Serie` | T(6) | No | Serie del comprobante. |
| `Numero` | N(10) | No | Número del comprobante. |
| `MonedaCodigo` | N(2) | No | Código de moneda. |
| `LocalCodigo` | N(4) | No | Código del local. |
| `SaldoDesde` | N(10) | No | Importe mínimo del saldo. |
| `SaldoHasta` | N(10) | No | Importe máximo del saldo. |
| `Emitido` | T(1) | No | `S`, `N` o vacío. |
| `Page` | N(2) | Sí | Número de página. |

### Campos devueltos

```
RegistroId
ComprobanteCodigo
ComprobanteAbreviacion
ComprobanteNombre
ComprobanteTipo
ComprobanteTipoNombre
ProveedorCodigo
ProveedorNombre
ProveedorRazonSocial
Fecha
Serie
Numero
MonedaCodigo
MonedaSimbolo
MonedaNombre
CondicionCodigo
CondicionNombre
LocalCodigo
LocalNombre
Total
TotalSigno
Saldo
SaldoSigno
Emitido
Notas
```

## Método Compras

Permite obtener un listado resumido de comprobantes de proveedores registrados en el sistema.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Mes` | T(MM) | Sí | Mes de la consulta. |
| `Anio` | T(AAAA) | Sí | Año de la consulta. |
| `Moneda` | N(2) | No | Moneda de salida. |

### Campos principales devueltos

```
FacturaId
FacturaFecha
FacturaDia
FacturaMes
FacturaAnio
MonedaCodigo
MonedaSimbolo
Cotizacion
ComprobanteCodigo
ComprobanteNombre
ComprobanteTipo
FacturaGastos
FacturaSigno
FacturaSerie
FacturaNumero
FacturaSerieNumero
LocalCodigo
LocalNombre
DepositoOrigenCodigo
DepositoOrigenNombre
DepositoDestinoCodigo
DepositoDestinoNombre
CajaCodigo
CajaNombre
CondicionPagoCodigo
CondicionPagoNombre
FacturaReferencia
CentroCostosCodigo
CentroCostosNombre
UsuarioCodigo
UsuarioNombre
FacturaRegistroFecha
FacturaRegistroHora
ProveedorCodigo
ProveedorNombre
ProveedorRazonSocial
GrupoCodigo
GrupoNombre
GiroCodigo
GiroNombre
PaisCodigo
PaisNombre
DepartamentoCodigo
DepartamentoNombre
ZonaCodigo
ZonaNombre
CategoriaCodigo
CategoriaNombre
FacturaDescuentos
FacturaSubtotal
FacturaIVA
FacturaTotal
FacturaSaldo
```

## Método ComprasDetalladas

Permite obtener compras con detalle de líneas de artículos o conceptos.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Mes` | T(MM) | Sí | Mes de la consulta. |
| `Anio` | T(AAAA) | Sí | Año de la consulta. |
| `Moneda` | N(2) | No | Si se envía vacío, contempla todas las monedas. |

### Encabezado del comprobante

```
FacturaId
FacturaFecha
FacturaDia
FacturaMes
FacturaAnio
MonedaCodigo
MonedaSimbolo
Cotizacion
ComprobanteCodigo
ComprobanteNombre
ComprobanteTipo
FacturaGastos
FacturaSigno
FacturaSerie
FacturaNumero
FacturaSerieNumero
LocalCodigo
LocalNombre
DepositoOrigenCodigo
DepositoOrigenNombre
DepositoDestinoCodigo
DepositoDestinoNombre
CajaCodigo
CajaNombre
CondicionPagoCodigo
CondicionPagoNombre
FacturaReferencia
CentroCostosCodigo
CentroCostosNombre
UsuarioCodigo
UsuarioNombre
FacturaRegistroFecha
FacturaRegistroHora
ProveedorCodigo
ProveedorNombre
ProveedorRazonSocial
GrupoCodigo
GrupoNombre
GiroCodigo
GiroNombre
PaisCodigo
PaisNombre
DepartamentoCodigo
DepartamentoNombre
ZonaCodigo
ZonaNombre
```

### Detalle de líneas

```
CategoriaCodigo
CategoriaNombre
ArticuloCodigo
ArticuloNombre
MarcaCodigo
MarcaNombre
CategoriaArticuloCodigo
CategoriaArticuloNombre
FamiliaCodigo
FamiliaNombre
ConceptoCodigo
ConceptoNombre
LineaConcepto
LineaLoteCodigo
LineaLoteVencimiento
LineaCantidad
LineaPrecioDigitado
LineaPrecio
LineaDtoPorcentaje1
LineaDtoPorcentaje2
LineaDtoPorcentaje3
IVACodigo
IVATasa
IVANombre
IVATipo
LineaPendienteRemision
LineaDescuentos
LineaSubtotal
LineaIVA
LineaTotal
```

## Observaciones

-   La API está diseñada para insertar nuevos movimientos. No permite modificación de comprobantes ya registrados.
-   En compras de gastos, los descuentos de línea deben enviarse en cero.
-   Los importes de las formas de pago deben ser consistentes con el total del movimiento.
-   Los cálculos de neto, IVA y total dependen de la configuración del comprobante, del proveedor y del IVA aplicado a cada línea.

## Consideraciones de integración

-   Validar previamente la configuración funcional de la empresa antes de utilizar el método `Agregar`.
-   Controlar códigos de proveedor, comprobante, moneda, IVA y forma de pago antes de enviar información al servicio.
-   Usar filtros de fechas, proveedor, moneda y local para reducir volumen de datos en consultas.

[API Facturas de Proveedores - PreviousAPI Facturas de Clientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-clientes/)[Next - API Facturas de ProveedoresAPI Movimientos Bancarios](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-bancarios/)

---

## Links relacionados

- [API Facturas de Proveedores - PreviousAPI Facturas de Clientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-clientes/)
- [Next - API Facturas de ProveedoresAPI Movimientos Bancarios](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-bancarios/)

