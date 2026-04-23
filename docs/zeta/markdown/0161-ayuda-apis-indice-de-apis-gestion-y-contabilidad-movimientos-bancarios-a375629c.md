# API Movimientos Bancarios - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-bancarios/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-bancarios/

---

## Contenido

# API Movimientos Bancarios

Esta API permite consultar movimientos bancarios registrados en la empresa, incluyendo créditos, débitos, cheques emitidos y transferencias entre cuentas propias. La información corresponde a movimientos previamente generados en el sistema.

La funcionalidad asociada en el sistema se encuentra en Gestión > Comprobantes > Caja y Bancos > Movimientos Bancarios.

## Casos de uso

-   Consultar movimientos bancarios por período.
-   Filtrar movimientos por cuenta, banco, moneda o concepto.
-   Controlar conciliaciones bancarias.
-   Integrar información bancaria con sistemas externos.
-   Auditar movimientos financieros.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapmovimientosbancariosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapmovimientosbancariosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapmovimientosbancariosv1](https://api.zetasoftware.com/z.apis.asoapmovimientosbancariosv1)

## Método Query

Permite obtener movimientos bancarios aplicando distintos filtros.

### Requisitos previos

-   Acceso habilitado a la API.
-   Definir el período de consulta.
-   Conocer códigos de cuentas, bancos, monedas y conceptos si se requiere filtrado específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Mes` | T(MM) | Sí | Mes de la consulta. |
| `Anio` | T(AAAA) | Sí | Año de la consulta. |
| `FechaDesde` | AAAA-MM-DD | No | Fecha inicial. |
| `FechaHasta` | AAAA-MM-DD | No | Fecha final. |
| `ComprobanteTipo` | N(2) | No | Tipo de movimiento bancario. |
| `CuentaCodigo` | N(3) | No | Código de cuenta bancaria. |
| `BancoCodigo` | N(3) | No | Código del banco. |
| `MonedaCodigo` | N(2) | No | Código de moneda. |
| `ConceptoCodigo` | T(10) | No | Código de concepto. |
| `ComprobanteCodigo` | N(2) | No | Código de comprobante. |
| `Serie` | T(2) | No | Serie del comprobante. |
| `Numero` | T(3) | No | Número del comprobante. |
| `LocalCodigo` | N(3) | No | Código del local. |
| `CentroCostosCodigo` | T(10) | No | Centro de costos. |
| `Referencia` | T(10) | No | Referencia del movimiento. |
| `ClienteProveedor` | T(10) | No | Código de cliente o proveedor asociado. |
| `Conciliado` | T(1) | No | `S` o `N`. |
| `Page` | N(2) | Sí | Número de página. |

### Estructura del request

```
Mes
Anio
FechaDesde
FechaHasta
ComprobanteTipo
CuentaCodigo
BancoCodigo
MonedaCodigo
ConceptoCodigo
ComprobanteCodigo
Serie
Numero
LocalCodigo
CentroCostosCodigo
Referencia
ClienteProveedor
Conciliado
Page
```

### Estructura del response

```
RegistroId
ComprobanteCodigo
ComprobanteAbreviacion
Fecha
Vencimiento
Serie
Numero
MonedaCodigo
MonedaSimbolo
ClienteProveedor
ProveedorNombre
CuentaCodigo
CuentaNombre
BancoCodigo
BancoNombre
LocalCodigo
CentroCostosCodigo
Referencia
ConceptoCodigo
ConceptoNombre
Descripcion
Conciliado
SubTotal
TotalIVA
Total
Notas
UsuarioCodigo
UsuarioNombre
RegistroHora
RegistroFecha
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `RegistroId` | Identificador del movimiento. |
| `ComprobanteCodigo` | Código del comprobante. |
| `Fecha` | Fecha del movimiento. |
| `Vencimiento` | Fecha de vencimiento. |
| `Serie` | Serie del comprobante. |
| `Numero` | Número del comprobante. |
| `MonedaCodigo` | Código de moneda. |
| `MonedaSimbolo` | Símbolo de moneda. |
| `ClienteProveedor` | Código asociado. |
| `ProveedorNombre` | Nombre del proveedor o cliente. |
| `CuentaCodigo` | Código de cuenta bancaria. |
| `CuentaNombre` | Nombre de la cuenta. |
| `BancoCodigo` | Código del banco. |
| `BancoNombre` | Nombre del banco. |
| `ConceptoCodigo` | Código de concepto. |
| `ConceptoNombre` | Nombre del concepto. |
| `Descripcion` | Descripción del movimiento. |
| `Conciliado` | Indica si el movimiento está conciliado. |
| `SubTotal` | Importe sin impuestos. |
| `TotalIVA` | Importe de IVA. |
| `Total` | Importe total del movimiento. |
| `Notas` | Observaciones. |
| `UsuarioCodigo` | Usuario que registró el movimiento. |
| `UsuarioNombre` | Nombre del usuario. |
| `RegistroFecha` | Fecha de registro. |
| `RegistroHora` | Hora de registro. |

### Ejemplo de request

```
{
  "Mes": "03",
  "Anio": "2026",
  "FechaDesde": "",
  "FechaHasta": "",
  "CuentaCodigo": 1,
  "Page": 1
}
```

### Ejemplo de response

```
[
  {
    "RegistroId": 1001,
    "Fecha": "2026-03-10",
    "CuentaCodigo": 1,
    "CuentaNombre": "Cuenta Corriente",
    "BancoNombre": "Banco Demo",
    "Total": 15000.00,
    "Conciliado": "S"
  }
]
```

## Observaciones

-   La API consulta únicamente movimientos ya registrados.
-   El filtro `Conciliado` permite identificar movimientos conciliados o pendientes.
-   Se recomienda usar filtros para limitar el volumen de datos.

## Consideraciones de integración

-   Paginar resultados mediante el parámetro `Page`.
-   Evitar consultas masivas sin filtros de fecha.
-   Persistir movimientos ya procesados para evitar reprocesamiento.
-   Validar códigos antes de realizar consultas.

[API Movimientos Bancarios - PreviousAPI Facturas de Proveedores](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-proveedores/)[Next - API Movimientos BancariosAPI Movimientos de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-articulos/)

---

## Links relacionados

- [API Movimientos Bancarios - PreviousAPI Facturas de Proveedores](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-proveedores/)
- [Next - API Movimientos BancariosAPI Movimientos de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-articulos/)

