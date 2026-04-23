# API Tarjetas Recibidas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/tarjetas-recibidas/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/tarjetas-recibidas/

---

## Contenido

# API Tarjetas Recibidas

Esta API permite consultar vouchers ingresados por la empresa, equivalentes a la funcionalidad disponible en Gestión > Comprobantes > Documentos > Tarjetas Recibidas dentro de ZetaSoftware.

La consulta permite filtrar vouchers por estado, período, financiera, cliente, comprobante, moneda, caja y local, facilitando el seguimiento operativo y financiero de tarjetas recibidas.

## Casos de uso

-   Consultar vouchers registrados en un período determinado.
-   Filtrar vouchers por estado operativo.
-   Obtener vouchers por financiera, cliente, caja o moneda.
-   Integrar la información de tarjetas recibidas con sistemas externos de control o conciliación.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapvouchersv1?wsdl](https://api.zetasoftware.com/z.apis.asoapvouchersv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapvouchersv1](https://api.zetasoftware.com/z.apis.asoapvouchersv1)

## Método Query

Permite recuperar un listado paginado de vouchers según los filtros informados.

### Requisitos previos

-   Contar con acceso habilitado a la API.
-   Disponer de códigos válidos de local, financiera, cliente, comprobante, moneda y caja, según corresponda.
-   Informar correctamente el período o la fecha a consultar.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `LocalCodigo` | N(3) | Sí | Código del local a consultar. |
| `Estado` | T(1) | Sí | Estado del voucher. Valores admitidos: `C` = En cartera, `E` = Endosado, `D` = Depositado, `O` = Cobrado. |
| `Anio` | T(4) | Sí | Año del período a consultar, en formato AAAA. |
| `Mes` | T(2) | Sí | Mes del período a consultar, en formato MM. |
| `Fecha` | Fecha | No | Fecha específica en formato AAAA-MM-DD. Si se envía vacía, la consulta considera todo el mes informado. |
| `FinancieraCodigo` | T(3) | No | Código de la financiera. |
| `ClienteCodigo` | T(10) | No | Código del cliente. |
| `ComprobanteCodigo` | N(3) | No | Código del comprobante asociado. |
| `MonedaCodigo` | N(2) | No | Código de la moneda. |
| `CajaCodigo` | N(3) | No | Código de la caja. |
| `Page` | N(2) | Sí | Número de página a consultar. |

### Estructura del request

```
LocalCodigo
Estado
Anio
Mes
Fecha
FinancieraCodigo
ClienteCodigo
ComprobanteCodigo
MonedaCodigo
CajaCodigo
Page
```

### Estructura del response

```
RegistroId
ComprobanteCodigo
ComprobanteNombre
ComprobanteAbreviacion
Fecha
Serie
Numero
FinancieraCodigo
FinancieraNombre
FinancieraAbreviacion
ClienteCodigo
ClienteNombre
Descripcion
TarjetaNumero
TarjetaTitular
PlanPagos
NumeroAutorizacion
MonedaCodigo
MonedaNombre
MonedaSimbolo
MonedaAbreviacion
LocalCodigo
LocalNombre
CajaCodigo
CajaNombre
UsuarioCodigo
UsuarioNombre
RegistroHora
RegistroFecha
Total
Estado
EstadoNombre
EstadoFecha
Notas
IsLastPage
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `RegistroId` | Identificador del registro. |
| `ComprobanteCodigo` | Código del comprobante asociado. |
| `ComprobanteNombre` | Nombre del comprobante. |
| `ComprobanteAbreviacion` | Abreviación del comprobante. |
| `Fecha` | Fecha del voucher. |
| `Serie` | Serie del comprobante. |
| `Numero` | Número del comprobante o voucher. |
| `FinancieraCodigo` | Código de la financiera. |
| `FinancieraNombre` | Nombre de la financiera. |
| `FinancieraAbreviacion` | Abreviación de la financiera. |
| `ClienteCodigo` | Código del cliente. |
| `ClienteNombre` | Nombre del cliente. |
| `Descripcion` | Descripción asociada al registro. |
| `TarjetaNumero` | Número de la tarjeta asociado al voucher. |
| `TarjetaTitular` | Titular de la tarjeta. |
| `PlanPagos` | Plan de pagos asociado. |
| `NumeroAutorizacion` | Número de autorización de la operación. |
| `MonedaCodigo` | Código de moneda. |
| `MonedaNombre` | Nombre de la moneda. |
| `MonedaSimbolo` | Símbolo de la moneda. |
| `MonedaAbreviacion` | Abreviación de la moneda. |
| `LocalCodigo` | Código del local. |
| `LocalNombre` | Nombre del local. |
| `CajaCodigo` | Código de la caja. |
| `CajaNombre` | Nombre de la caja. |
| `UsuarioCodigo` | Código del usuario que registró la operación. |
| `UsuarioNombre` | Nombre del usuario que registró la operación. |
| `RegistroHora` | Hora de registro. |
| `RegistroFecha` | Fecha de registro. |
| `Total` | Importe total del voucher. |
| `Estado` | Código de estado del voucher. |
| `EstadoNombre` | Descripción del estado del voucher. |
| `EstadoFecha` | Fecha asociada al estado actual. |
| `Notas` | Observaciones o notas del registro. |
| `IsLastPage` | Indica si la página consultada es la última con datos disponibles. |

### Ejemplo de request

```
{
  "LocalCodigo": 1,
  "Estado": "C",
  "Anio": "2026",
  "Mes": "03",
  "Fecha": "",
  "FinancieraCodigo": "",
  "ClienteCodigo": "",
  "ComprobanteCodigo": "",
  "MonedaCodigo": "",
  "CajaCodigo": "",
  "Page": 1
}
```

### Ejemplo de response

```
[
  {
    "RegistroId": 845,
    "ComprobanteCodigo": 201,
    "ComprobanteNombre": "Voucher tarjeta",
    "ComprobanteAbreviacion": "VOU",
    "Fecha": "2026-03-18",
    "Serie": "A",
    "Numero": 15284,
    "FinancieraCodigo": "001",
    "FinancieraNombre": "Financiera Demo",
    "FinancieraAbreviacion": "FD",
    "ClienteCodigo": "C00045",
    "ClienteNombre": "Cliente Demo S.A.",
    "Descripcion": "Cobro con tarjeta",
    "TarjetaNumero": "****1234",
    "TarjetaTitular": "Cliente Demo S.A.",
    "PlanPagos": "1 cuota",
    "NumeroAutorizacion": "587412",
    "MonedaCodigo": 1,
    "MonedaNombre": "Pesos Uruguayos",
    "MonedaSimbolo": "$",
    "MonedaAbreviacion": "UYU",
    "LocalCodigo": 1,
    "LocalNombre": "Casa Central",
    "CajaCodigo": 1,
    "CajaNombre": "Caja Principal",
    "UsuarioCodigo": "ADM",
    "UsuarioNombre": "Administrador",
    "RegistroHora": "16:10:22",
    "RegistroFecha": "2026-03-18",
    "Total": 3250.00,
    "Estado": "C",
    "EstadoNombre": "En cartera",
    "EstadoFecha": "2026-03-18",
    "Notas": "",
    "IsLastPage": "true"
  }
]
```

## Observaciones

-   La consulta requiere informar local, estado, año, mes y página.
-   Si `Fecha` se envía vacía, el resultado considera todo el mes informado.
-   El campo `IsLastPage` permite determinar si existen más páginas disponibles para consultar.

## Consideraciones de integración

-   Se recomienda recorrer páginas sucesivas hasta que `IsLastPage` indique fin de resultados.
-   Validar los códigos de estado antes de automatizar filtros.
-   Usar filtros por financiera, cliente, moneda o caja para reducir volumen de datos cuando sea necesario.
-   Verificar consistencia entre `Estado`, `EstadoNombre` y `EstadoFecha` en procesos de conciliación o seguimiento.

[API Tarjetas Recibidas - PreviousAPI Stock Actual](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/stock-actual/)[Next - API Tarjetas RecibidasAPI Eliminar Remitos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/eliminar-remitos/)

---

## Links relacionados

- [Next - API Tarjetas RecibidasAPI Eliminar Remitos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/eliminar-remitos/)
- [API Tarjetas Recibidas - PreviousAPI Stock Actual](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/stock-actual/)

