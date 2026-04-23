# API Movimientos de Artículos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-articulos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-articulos/

---

## Contenido

# API Movimientos de Artículos

Esta API permite consultar movimientos de artículos registrados en la empresa, asociados a distintos comprobantes. Proporciona información detallada de cada línea de movimiento, permitiendo el seguimiento completo del comportamiento de los artículos en operaciones de venta, compra, stock y movimientos financieros.

La funcionalidad asociada en el sistema se encuentra en Gestión > Comprobantes > Stock e Inventarios > Comprobantes por Artículo.

## Casos de uso

-   Consultar movimientos de artículos por período.
-   Analizar rotación de stock.
-   Auditar operaciones de compra y venta.
-   Controlar movimientos por lote y vencimiento.
-   Integrar movimientos de inventario con sistemas externos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapmovimientosarticulov3?wsdl](https://api.zetasoftware.com/z.apis.asoapmovimientosarticulov3?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapmovimientosarticulov3](https://api.zetasoftware.com/z.apis.asoapmovimientosarticulov3)

## Método Query

Permite obtener movimientos de artículos aplicando múltiples filtros.

### Requisitos previos

-   Acceso habilitado a la API.
-   Definir el período de consulta (mes y año obligatorios).
-   Conocer códigos de artículos, comprobantes, clientes, proveedores y depósitos según necesidad.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `ArticuloCodigo` | T(10) | No | Código del artículo. Si se envía vacío, incluye todos. |
| `Mes` | T(MM) | Sí | Mes de la consulta. |
| `Anio` | T(AAAA) | Sí | Año de la consulta. |
| `FechaDesde` | AAAA-MM-DD | No | Fecha inicial. |
| `FechaHasta` | AAAA-MM-DD | No | Fecha final. |
| `LocalCodigo` | N(3) | No | Código del local. |
| `Lote` | T(20) | No | Lote del artículo. |
| `Vencimiento` | AAAA-MM-DD | No | Fecha de vencimiento del lote. |
| `IVACodigo` | N(2) | No | Código de IVA. |
| `ComprobanteCodigo` | N(3) | No | Código de comprobante. |
| `ComprobanteTipo` | N(2) | No | Tipo de comprobante. |
| `SerieComprobante` | T(6) | No | Serie del comprobante. |
| `NumeroComprobante` | N(10) | No | Número del comprobante. |
| `ClienteCodigo` | T(10) | No | Código del cliente. |
| `ProveedorCodigo` | T(10) | No | Código del proveedor. |
| `PrecioVentaCodigo` | N(3) | No | Código de precio de venta. |
| `CondicionCodigo` | T(3) | No | Condición de la operación. |
| `VendedorCodigo` | T(3) | No | Código del vendedor. |
| `CentroCodigo` | T(10) | No | Centro de costos. |
| `Referencia` | T(10) | No | Referencia asociada. |
| `Pendiente` | T(1) | No | `S`, `N` o vacío. |
| `Page` | N(2) | Sí | Número de página. |

### Estructura del response

```
RegistroId
LineaId
Fecha
ArticuloCodigo
ArticuloNombre
ArticuloAbreviacion
Descripcion
NotasLinea
Lote
Vencimiento
Cantidad
CantidadPendiente
Precio
PorcentajeDescuento1
PorcentajeDescuento2
PorcentajeDescuento3
IVACodigo
IVATipo
IVATasa
IVANombre
DepositoOrigenCodigo
DepositoNombre
DepositoDestinoCodigo
DepositoDestinoNombre
LocalCodigo
LocalNombre
ComprobanteCodigo
ComprobanteAbreviacion
ComprobanteNombre
ComprobanteTipo
ComprobanteTipoNombre
ArmadoComponente
Serie
Numero
NotasComprobante
MonedaCodigo
MonedaSimbolo
ClienteCodigo
ClienteNombre
ProveedorCodigo
ProveedorNombre
PrecioVentaCodigo
PrecioVentaNombre
CondicionCodigo
CondicionNombre
VendedorCodigo
VendedorNombre
CentroCodigo
CentroNombre
Referencia
SubTotal
SubTotalSigno
TotalIVA
TotalIVASigno
Total
TotalSigno
Pendiente
```

### Campos relevantes

-   `Cantidad`: Movimiento de unidades del artículo.
-   `CantidadPendiente`: Cantidad pendiente de completar.
-   `ArmadoComponente`: Indica armado/desarmado (vacío, A o C).
-   `Pendiente`: Indica si el movimiento está pendiente.

## Tipos de comprobantes

### Ventas

-   1 – Factura de Venta Crédito
-   2 – Nota de Crédito de Venta
-   3 – Venta Contado
-   4 – Devolución de Venta Contado
-   5 – Recibo de Cobro

### Compras

-   21 – Factura de Compra Crédito
-   22 – Nota de Crédito de Compra
-   23 – Compra Contado
-   24 – Devolución de Compra Contado
-   25 – Recibo de Pago

### Stock

-   31 – Movimiento de Stock Proveedores
-   32 – Movimiento de Stock Clientes
-   33 – Armado de Artículos
-   34 – Desarmado de Artículos
-   35 – Transferencia entre Depósitos

### Caja y Bancos

-   41 – Ingreso de Caja
-   42 – Egreso de Caja
-   43 – Cheque Recibido
-   44 – Tarjeta de Crédito Recibida
-   45 – Documento Recibido
-   46 – Documento Emitido

### Bancos

-   51 – Crédito bancario
-   52 – Débito bancario
-   53 – Cheque emitido
-   54 – Retiro bancario
-   55 – Depósito bancario

## Observaciones

-   La API devuelve movimientos a nivel de línea de comprobante.
-   Si no se especifica `ArticuloCodigo`, se incluyen todos los artículos.
-   Se recomienda filtrar por fechas para optimizar la consulta.
-   El campo `Pendiente` permite identificar movimientos incompletos.

## Consideraciones de integración

-   Paginar resultados utilizando el parámetro `Page`.
-   Evitar consultas sin filtros en ambientes productivos.
-   Persistir movimientos ya procesados.
-   Utilizar filtros combinados para mejorar performance.

[API Movimientos de Artículos - PreviousAPI Movimientos Bancarios](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-bancarios/)[Next - API Movimientos de ArtículosAPI Movimientos de Caja](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-caja/)

---

## Links relacionados

- [API Movimientos de Artículos - PreviousAPI Movimientos Bancarios](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-bancarios/)
- [Next - API Movimientos de ArtículosAPI Movimientos de Caja](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-caja/)

