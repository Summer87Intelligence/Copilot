# API Categorías de Proveedores - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-proveedores/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-proveedores/

---

## Contenido

# API Categorías de Proveedores

# API de categorías de proveedores

Esta API permite gestionar las categorías de proveedores utilizadas para segmentar contactos de tipo proveedor dentro del sistema. Incluye operaciones de consulta, creación, modificación y eliminación.

La funcionalidad asociada en el sistema se encuentra en Configuración > Categorías de Proveedores.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcategoriasproveedoresv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcategoriasproveedoresv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcategoriasproveedoresv1](https://api.zetasoftware.com/z.apis.asoapcategoriasproveedoresv1)

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

Permite crear o actualizar una categoría de proveedores.

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

Permite eliminar una categoría de proveedores.

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
-   Las categorías permiten segmentar proveedores para mejorar la gestión operativa.

## Consideraciones de integración

-   Utilizar paginación en consultas.
-   Evitar consultas masivas frecuentes sin filtros.
-   Persistir categorías en sistemas externos si se utilizan para análisis o integración.
-   Validar existencia de la categoría antes de asignarla a proveedores.

[API Categorías de Proveedores - PreviousAPI Categorías de Oportunidades](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-oportunidades/)[Next - API Categorías de ProveedoresAPI Centros de Costo](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/centros-de-costo/)

---

## Links relacionados

- [API Categorías de Proveedores - PreviousAPI Categorías de Oportunidades](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-oportunidades/)
- [Next - API Categorías de ProveedoresAPI Centros de Costo](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/centros-de-costo/)

