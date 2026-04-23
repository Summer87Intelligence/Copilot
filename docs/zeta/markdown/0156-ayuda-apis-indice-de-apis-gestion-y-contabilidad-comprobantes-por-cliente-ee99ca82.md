# API Comprobantes por Cliente - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/comprobantes-por-cliente/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/comprobantes-por-cliente/

---

## Contenido

# API Comprobantes por Cliente

Esta API permite obtener comprobantes generados asociados a clientes, incluyendo ventas, notas de crédito, devoluciones, movimientos de stock y recibos de cobranza. La información se devuelve con estructura de encabezado, líneas de detalle y formas de pago.

La funcionalidad asociada en el sistema se encuentra en la ruta: Gestión > Comprobantes > Comprobantes por Cliente.

## Casos de uso

-   Consultar comprobantes de un cliente específico.
-   Obtener comprobantes de todos los clientes en un período.
-   Integrar comprobantes con sistemas externos (BI, reporting, conciliaciones).
-   Analizar ventas, devoluciones y cobranzas por cliente.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcomprobantesclientev1?wsdl](https://api.zetasoftware.com/z.apis.asoapcomprobantesclientev1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcomprobantesclientev1](https://api.zetasoftware.com/z.apis.asoapcomprobantesclientev1)

## Método Query

Permite consultar comprobantes por cliente o por período.

### Requisitos previos

-   Acceso habilitado a la API.
-   Definición de período de consulta (mes y año obligatorios).
-   Conocimiento del código de cliente si se requiere filtrado específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `ClienteCodigo` | T(10) | No | Código del cliente. Si se envía vacío, devuelve comprobantes de todos los clientes. |
| `Mes` | T(2) | Sí | Mes del período (MM). |
| `Anio` | T(4) | Sí | Año del período (AAAA). |
| `FechaDesde` | Fecha | No | Fecha inicial para filtrar resultados. |
| `FechaHasta` | Fecha | No | Fecha final para filtrar resultados. |

### Estructura del response

#### Encabezado del comprobante

```
ComprobanteCodigo
Serie
Numero
Fecha
MonedaCodigo
Cotizacion
ClienteCodigo
VendedorCodigo
PrecioCodigo
CondicionPagoCodigo
DepositoOrigenCodigo
DepositoDestinoCodigo
CentroCostoCodigo
ReferenciaCodigo
TotalRecibo
LocalCodigo
CajaCodigo
UsuarioCodigo
ClienteNombre
ClienteTipoDocumento
ClientePais
ClienteDocumento
ClienteDireccion
ClienteDepartamento
ClienteCiudad
ClienteCP
ClienteTelefono
ClienteSucursal
ClienteEmail
ClienteEntrega
CFETipo
CFEEstado
CFEAcuse
CFEMensaje
Notas
```

#### Líneas del comprobante

```
ArticuloCodigo
Concepto
Lote
Vencimiento
Cantidad
PrecioUnitario
Descuento1
Descuento2
Descuento3
Neto
IVA
Total
Notas
```

#### Formas de pago

```
FormaPagoCodigo
MonedaPagoCodigo
MonedaPagoMonto
MonedaComprobanteMonto
```

### Ejemplo de request

```
{
  "ClienteCodigo": "",
  "Mes": "03",
  "Anio": "2026",
  "FechaDesde": "",
  "FechaHasta": ""
}
```

### Ejemplo de response

```
[
  {
    "ComprobanteCodigo": 701,
    "Serie": "A",
    "Numero": 1254,
    "Fecha": "2026-03-15",
    "ClienteCodigo": "C0001",
    "ClienteNombre": "Cliente Demo",
    "TotalRecibo": 15000.00,
    "Lineas": [
      {
        "ArticuloCodigo": "A001",
        "Concepto": "Producto ejemplo",
        "Cantidad": 2,
        "PrecioUnitario": 5000,
        "Total": 10000
      }
    ],
    "Pagos": [
      {
        "FormaPagoCodigo": 1,
        "MonedaPagoMonto": 15000
      }
    ]
  }
]
```

## Observaciones

-   Si `ClienteCodigo` se envía vacío, se devuelven comprobantes de todos los clientes.

## Consideraciones de integración

-   Se recomienda ejecutar la consulta una vez por día para evitar sobrecarga del servicio.
-   Evitar ejecución mediante procesos automáticos de alta frecuencia (cron).
-   Filtrar por fechas cuando sea necesario para reducir volumen de datos.
-   Persistir comprobantes ya procesados para evitar reprocesamiento.

[API Comprobantes por Cliente - PreviousAPI Cheques Recibidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cheques-recibidos/)[Next - API Comprobantes por ClienteAPI Consulta de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/consulta-de-asientos/)

---

## Links relacionados

- [API Comprobantes por Cliente - PreviousAPI Cheques Recibidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cheques-recibidos/)
- [Next - API Comprobantes por ClienteAPI Consulta de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/consulta-de-asientos/)

