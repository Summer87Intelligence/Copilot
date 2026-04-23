# API Recibo de Cobro - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-cobro/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-cobro/

---

## Contenido

# API Recibo de Cobro

Esta API permite gestionar recibos de cobranza en ZetaSoftware, incluyendo la consulta de saldos pendientes, obtención de datos detallados, modificación de registros existentes y generación de nuevos recibos.

La API está orientada a la administración de cobranzas y al seguimiento de comprobantes asociados a clientes.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapreciboscobranzav2?wsdl](https://api.zetasoftware.com/z.apis.asoapreciboscobranzav2?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapreciboscobranzav2](https://api.zetasoftware.com/z.apis.asoapreciboscobranzav2)

## Método QueryPendientes

Permite listar recibos de cobranza con saldo pendiente.

### Parámetros de entrada

| Parámetro | Obligatorio | Descripción |
| --- | --- | --- |
| `Anio` | Sí | Año de la consulta. |
| `ClienteCodigo` | No | Código del cliente. |
| `Id` | Sí | Debe enviarse vacío. |
| `ComprobanteCodigo` | No | Código del comprobante. |
| `FechaDesde` / `FechaHasta` | No | Rango de fechas. |
| `Serie` / `Numero` | No | Datos del comprobante. |
| `MonedaCodigo` | No | Código de moneda. |
| `LocalCodigo` | No | Código del local. |
| `CobradorCodigo` | No | Código del cobrador. |
| `SaldoDesde` / `SaldoHasta` | No | Rango de saldo. |
| `Emitido` | Sí | `S` o `N`. |
| `Page` | Sí | Número de página. |

### Campos devueltos

```
RegistroId
ComprobanteCodigo
ComprobanteAbreviacion
ComprobanteNombre
ClienteCodigo
ClienteNombre
ClienteRazonSocial
Fecha
Serie
Numero
MonedaCodigo
MonedaSimbolo
MonedaNombre
Descripcion
CobradorCodigo
CobradorNombre
CajaCodigo
CajaNombre
LocalCodigo
LocalNombre
Total
TotalSigno
Saldo
SaldoSigno
Emitido
IsLastPage
```

## Método Data

Permite obtener el detalle completo de un recibo.

### Parámetro de entrada

-   `RegistroId` – Obligatorio.

### Observación

El `RegistroId` se obtiene previamente desde el método `QueryPendientes`.

## Método Load

Permite cargar o modificar un recibo existente.

### Parámetro de entrada

-   `RegistroId` – Obligatorio.

### Campos principales

```
RegistroId
ComprobanteCodigo
ClienteCodigo
Fecha
Serie
Numero
MonedaCodigo
Cotizacion
Descripcion
CobradorCodigo
CajaCodigo
LocalCodigo
UsuarioCodigo
Total
Notas
```

## Método Save

Permite registrar un nuevo recibo de cobranza.

### Parámetros de entrada

| Parámetro | Obligatorio | Descripción |
| --- | --- | --- |
| `RegistroId` | Sí | Enviar en 0 para alta. |
| `ComprobanteCodigo` | Sí | Código del comprobante. |
| `Fecha` | Sí | Fecha del recibo. |
| `MonedaCodigo` | Sí | Moneda. |
| `ClienteCodigo` | Sí | Código del cliente. |
| `LocalCodigo` | Sí | Local. |
| `CajaCodigo` | Sí | Caja. |
| `Total` | Sí | Importe total. |
| `UsuarioCodigo` | Sí | Usuario. |
| `ReciboEmitido` | Sí | Indica estado de emisión. |

### Resultado

```
Succeed
Mensaje
```

### Observación

Este método no asigna formas de pago. Para ello debe utilizarse la API de facturas de clientes.

## Método QueryComprobantes

Permite consultar comprobantes de cobranza registrados.

### Parámetros de entrada

| Parámetro | Obligatorio |
| --- | --- |
| `Anio` | Sí |
| `Mes` | Sí |
| `ClienteCodigo` | No |
| `ComprobanteCodigo` | No |
| `MonedaCodigo` | No |
| `LocalCodigo` | No |
| `CobradorCodigo` | No |
| `Page` | Sí |

### Campos devueltos

```
RegistroId
ComprobanteCodigo
ComprobanteAbreviacion
ComprobanteNombre
ClienteCodigo
ClienteNombre
ClienteRazonSocial
Fecha
Serie
Numero
MonedaCodigo
MonedaSimbolo
MonedaNombre
Descripcion
CobradorCodigo
CobradorNombre
CajaCodigo
CajaNombre
LocalCodigo
LocalNombre
Total
TotalSigno
Saldo
SaldoSigno
Emitido
IsLastPage
```

## Conexión y seguridad

Todos los métodos requieren autenticación mediante parámetros de conexión.

### Parámetros requeridos

```
DesarrolladorCodigo
DesarrolladorClave
EmpresaCodigo
EmpresaClave
UsuarioCodigo
UsuarioClave
RolCodigo
```

## Observaciones

-   El flujo recomendado inicia con `QueryPendientes` para obtener `RegistroId`.
-   El método `Save` crea registros, mientras que `Load` los modifica.
-   La paginación es obligatoria en métodos de consulta.
-   La gestión de formas de pago se realiza en otra API.

## Consideraciones de integración

-   Paginar siempre las consultas mediante `Page`.
-   Validar datos antes de ejecutar `Save`.
-   Evitar modificaciones masivas sin control mediante `Load`.

[API Recibo de Cobro - PreviousAPI Precio Base y Precio de Venta](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/precio-base-y-precio-de-venta/)[Next - API Recibo de CobroAPI Recibo de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-pago/)

---

## Links relacionados

- [API Recibo de Cobro - PreviousAPI Precio Base y Precio de Venta](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/precio-base-y-precio-de-venta/)
- [Next - API Recibo de CobroAPI Recibo de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-pago/)

