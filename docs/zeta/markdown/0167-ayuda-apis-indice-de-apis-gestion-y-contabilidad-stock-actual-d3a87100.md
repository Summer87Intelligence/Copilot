# API Stock Actual - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/stock-actual/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/stock-actual/

---

## Contenido

# API Stock Actual

Esta API permite consultar el stock actual de artículos en la empresa, tanto de forma masiva como individual. Proporciona información por depósito, lote y vencimiento, permitiendo un control detallado del inventario.

Existen dos servicios diferenciados según el tipo de consulta: uno para todos los artículos y otro para un artículo específico.

## Endpoints del servicio

### Stock de todos los artículos

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapstockactualv3?wsdl](https://api.zetasoftware.com/z.apis.asoapstockactualv3?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapstockactualv3](https://api.zetasoftware.com/z.apis.asoapstockactualv3)

### Stock de un artículo

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapstockactualarticulov1?wsdl](https://api.zetasoftware.com/z.apis.asoapstockactualarticulov1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapstockactualarticulov1](https://api.zetasoftware.com/z.apis.asoapstockactualarticulov1)

## Método Query

Permite obtener el stock actual de artículos por depósito, lote y vencimiento.

### Requisitos previos

-   Acceso habilitado a la API.
-   Definir filtros de consulta según volumen de datos esperado.

### Parámetros de entrada

#### Filtros específicos (solo API de un artículo)

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `ArticuloCodigo` | T(20) | Sí | Código del artículo. |
| `Lote` | T(20) | No | Lote del artículo. |

#### Filtros comunes

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `VencimientoDesde` | AAAA-MM-DD | No | Fecha mínima de vencimiento. |
| `VencimientoHasta` | AAAA-MM-DD | No | Fecha máxima de vencimiento. |
| `DepositoCodigo` | N(3) | No | Código del depósito. |
| `LocalCodigo` | N(2) | No | Código del local. |
| `CantidadDesde` | N(12.5) | No | Cantidad mínima. |
| `CantidadHasta` | N(12.5) | No | Cantidad máxima. |
| `Page` | N(2) | Sí | Paginación (500 registros por página). |

### Estructura del response

```
ArticuloCodigo
ArticuloNombre
ArticuloAbrevia
Lote
Vencimiento
DepositoCodigo
DepositoNombre
DepositoAbrevia
LocalCodigo
StockActual
```

## Diferencias entre APIs

-   La API de todos los artículos devuelve únicamente artículos con stock distinto de cero.
-   La API individual requiere `ArticuloCodigo` y devuelve solo ese artículo.
-   La API general puede devolver grandes volúmenes de datos y requiere paginación obligatoria.

## Método StockActualModificado

Permite obtener artículos cuyo stock fue modificado desde la última consulta.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `ArticuloCodigo` | T(20) | No | Si se envía vacío, devuelve todos los artículos modificados. |

### Estructura del response

```
DepositoCodigo
ArticuloCodigo
Lote
Vencimiento
Stock
```

### Comportamiento

-   Devuelve únicamente artículos con cambios recientes.
-   Luego de consultar, el artículo deja de considerarse “modificado”.

## Observaciones

-   La API de todos los artículos solo devuelve artículos activos.
-   Los artículos sin stock no se incluyen en la consulta general.
-   Se recomienda utilizar filtros para optimizar la consulta.

## Consideraciones de integración

-   Evitar consultas masivas frecuentes sin filtros.
-   Utilizar `StockActualModificado` para sincronizaciones incrementales.
-   Controlar la frecuencia de llamadas para evitar bloqueos del servicio.
-   Se recomienda mantener una base de datos local con el stock de los artículos para evitar un uso excesivo de los recursos de la base de datos de ZetaSoftware. Esta precaución es especialmente relevante para la API que no posee un filtro de artículo, dado que su uso intensivo podría llevar al bloqueo automático de la API.

[API Stock Actual - PreviousAPI Recibo de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-pago/)[Next - API Stock ActualAPI Tarjetas Recibidas](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/tarjetas-recibidas/)

---

## Links relacionados

- [API Stock Actual - PreviousAPI Recibo de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-pago/)
- [Next - API Stock ActualAPI Tarjetas Recibidas](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/tarjetas-recibidas/)

