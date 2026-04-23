# API Categorías de Oportunidades - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-oportunidades/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-oportunidades/

---

## Contenido

# API Categorías de Oportunidades

Esta API permite gestionar las categorías de oportunidades utilizadas para clasificar oportunidades de venta dentro del sistema. Incluye operaciones de consulta, creación, modificación y eliminación.

La funcionalidad asociada en el sistema se encuentra en Configuración > Categorías de Oportunidades.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcategoriasoportunidadesv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcategoriasoportunidadesv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcategoriasoportunidadesv1](https://api.zetasoftware.com/z.apis.asoapcategoriasoportunidadesv1)

## Métodos disponibles

-   **Query**: Consulta categorías de oportunidades.
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

Permite crear o actualizar una categoría de oportunidades.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Identificador de la categoría. |
| `Nombre` | T(40) | Sí | Nombre de la categoría. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar una categoría de oportunidades.

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
-   Las categorías permiten organizar oportunidades de venta para análisis comercial.

## Consideraciones de integración

-   Utilizar paginación en consultas.
-   Evitar consultas masivas frecuentes sin filtros.
-   Persistir categorías en sistemas externos si se utilizan para reporting.
-   Validar existencia de la categoría antes de asignarla a oportunidades.

[API Categorías de Oportunidades - PreviousAPI Categorías de Clientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-clientes/)[Next - API Categorías de OportunidadesAPI Categorías de Proveedores](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-proveedores/)

---

## Links relacionados

- [API Categorías de Oportunidades - PreviousAPI Categorías de Clientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-clientes/)
- [Next - API Categorías de OportunidadesAPI Categorías de Proveedores](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-proveedores/)

