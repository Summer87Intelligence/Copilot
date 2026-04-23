# API Listas de Precios - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/listas-de-precios/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/listas-de-precios/

---

## Contenido

# API Listas de Precios

Esta API permite gestionar las listas de precios y consultar los precios de venta definidos en ZetaSoftware.

La funcionalidad corresponde a Configuración > Listas de Precios.

## Casos de uso

-   Consultar listas de precios existentes.
-   Obtener precios de venta asociados.
-   Crear o modificar listas de precios.
-   Eliminar listas sin uso.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoaplistasv1?wsdl](https://api.zetasoftware.com/z.apis.asoaplistasv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoaplistasv1](https://api.zetasoftware.com/z.apis.asoaplistasv1)

## Método Query

Permite obtener un listado de listas de precios.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Page` | N(2) | Sí | Paginación de resultados (200 registros por página). |

### Estructura del response

```
Codigo
Titulo
Subtitulo
Pie
Orden
IVA
Catalogo
```

## Método QueryPrecios

Permite obtener los precios de venta asociados a listas de precios.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `TituloContiene` | T(20) | No | Texto a buscar en el título. |
| `Page` | N(2) | Sí | Paginación de resultados. |

### Estructura del response

```
PrecioVentaCodigo
PrecioVentaNombre
PrecioVentaAbrevia
PrecioVentaVigencia
```

## Método Save

Permite crear o actualizar una lista de precios.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código de la lista. |
| `Titulo` | T(50) | Sí | Título de la lista. |
| `Subtitulo` | T(50) | No | Subtítulo. |
| `Pie` | T(50) | No | Texto adicional. |
| `Orden` | T(1) | Sí | Criterio de ordenación. |
| `IVA` | T(1) | Sí | Indica si incluye IVA. |
| `Catalogo` | T(1) | Sí | Formato catálogo (S/N). |

### Resultado

```
Succeed / Error / Mensaje
```

## Método Load

Permite obtener una lista de precios específica.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código de la lista. |

### Estructura del response

```
Codigo
Titulo
Subtitulo
Pie
Orden
IVA
Catalogo
```

## Método Delete

Permite eliminar una lista de precios.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código de la lista. |

### Resultado

```
Succeed / Error / Mensaje
```

## Validaciones

-   El código debe ser único.
-   El título es obligatorio.

## Consideraciones

-   Las listas de precios determinan valores de venta.
-   Se utilizan en ventas y facturación.

**Importante:** No es posible eliminar una lista de precios si está siendo utilizada en operaciones.

[API Listas de Precios - PreviousAPI Grupos de Cuentas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-cuentas/)[Next - API Listas de PreciosAPI Locales Comerciales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/locales-comerciales/)

---

## Links relacionados

- [API Listas de Precios - PreviousAPI Grupos de Cuentas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-cuentas/)
- [Next - API Listas de PreciosAPI Locales Comerciales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/locales-comerciales/)

