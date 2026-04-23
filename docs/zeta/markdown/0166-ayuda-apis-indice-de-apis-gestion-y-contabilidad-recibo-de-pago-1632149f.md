# API Recibo de Pago - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-pago/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-pago/

---

## Contenido

# API Recibo de Pago

Esta API permite gestionar recibos de pago en ZetaSoftware, incluyendo la consulta de saldos pendientes, obtención de datos detallados, modificación de registros existentes y generación de nuevos recibos asociados a proveedores.

Está orientada al control de cuentas por pagar y seguimiento de comprobantes de pago.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoaprecibospagosv1?wsdl](https://api.zetasoftware.com/z.apis.asoaprecibospagosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoaprecibospagosv1](https://api.zetasoftware.com/z.apis.asoaprecibospagosv1)

## Método QueryPendientes

Permite listar recibos de pago con saldo pendiente.

### Parámetros de entrada

| Parámetro | Obligatorio | Descripción |
| --- | --- | --- |
| `ProveedorCodigo` | No | Código del proveedor. |
| `Id` | Sí | Debe enviarse vacío. |
| `ComprobanteCodigo` | No | Código del comprobante. |
| `FechaDesde` / `FechaHasta` | No | Rango de fechas. |
| `Serie` / `Numero` | No | Datos del comprobante. |
| `MonedaCodigo` | No | Código de moneda. |
| `LocalCodigo` | No | Código del local. |
| `SaldoDesde` / `SaldoHasta` | No | Rango de saldo. |
| `Emitido` | Sí | `S` o `N`. |
| `Page` | Sí | Número de página. |

### Campos devueltos

```
RegistroId
ComprobanteCodigo
ProveedorCodigo
Fecha
Serie
Numero
MonedaCodigo
Descripcion
LocalCodigo
CajaCodigo
Total
Saldo
Emitido
IsLastPage
```

## Método Data

Permite obtener el detalle completo de un recibo de pago.

### Parámetro de entrada

-   `RegistroId` – Obligatorio.

### Observación

El `RegistroId` se obtiene previamente desde `QueryPendientes`.

## Método Load

Permite cargar o modificar un recibo existente.

### Parámetro de entrada

-   `RegistroId` – Obligatorio.

### Campos principales

```
RegistroId
ComprobanteCodigo
ProveedorCodigo
Fecha
Serie
Numero
MonedaCodigo
Cotizacion
LocalCodigo
CajaCodigo
Total
UsuarioCodigo
Notas
```

## Método Save

Permite registrar un nuevo recibo de pago.

### Parámetros de entrada

| Parámetro | Obligatorio | Descripción |
| --- | --- | --- |
| `RegistroId` | Sí | Enviar en 0 para alta. |
| `ComprobanteCodigo` | Sí | Código del comprobante. |
| `ProveedorCodigo` | Sí | Código del proveedor. |
| `Fecha` | Sí | Fecha del recibo. |
| `MonedaCodigo` | Sí | Moneda. |
| `LocalCodigo` | Sí | Local. |
| `CajaCodigo` | Sí | Caja. |
| `Total` | Sí | Importe total. |
| `UsuarioCodigo` | Sí | Usuario. |

### Resultado

```
Succeed
Mensaje
```

### Observación

Las formas de pago no se asignan en este método. Debe utilizarse la API correspondiente.

## Método QueryComprobantes

Permite consultar comprobantes de pago registrados.

### Parámetros de entrada

| Parámetro | Obligatorio |
| --- | --- |
| `Anio` | Sí |
| `Mes` | Sí |
| `ProveedorCodigo` | No |
| `ComprobanteCodigo` | No |
| `MonedaCodigo` | No |
| `LocalCodigo` | No |
| `Page` | Sí |

### Campos devueltos

```
RegistroId
ComprobanteCodigo
ProveedorCodigo
Fecha
Serie
Numero
MonedaCodigo
Descripcion
LocalCodigo
CajaCodigo
Total
Saldo
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

-   El flujo comienza con `QueryPendientes` para obtener el `RegistroId`.
-   `Save` crea registros y `Load` los modifica.
-   La paginación es obligatoria en consultas.

## Consideraciones de integración

-   Paginar resultados mediante `Page`.
-   Validar datos antes de ejecutar `Save`.
-   Evitar modificaciones masivas.

[API Recibo de Pago - PreviousAPI Recibo de Cobro](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-cobro/)[Next - API Recibo de PagoAPI Stock Actual](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/stock-actual/)

---

## Links relacionados

- [API Recibo de Pago - PreviousAPI Recibo de Cobro](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-cobro/)
- [Next - API Recibo de PagoAPI Stock Actual](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/stock-actual/)

