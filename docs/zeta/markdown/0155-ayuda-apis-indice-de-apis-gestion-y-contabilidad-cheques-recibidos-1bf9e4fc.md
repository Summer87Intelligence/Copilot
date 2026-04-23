# API Cheques Recibidos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cheques-recibidos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cheques-recibidos/

---

## Contenido

# API Cheques Recibidos

Esta API permite consultar cheques recibidos e ingresados por la empresa, con filtros orientados a estado, período, banco, cliente, comprobante, moneda, caja y local. Su objetivo es facilitar la supervisión operativa y la integración de la información vinculada a cheques recibidos.

La funcionalidad asociada en el sistema se encuentra en la ruta: Gestión > Comprobantes > Cheques Recibidos.

## Casos de uso

-   Obtener listados de cheques recibidos por estado.
-   Consultar cheques registrados en un mes o fecha específica.
-   Filtrar cheques por banco, cliente, caja, moneda o comprobante.
-   Integrar la información de cheques recibidos con sistemas externos de control o reporting.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapchequesrecibidosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapchequesrecibidosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapchequesrecibidosv1](https://api.zetasoftware.com/z.apis.asoapchequesrecibidosv1)

## Método Query

Permite recuperar un listado paginado de cheques recibidos según los filtros informados.

### Requisitos previos

-   Contar con acceso habilitado a la API.
-   Disponer de códigos válidos de local, banco, cliente, comprobante, moneda y caja, según corresponda.
-   Informar correctamente el período o la fecha a consultar.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `LocalCodigo` | N(3) | Sí | Código del local a consultar. |
| `Estado` | T(1) | Sí | Estado del cheque. Valores admitidos: `C` = En cartera, `E` = Endosado, `D` = Depositado, `O` = Cobrado. |
| `Anio` | T(4) | Sí | Año del período a consultar, en formato AAAA. |
| `Mes` | T(2) | Sí | Mes del período a consultar, en formato MM. |
| `Fecha` | Fecha | No | Fecha específica en formato AAAA-MM-DD. Si se envía vacío, la consulta considera todo el mes informado. |
| `BancoCodigo` | T(3) | No | Código del banco. |
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
BancoCodigo
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
Vencimiento
Emision
Serie
Numero
BancoCodigo
BancoNombre
BancoAbreviacion
ClienteCodigo
ClienteNombre
Descripcion
ChequeTitular
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
| `Vencimiento` | Fecha de vencimiento del cheque. |
| `Emision` | Fecha de emisión del cheque. |
| `Serie` | Serie del documento asociado. |
| `Numero` | Número del documento o cheque. |
| `BancoCodigo` | Código del banco. |
| `BancoNombre` | Nombre del banco. |
| `BancoAbreviacion` | Abreviación del banco. |
| `ClienteCodigo` | Código del cliente. |
| `ClienteNombre` | Nombre del cliente. |
| `Descripcion` | Descripción asociada al registro. |
| `ChequeTitular` | Titular del cheque. |
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
| `Total` | Importe total del cheque. |
| `Estado` | Código de estado del cheque. |
| `EstadoNombre` | Descripción del estado del cheque. |
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
  "BancoCodigo": "",
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
    "RegistroId": 1542,
    "ComprobanteCodigo": 101,
    "ComprobanteNombre": "Recibo",
    "ComprobanteAbreviacion": "REC",
    "Vencimiento": "2026-03-28",
    "Emision": "2026-03-01",
    "Serie": "A",
    "Numero": 24581,
    "BancoCodigo": "001",
    "BancoNombre": "Banco Ejemplo",
    "BancoAbreviacion": "BEJ",
    "ClienteCodigo": "C00045",
    "ClienteNombre": "Cliente Demo S.A.",
    "Descripcion": "Cheque recibido por cobranza",
    "ChequeTitular": "Cliente Demo S.A.",
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
    "RegistroHora": "14:35:10",
    "RegistroFecha": "2026-03-01",
    "Total": 25000.00,
    "Estado": "C",
    "EstadoNombre": "En cartera",
    "EstadoFecha": "2026-03-01",
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
-   Validar los códigos de estado antes de construir filtros automáticos.
-   Usar filtros adicionales como banco, cliente, moneda o caja para reducir volumen de datos cuando sea necesario.
-   Verificar consistencia entre `Estado`, `EstadoNombre` y `EstadoFecha` en procesos de conciliación o seguimiento.

[API Cheques Recibidos - PreviousAPI CFEs Recibidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cfes-recibidos/)[Next - API Cheques RecibidosAPI Comprobantes por Cliente](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/comprobantes-por-cliente/)

---

## Links relacionados

- [API Cheques Recibidos - PreviousAPI CFEs Recibidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cfes-recibidos/)
- [Next - API Cheques RecibidosAPI Comprobantes por Cliente](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/comprobantes-por-cliente/)

