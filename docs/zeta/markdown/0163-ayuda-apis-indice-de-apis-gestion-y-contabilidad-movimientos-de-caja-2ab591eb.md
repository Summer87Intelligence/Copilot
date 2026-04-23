# API Movimientos de Caja - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-caja/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-caja/

---

## Contenido

# API Movimientos de Caja

Esta API permite consultar movimientos de caja registrados en la empresa, incluyendo ingresos y egresos. La información expuesta corresponde a movimientos previamente generados en el sistema y está orientada a control operativo, conciliación y análisis contable.

La funcionalidad asociada en el sistema se encuentra en Gestión > Comprobantes > Caja y Bancos > Movimientos de Caja.

## Casos de uso

-   Consultar ingresos y egresos de caja por período.
-   Filtrar movimientos por concepto, moneda, local o centro de costos.
-   Auditar comprobantes de caja registrados en el sistema.
-   Integrar movimientos de caja con sistemas externos de reporting o conciliación.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapmovimientoscajav1?wsdl](https://api.zetasoftware.com/z.apis.asoapmovimientoscajav1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapmovimientoscajav1](https://api.zetasoftware.com/z.apis.asoapmovimientoscajav1)

## Método Query

Permite obtener movimientos de caja aplicando filtros por período, tipo de comprobante y atributos operativos del movimiento.

### Requisitos previos

-   Acceso habilitado a la API.
-   Definir el período de consulta mediante mes y año.
-   Conocer los códigos de concepto, moneda, local, centro de costos y comprobante cuando se requiera filtrado específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Mes` | T(MM) | Sí | Mes de la consulta. |
| `Anio` | T(AAAA) | Sí | Año de la consulta. |
| `FechaDesde` | AAAA-MM-DD | No | Fecha inicial del rango a consultar. |
| `FechaHasta` | AAAA-MM-DD | No | Fecha final del rango a consultar. |
| `ComprobanteTipo` | N(2) | No | Tipo de movimiento de caja. Valores documentados: `41` = Ingreso de Caja, `42` = Egreso de Caja. |
| `ConceptoCodigo` | T(10) | No | Código del concepto del movimiento. |
| `MonedaCodigo` | N(2) | No | Código de moneda. |
| `ComprobanteCodigo` | N(2) | No | Código del comprobante. |
| `Serie` | T(2) | No | Serie del comprobante. |
| `Numero` | T(3) | No | Número del comprobante. |
| `LocalCodigo` | N(3) | No | Código del local. |
| `CentroCostosCodigo` | T(10) | No | Código del centro de costos. |
| `Referencia` | T(10) | No | Referencia asociada al movimiento. |
| `Page` | N(2) | Sí | Número de página a consultar. |

### Estructura del request

```
Mes
Anio
FechaDesde
FechaHasta
ComprobanteTipo
ConceptoCodigo
MonedaCodigo
ComprobanteCodigo
Serie
Numero
LocalCodigo
CentroCostosCodigo
Referencia
Page
```

### Estructura del response

```
RegistroId
ComprobanteCodigo
ComprobanteAbreviacion
Fecha
Serie
Numero
MonedaCodigo
MonedaSimbolo
ConceptoCodigo
ConceptoNombre
CajaCodigo
CajaNombre
LocalCodigo
LocalNombre
CentroCostosCodigo
CentroCostosNombre
Referencia
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
| `ComprobanteAbreviacion` | Abreviación del comprobante. |
| `Fecha` | Fecha del movimiento. |
| `Serie` | Serie del comprobante. |
| `Numero` | Número del comprobante. |
| `MonedaCodigo` | Código de moneda. |
| `MonedaSimbolo` | Símbolo de moneda. |
| `ConceptoCodigo` | Código del concepto. |
| `ConceptoNombre` | Nombre del concepto. |
| `CajaCodigo` | Código de caja. |
| `CajaNombre` | Nombre de la caja. |
| `LocalCodigo` | Código del local. |
| `LocalNombre` | Nombre del local. |
| `CentroCostosCodigo` | Código del centro de costos. |
| `CentroCostosNombre` | Nombre del centro de costos. |
| `Referencia` | Referencia asociada. |
| `Descripcion` | Descripción del movimiento. |
| `Conciliado` | Indica si el movimiento está conciliado. |
| `SubTotal` | Importe sin impuestos. |
| `TotalIVA` | Importe de IVA. |
| `Total` | Importe total del movimiento. |
| `Notas` | Observaciones del movimiento. |
| `UsuarioCodigo` | Código del usuario que registró el movimiento. |
| `UsuarioNombre` | Nombre del usuario. |
| `RegistroHora` | Hora de registro. |
| `RegistroFecha` | Fecha de registro. |

### Ejemplo de request

```
{
  "Mes": "03",
  "Anio": "2026",
  "FechaDesde": "",
  "FechaHasta": "",
  "ComprobanteTipo": 41,
  "ConceptoCodigo": "",
  "MonedaCodigo": "",
  "ComprobanteCodigo": "",
  "Serie": "",
  "Numero": "",
  "LocalCodigo": "",
  "CentroCostosCodigo": "",
  "Referencia": "",
  "Page": 1
}
```

### Ejemplo de response

```
[
  {
    "RegistroId": 1245,
    "ComprobanteCodigo": 41,
    "ComprobanteAbreviacion": "IC",
    "Fecha": "2026-03-15",
    "Serie": "A",
    "Numero": "125",
    "MonedaCodigo": 1,
    "MonedaSimbolo": "$",
    "ConceptoCodigo": "VARIOS",
    "ConceptoNombre": "Ingresos varios",
    "CajaCodigo": 1,
    "CajaNombre": "Caja Principal",
    "LocalCodigo": 1,
    "LocalNombre": "Casa Central",
    "CentroCostosCodigo": "ADM",
    "CentroCostosNombre": "Administración",
    "Referencia": "",
    "Descripcion": "Ingreso de efectivo",
    "Conciliado": "N",
    "SubTotal": 1000.00,
    "TotalIVA": 0.00,
    "Total": 1000.00,
    "Notas": "",
    "UsuarioCodigo": "001",
    "UsuarioNombre": "Administrador",
    "RegistroHora": "10:25:11",
    "RegistroFecha": "2026-03-15"
  }
]
```

## Observaciones

-   La API consulta únicamente movimientos de caja ya registrados en el sistema.
-   El filtro `ComprobanteTipo` permite distinguir entre ingresos y egresos de caja.
-   Se recomienda utilizar filtros de fecha y concepto para reducir el volumen de datos.

## Consideraciones de integración

-   Paginar resultados mediante el parámetro `Page`.
-   Evitar consultas amplias sin filtros de período en ambientes productivos.
-   Persistir los movimientos ya procesados para evitar reprocesamiento.
-   Validar códigos de concepto, moneda, local y centro de costos antes de construir consultas automáticas.

[API Movimientos de Caja - PreviousAPI Movimientos de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-articulos/)[Next - API Movimientos de CajaAPI Precio Base y Precio de Venta](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/precio-base-y-precio-de-venta/)

---

## Links relacionados

- [API Movimientos de Caja - PreviousAPI Movimientos de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-articulos/)
- [Next - API Movimientos de CajaAPI Precio Base y Precio de Venta](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/precio-base-y-precio-de-venta/)

