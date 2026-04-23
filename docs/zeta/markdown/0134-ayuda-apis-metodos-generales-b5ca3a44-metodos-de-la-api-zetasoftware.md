# Métodos de la API - ZetaSoftware

# Métodos de la API

Las APIs de ZetaSoftware exponen cuatro métodos estándar para operar sobre entidades: **Query**, **Load**, **Save** y **Delete**.  
Cada método define su propio contrato de request y response, descritos a continuación.

* * *

## Método Query

Retorna una lista paginada de registros de una entidad. Soporta búsqueda genérica y filtros por campo.

### Request

#### Search

Búsqueda de texto libre sobre un conjunto predefinido de campos de tipo texto de la entidad. El sistema evalúa si el valor enviado está contenido en alguno de esos campos. Los campos considerados varían por entidad y se documentan en cada endpoint.

#### Filters

Permiten restringir los resultados a partir de condiciones sobre campos específicos. Se soportan tres modalidades:

| Modalidad | Descripción |
| --- | --- |
| Rango (_Desde / Hasta_) | Filtra registros cuyos valores numéricos o de fecha se encuentren dentro del  
intervalo definido por los dos campos. |
| Contenido (_like_) | Filtra registros donde el valor enviado aparece en cualquier posición del campo  
evaluado. |
| Igualación (_exact match_) | Filtra registros cuyo campo coincide exactamente con el valor especificado. |

#### Page

Toda consulta retorna un máximo de **500 registros** por página. El campo `Page` indica el número de página solicitado (base 1). Si se omite, se retorna la página 1.

| Valor de `Page` | Registros retornados |
| --- | --- |
| 1 (o ausente) | 0 – 499 |
| 2 | 500 – 999 |
| 3 | 1000 – 1499 |
| n | (n−1)×500 – n×500−1 |

### Response

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `Success` | Boolean | `true` si la operación se completó correctamente;  
`false` en caso contrario. |
| `Error.Code` | String | Código interno del error. Presente solo cuando `Success = false`. |
| `Error.Message` | String | Descripción del error. Presente solo cuando `Success = false`. |
| `Response` | Array | Lista de registros que satisfacen los criterios de la consulta. |

* * *

## Método Load

Retorna la información completa de un registro específico, identificado por su clave de entidad. Es el método previo obligatorio antes de ejecutar un **Save** sobre un registro existente.

### Request

#### Clave de entidad

El único dato requerido es la clave primaria que identifica el registro. Los campos que componen esa clave se documentan en cada endpoint.

### Response

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `Success` | Boolean | `true` si el registro fue localizado y devuelto correctamente. |
| `Error.Code` | String | Código interno del error. Presente solo cuando `Success = false`. |
| `Error.Message` | String | Descripción del error. Presente solo cuando `Success = false`. |
| `Response` | Object | Todos los campos de la tabla principal de la entidad. Cuando la entidad opera  
con tablas subordinadas en una UTL, el objeto incluye también los registros de  
dichas tablas. |

### Observaciones

-   **UTL (Unidad de Transacción Lógica):** cuando una entidad agrupa una tabla principal y una o más tablas subordinadas que deben persistirse en el mismo commit, el `Response` de Load incluye todos esos niveles. El payload resultante es el que debe enviarse al método Save.

* * *

## Método Save

Inserta un nuevo registro o actualiza uno existente. Opera sobre la tabla principal de la entidad y, cuando corresponde, sobre sus tablas subordinadas en una única transacción atómica.

### Request

#### Totalidad de campos

El payload debe incluir la totalidad de los campos de la entidad, no solo los modificados. El flujo recomendado para una actualización es: ejecutar **Load** para obtener el estado actual completo, modificar los campos necesarios sobre esa estructura y enviarla mediante **Save**.

#### UTL

Si la entidad opera con tablas subordinadas, el payload debe incluir también los registros de dichas tablas, en la misma estructura devuelta por Load. Toda la operación se ejecuta en un único commit.

### Response

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `Success` | Boolean | `true` si la inserción o actualización se completó correctamente. |
| `Error.Code` | String | Código interno del error. Presente solo cuando `Success = false`. |
| `Error.Message` | String | Descripción del error. Presente solo cuando `Success = false`. |
| `Detail` | Array | Lista de errores o advertencias de validación. Presente solo cuando  
`Success = false`. |
| `Detail[].Id` | String | Identificador interno del error específico. |
| `Detail[].Tipo` | String | `Error` o `Warning`. |
| `Detail[].Descripcion` | String | Descripción del error o advertencia. |

* * *

## Método Delete

Elimina un registro específico de una entidad. La operación es irreversible; se recomienda confirmar la identidad del registro antes de ejecutarla.

### Request

#### Clave de entidad

El único dato requerido es la clave primaria que identifica el registro a eliminar. Los campos que componen esa clave se documentan en cada endpoint.

### Response

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `Success` | Boolean | `true` si el registro fue eliminado correctamente. |
| `Error.Code` | String | Código interno del error. Presente solo cuando `Success = false`. |
| `Error.Message` | String | Descripción del error. Presente solo cuando `Success = false`. |
| `Detail` | Array | Lista de errores o advertencias adicionales. Presente solo cuando  
`Success = false`. |
| `Detail[].Id` | String | Identificador interno del error específico. |
| `Detail[].Tipo` | String | `Error` o `Warning`. |
| `Detail[].Descripcion` | String | Descripción del error o advertencia. |

[Métodos de la API - PreviousDatos de Conexión](https://zetasoftware.info/ayuda/apis/datos-de-conexion/)[Next - Métodos de la APIProtocolos soportados: SOAP y REST](https://zetasoftware.info/ayuda/apis/soap-y-rest/)
