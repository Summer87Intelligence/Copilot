# ZetaSoftware API — Facturas / Ventas / Saldos

## Base URL observada

PDF:
https://api.zetasoftware.com/rest/APIs/

Postman collection:
{{baseUrl}}/APIs/<Metodo>

## Regla

Validar configuración exacta de baseUrl por proyecto antes de implementar.

## RESTFacturaClienteV4Agregar

### Descripción

Permite agregar una nueva factura de cliente al sistema.

El PDF indica que este método se especializa en generación de comprobantes como:

Venta Contado
Venta Crédito
Notas correctivas
Movimientos de Stock de clientes
Pedidos
Remitos
Recibos de Cobro

### Método

POST

### URL observada

https://api.zetasoftware.com/rest/APIs/RESTFacturaClienteV4Agregar

### Entrada raíz

AgregarIn

### Data

Incluye Movimiento.

### Advertencia crítica

Para RESTFacturaClienteV4Agregar y RESTFacturaProveedorV1Agregar, el PDF indica que se deben eliminar los arrays [] que abren y cierran los filtros de Movimiento.

Regla interna:
Movimiento debe enviarse como objeto, no como array, salvo que documentación oficial posterior indique otra cosa.

### Campos observados en Movimiento
CodigoComprobante
Fecha
CodigoMoneda
CodigoCliente
CodigoDepositoOrigen
CodigoDepositoDestino
CodigoReferencia
Notas
CodigoLocal
CodigoCaja
CodigoUsuario
Lineas

### Campos observados en Lineas
CodigoArticulo
Concepto
Cantidad
PrecioUnitario
Descuento1
Descuento2
Descuento3
CodigoIVA
Notas

## RESTFacturaClienteV4VentasDetalladas

### Descripción

Devuelve detalle de ventas realizadas en un período, incluyendo líneas de artículos.

### Método

POST

### URL observada

https://api.zetasoftware.com/APIs/RESTFacturaClienteV4VentasDetalladas

### Entrada raíz

VentasDetalladasIn

### Data
Mes
Anio

### Response raíz

VentasDetalladasOut

### Campos relevantes observados
FacturaId
FacturaFecha
FacturaNumero
FacturaSerie
FacturaSerieNumero
FacturaSigno
ClienteCodigo
ClienteNombre
ClienteRazonSocial
ComprobanteCodigo
ComprobanteNombre
ComprobanteTipo
MonedaCodigo
MonedaSimbolo
LineaCantidad
LineaConcepto
LineaPrecio
LineaSubtotal
LineaIVA
LineaTotal
IVACodigo
IVANombre
IVATasa
ArticuloCodigo
ArticuloNombre
VendedorCodigo
VendedorNombre
LocalCodigo
LocalNombre

## RESTQuerySaldoPendienteCliente

### Descripción

Consulta saldos impagos por cliente. Permite obtener comprobantes con saldo pendiente.

### Método

POST

### URL observada

https://api.zetasoftware.com/rest/APIs/RESTQuerySaldoPendienteCliente

### Entrada raíz

QuerySaldosPendientesIn

### Data
Page
Filters.ClienteCodigo

### Nota

ClienteCodigo puede dejarse vacío para obtener todos, pero la documentación indica que una consulta total debe hacerse solo una vez.

### Response raíz

QuerySaldosPendientesOut

### Campos relevantes observados
IsLastPage
Succeed
Response
ClienteCodigo
ClienteNombre
ClienteRazonSocial
ComprobanteCodigo
ComprobanteNombre
ComprobanteTipo
ComprobanteTipoNombre
Fecha
MonedaCodigo
MonedaNombre
MonedaSimbolo
RegistroId
Saldo
SaldoSigno
Serie
Numero
Total
TotalSigno
