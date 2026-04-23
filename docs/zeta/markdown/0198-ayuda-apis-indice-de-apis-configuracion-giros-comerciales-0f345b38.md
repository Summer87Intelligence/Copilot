# API Giros Comerciales - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/giros-comerciales/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/giros-comerciales/

---

## Contenido

# API Giros Comerciales

Esta API permite gestionar los giros comerciales definidos en ZetaSoftware.

La funcionalidad corresponde a Configuración > Giros Comerciales.

## Casos de uso

-   Consultar giros comerciales existentes.
-   Crear nuevos giros comerciales.
-   Modificar giros existentes.
-   Eliminar giros comerciales sin uso.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapgiroscomercialesv1?wsdl](https://api.zetasoftware.com/z.apis.asoapgiroscomercialesv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapgiroscomercialesv1](https://api.zetasoftware.com/z.apis.asoapgiroscomercialesv1)

## Método Query

Permite obtener un listado de giros comerciales.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Texto a buscar en el nombre. |
| `Page` | N(2) | Sí | Paginación de resultados (500 registros por página). |

### Estructura del response

```
Codigo
Nombre
```

## Método Save

Permite crear o actualizar un giro comercial.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del giro comercial. |
| `Nombre` | T(50) | Sí | Nombre del giro comercial. |

### Resultado

```
Succeed / Error / Mensaje
```

## Método Load

Permite obtener un giro comercial específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del giro comercial. |

### Estructura del response

```
Codigo
Nombre
```

## Método Delete

Permite eliminar un giro comercial.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del giro comercial. |

### Resultado

```
Succeed / Error / Mensaje
```

## Validaciones

-   El código debe ser único.
-   El nombre es obligatorio.

## Consideraciones

-   Los giros comerciales se utilizan en contactos.
-   Impactan en la segmentación de clientes y proveedores.

**Importante:** No es posible eliminar un giro comercial si está asignado a contactos.

[API Giros Comerciales - PreviousAPI Foto de Artículo](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/foto-de-articulo/)[Next - API Giros ComercialesAPI Grupos de Conceptos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-conceptos/)

---

## Links relacionados

- [API Giros Comerciales - PreviousAPI Foto de Artículo](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/foto-de-articulo/)
- [Next - API Giros ComercialesAPI Grupos de Conceptos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-conceptos/)

