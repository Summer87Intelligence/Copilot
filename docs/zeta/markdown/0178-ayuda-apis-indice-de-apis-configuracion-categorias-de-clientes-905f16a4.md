# API Categorías de Clientes - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-clientes/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-clientes/

---

## Contenido

# API Categorías de Clientes

Esta API permite gestionar las categorías de clientes utilizadas para segmentar la base de contactos. Incluye operaciones de consulta, creación, modificación y eliminación.

La funcionalidad asociada en el sistema se encuentra en Configuración > Categorías de Clientes.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcategoriasclientesv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcategoriasclientesv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcategoriasclientesv1](https://api.zetasoftware.com/z.apis.asoapcategoriasclientesv1)

## Métodos disponibles

-   **Query**: Consulta categorías de clientes.
-   **Load**: Obtiene una categoría específica.
-   **Save**: Crea o actualiza categorías.
-   **Delete**: Elimina categorías.

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

Permite crear o actualizar una categoría de clientes.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Identificador de la categoría. |
| `Nombre` | T(50) | Sí | Nombre de la categoría. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar una categoría de clientes.

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
-   Las categorías permiten segmentar clientes para análisis comercial y gestión CRM.

## Consideraciones de integración

-   Utilizar paginación en consultas.
-   Evitar consultas masivas frecuentes sin filtros.
-   Validar existencia de la categoría antes de asignarla a clientes.

[API Categorías de Clientes - PreviousAPI Categorías de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-articulos/)[Next - API Categorías de ClientesAPI Categorías de Oportunidades](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-oportunidades/)

---

## Links relacionados

- [API Categorías de Clientes - PreviousAPI Categorías de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-articulos/)
- [Next - API Categorías de ClientesAPI Categorías de Oportunidades](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-oportunidades/)

