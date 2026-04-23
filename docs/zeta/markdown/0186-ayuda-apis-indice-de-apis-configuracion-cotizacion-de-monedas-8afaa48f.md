# API Cotización de Monedas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cotizacion-de-monedas/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cotizacion-de-monedas/

---

## Contenido

# API Cotización de Monedas

Esta API permite gestionar y consultar las cotizaciones de monedas utilizadas en la empresa. Incluye operaciones de consulta, creación, modificación y eliminación de cotizaciones.

La funcionalidad asociada en el sistema se encuentra en Configuración > Monedas y Cotizaciones.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapmonedascotizacionesv1?wsdl](https://api.zetasoftware.com/z.apis.asoapmonedascotizacionesv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapmonedascotizacionesv1](https://api.zetasoftware.com/z.apis.asoapmonedascotizacionesv1)

## Método Query

Permite obtener un listado paginado de cotizaciones de monedas.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `MonedaCodigo` | N(2) | Sí | Código de la moneda. |
| `FechaDesde` | AAAA-MM-DD | Sí | Fecha inicial del rango. |
| `FechaHasta` | AAAA-MM-DD | Sí | Fecha final del rango. |
| `Page` | N(2) | Sí | Número de página (100 registros por página). |

### Estructura del response

```
MonedaCodigo
Fecha
Dia
CotizacionComercial
CotizacionFiscal
```

## Método Load

Permite obtener una cotización específica de una moneda en una fecha determinada.

### Parámetros

-   `MonedaCodigo` – Obligatorio
-   `Fecha` – Obligatorio

### Resultado

```
Fecha
CotizacionComercial
CotizacionFiscal
```

## Método Save

Permite crear o actualizar una cotización de moneda.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `MonedaCodigo` | N(2) | Sí | Código de la moneda. |
| `Fecha` | AAAA-MM-DD | Sí | Fecha de la cotización. No puede ser futura. |
| `CotizacionComercial` | N(8.8) | Sí | Valor de cotización comercial. |
| `CotizacionFiscal` | N(8.8) | Sí | Valor de cotización fiscal. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar una cotización de moneda.

### Parámetros

-   `MonedaCodigo` – Obligatorio
-   `Fecha` – Obligatorio

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   El método `Query` permite consultas masivas con paginación.
-   El método `Load` es para consultas puntuales.
-   El método `Save` permite alta y modificación.
-   Las cotizaciones son fundamentales para operaciones en múltiples monedas.

## Consideraciones de integración

-   Utilizar paginación para consultas de grandes volúmenes.
-   Validar que la fecha no sea futura antes de guardar.
-   Evitar eliminación de cotizaciones utilizadas en procesos contables.

[API Cotización de Monedas - PreviousAPI Sucursales de Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/sucursales-de-contactos/)[Next - API Cotización de MonedasAPI Cuentas Bancarias](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cuentas-bancarias/)

---

## Links relacionados

- [Next - API Cotización de MonedasAPI Cuentas Bancarias](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cuentas-bancarias/)
- [API Cotización de Monedas - PreviousAPI Sucursales de Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/sucursales-de-contactos/)

