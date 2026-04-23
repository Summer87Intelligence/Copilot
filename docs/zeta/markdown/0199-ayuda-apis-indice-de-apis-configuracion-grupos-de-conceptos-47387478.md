# API Grupos de Conceptos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-conceptos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-conceptos/

---

## Contenido

# API Grupos de Conceptos

Esta API permite gestionar los grupos de conceptos utilizados en ZetaSoftware.

La funcionalidad corresponde a Configuración > Grupos de Conceptos.

## Casos de uso

-   Consultar grupos de conceptos existentes.
-   Crear nuevos grupos.
-   Modificar grupos existentes.
-   Eliminar grupos sin uso.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapgruposconceptosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapgruposconceptosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapgruposconceptosv1](https://api.zetasoftware.com/z.apis.asoapgruposconceptosv1)

## Método Query

Permite obtener un listado de grupos de conceptos.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Texto a buscar en el nombre. |
| `Page` | N(2) | Sí | Paginación de resultados (100 registros por página). |

### Estructura del response

```
Codigo
Nombre
```

## Método Save

Permite crear o actualizar un grupo de conceptos.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del grupo de conceptos. |
| `Nombre` | T(50) | Sí | Nombre del grupo de conceptos. |

### Resultado

```
Succeed / Error / Mensaje
```

## Método Load

Permite obtener un grupo de conceptos específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del grupo de conceptos. |

### Estructura del response

```
Codigo
Nombre
```

## Método Delete

Permite eliminar un grupo de conceptos.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del grupo de conceptos. |

### Resultado

```
Succeed / Error / Mensaje
```

## Validaciones

-   El código debe ser único.
-   El nombre es obligatorio.

## Consideraciones

-   Los grupos de conceptos organizan los conceptos utilizados en caja, bancos y artículos.
-   Facilitan reportes y análisis.

**Importante:** No es posible eliminar un grupo de conceptos si está asignado a algún concepto.

[API Grupos de Conceptos - PreviousAPI Giros Comerciales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/giros-comerciales/)[Next - API Grupos de ConceptosAPI Grupos de Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-contactos/)

---

## Links relacionados

- [API Grupos de Conceptos - PreviousAPI Giros Comerciales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/giros-comerciales/)
- [Next - API Grupos de ConceptosAPI Grupos de Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-contactos/)

