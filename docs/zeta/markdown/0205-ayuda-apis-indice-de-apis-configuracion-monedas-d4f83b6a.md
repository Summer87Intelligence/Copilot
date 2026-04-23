# API Monedas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/monedas/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/monedas/

---

## Contenido

# API Monedas

Esta API permite gestionar las monedas con las que opera la empresa en ZetaSoftware.

La funcionalidad corresponde a Configuración > [Monedas y Cotizaciones](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/).

## Casos de uso

-   Consultar monedas disponibles.
-   Crear o actualizar monedas.
-   Obtener información de una moneda específica.
-   Eliminar monedas sin uso.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapmonedasv1?wsdl](https://api.zetasoftware.com/z.apis.asoapmonedasv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapmonedasv1](https://api.zetasoftware.com/z.apis.asoapmonedasv1)

## Método Query

Permite obtener un listado de monedas.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | N(2) | No | Código inicial del rango. |
| `CodigoHasta` | N(2) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Búsqueda por nombre. |
| `CodigoISO` | T(3) | No | Filtro por código ISO. |
| `Page` | N(2) | Sí | Paginación (hasta 500 registros por página). |

### Estructura del response

```
Codigo
Nombre
Simbolo
CodigoISO
Abreviacion
CotizacionMinima
CotizacionMaxima
DiCambioCuentaGanancias
DiCambioCuentaPerdidas
Redondeo
RedondeoCuentaGanancias
RedondeoCuentaPerdidas
PorcentajeInteresMensual
```

## Método Save

Permite crear o actualizar una moneda.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | N(2) | Sí | Identificador de la moneda. |
| `Nombre` | T(40) | Sí | Nombre de la moneda. |
| `Simbolo` | T(3) | Sí | Símbolo de la moneda. |
| `CodigoISO` | T(3) | Sí | Código ISO 4217. |
| `CotizacionMinima` | N(7.5) | No | Límite mínimo de cotización. |
| `CotizacionMaxima` | N(7.5) | No | Límite máximo de cotización. |
| `DiCambioCuentaGanancias` | T(40) | No | Cuenta contable para ganancias. |
| `DiCambioCuentaPerdidas` | T(40) | No | Cuenta contable para pérdidas. |
| `Redondeo` | N(1) | No | Configuración de redondeo. |
| `RedondeoCuentaGanancias` | T(40) | No | Cuenta para ganancias por redondeo. |
| `RedondeoCuentaPerdidas` | T(40) | No | Cuenta para pérdidas por redondeo. |
| `PorcentajeInteresMensual` | N(2.2) | No | Interés mensual asociado. |

### Resultado

```
Succeed / Error / Mensaje
```

## Método Load

Permite obtener una moneda específica.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | N(2) | Sí | Código de la moneda. |

### Resultado

Devuelve los mismos campos que el método Query.

## Método Delete

Permite eliminar una moneda.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | N(2) | Sí | Código de la moneda. |

### Resultado

```
Succeed / Error / Mensaje
```

## Consideraciones

-   La moneda código 1 (Peso Uruguayo) no puede eliminarse.
-   No se pueden eliminar monedas con datos asociados (cotizaciones, comprobantes, stock, etc.).

[API Monedas - PreviousAPI Marcas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/marcas/)[Next - API MonedasAPI Motivos de Pérdidas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/motivos-de-perdidas/)

---

## Links relacionados

- [API Monedas - PreviousAPI Marcas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/marcas/)
- [Next - API MonedasAPI Motivos de Pérdidas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/motivos-de-perdidas/)
- [Monedas y Cotizaciones](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/)

