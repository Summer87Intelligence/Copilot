# API Categoría de Contratos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categoria-de-contratos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categoria-de-contratos/

---

## Contenido

# API Categoría de Contratos

Esta API permite gestionar las categorías de contratos utilizadas para clasificar contratos dentro del sistema. Incluye operaciones de consulta, creación, modificación y eliminación.

La funcionalidad asociada en el sistema se encuentra en Configuración > Categorías de Contratos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcategoriascontratosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcategoriascontratosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcategoriascontratosv1](https://api.zetasoftware.com/z.apis.asoapcategoriascontratosv1)

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

Permite crear o actualizar una categoría de contrato.

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

Permite eliminar una categoría de contrato.

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
-   Las categorías se utilizan para clasificar contratos dentro del sistema.

## Consideraciones de integración

-   Utilizar paginación en consultas.
-   Evitar consultas masivas frecuentes sin filtros.
-   Validar existencia de la categoría antes de asignarla a contratos.

[API Categoría de Contratos - PreviousAPI Campos Adicionales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campos-adicionales/)[Next - API Categoría de ContratosAPI Categorías de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-articulos/)

---

## Links relacionados

- [API Categoría de Contratos - PreviousAPI Campos Adicionales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campos-adicionales/)
- [Next - API Categoría de ContratosAPI Categorías de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-articulos/)

