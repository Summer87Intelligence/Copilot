# API Categorías de Artículos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-articulos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-articulos/

---

## Contenido

# API Categorías de Artículos

Esta API permite gestionar las categorías de artículos utilizadas para organizar productos y servicios dentro del sistema. Incluye operaciones de consulta, creación, modificación y eliminación.

La funcionalidad asociada en el sistema se encuentra en Configuración > Categorías de Artículos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcategoriasarticulosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcategoriasarticulosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcategoriasarticulosv1](https://api.zetasoftware.com/z.apis.asoapcategoriasarticulosv1).

## Método Query

Permite obtener un listado de categorías aplicando filtros.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Filtro por nombre de categoría. |
| `Page` | N(2) | Sí | Número de página. |

### Estructura del response

```
Codigo
Nombre
```

## Método Load

Permite obtener una categoría específica.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
```

## Método Save

Permite crear o actualizar una categoría de artículos.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Identificador de la categoría. |
| `Nombre` | T(30) | Sí | Nombre de la categoría. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar una categoría de artículos.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   El método `Query` permite consultas masivas.
-   El método `Load` es recomendado para consultas puntuales.
-   El método `Save` permite alta y modificación.
-   Las categorías se utilizan para organizar artículos dentro del sistema.

## Consideraciones de integración

-   Utilizar paginación en consultas.
-   Evitar consultas masivas frecuentes sin filtros.
-   Validar existencia de la categoría antes de asignarla a artículos.

[API Categorías de Artículos - PreviousAPI Categoría de Contratos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categoria-de-contratos/)[Next - API Categorías de ArtículosAPI Categorías de Clientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-clientes/)

---

## Links relacionados

- [API Categorías de Artículos - PreviousAPI Categoría de Contratos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categoria-de-contratos/)
- [Next - API Categorías de ArtículosAPI Categorías de Clientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-clientes/)

