# API Marcas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/marcas/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/marcas/

---

## Contenido

# API Marcas

Esta API permite gestionar las marcas de artículos dentro de ZetaSoftware.

La funcionalidad corresponde a Configuración > Marcas.

## Casos de uso

-   Consultar marcas existentes.
-   Crear o actualizar marcas.
-   Eliminar marcas.
-   Utilizar marcas para segmentación y reportes.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapmarcasv1?wsdl](https://api.zetasoftware.com/z.apis.asoapmarcasv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapmarcasv1](https://api.zetasoftware.com/z.apis.asoapmarcasv1)

## Método Query

Permite obtener un listado de marcas.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Texto a buscar en el nombre. |
| `Page` | N(2) | Sí | Paginación (100 registros por página). |

### Estructura del response

```
Codigo
Nombre
```

## Método Save

Permite crear o actualizar una marca.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Identificador de la marca. |
| `Nombre` | T(50) | Sí | Nombre de la marca. |

### Resultado

```
Succeed / Error / Mensaje
```

## Método Load

Permite obtener una marca específica.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código de la marca. |

### Resultado

```
Codigo
Nombre
```

## Método Delete

Permite eliminar una marca.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código de la marca. |

### Resultado

```
Succeed / Error / Mensaje
```

## Consideraciones

-   Las marcas se utilizan para clasificar artículos.
-   Son clave para filtros, reportes y análisis de ventas.

[API Marcas - PreviousAPI Locales Comerciales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/locales-comerciales/)[Next - API MarcasAPI Monedas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/monedas/)

---

## Links relacionados

- [API Marcas - PreviousAPI Locales Comerciales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/locales-comerciales/)
- [Next - API MarcasAPI Monedas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/monedas/)

