# API Numeradores de Impresión - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-impresion/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-impresion/

---

## Contenido

# API Numeradores de Impresión

Esta API permite gestionar los numeradores utilizados en procesos de impresión dentro de ZetaSoftware.

La funcionalidad corresponde a Configuración > [Numeradores de Impresión](https://zetasoftware.info/ayuda/configuracion/comprobantes/numeradores-de-impresion/).

## Casos de uso

-   Consultar numeradores de impresión.
-   Crear o actualizar numeradores.
-   Obtener un numerador específico.
-   Eliminar numeradores.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapfanfoldv1?wsdl](https://api.zetasoftware.com/z.apis.asoapfanfoldv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapfanfoldv1](https://api.zetasoftware.com/z.apis.asoapfanfoldv1)

## Método Query

Permite obtener un listado de numeradores de impresión.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Búsqueda por nombre. |
| `Page` | N(2) | Sí | Paginación (hasta 500 registros por página). |

### Estructura del response

```
Codigo
Nombre
Serie
Numero
Incrementar
CodigoLocal
NombreLocal
```

## Método Save

Permite crear o actualizar un numerador de impresión.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Identificador del numerador. |
| `Nombre` | T(30) | Sí | Nombre del numerador. |
| `Serie` | T(6) | Sí | Serie asociada. |
| `Numero` | N(10) | No | Número actual. |
| `Incrementar` | N(1) | Sí | Valor de incremento de numeración. |
| `CodigoLocal` | N(3) | No | Local asociado. Si es 0 aplica a todos. |

### Resultado

```
Succeed / Error / Mensaje
```

## Método Load

Permite obtener un numerador de impresión específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del numerador. |

### Resultado

```
Codigo
Nombre
Serie
Numero
Incrementar
CodigoLocal
```

## Método Delete

Permite eliminar un numerador de impresión.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del numerador. |

### Resultado

```
Succeed / Error / Mensaje
```

## Consideraciones

-   Controlan la numeración de documentos impresos.
-   El campo `Incrementar` define el salto en la numeración.
-   Pueden aplicarse a un local específico o a todos.

[API Numeradores de Impresión - PreviousAPI Numeradores de Comprobantes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-comprobantes/)[Next - API Numeradores de ImpresiónAPI Números de RUT](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeros-de-rut/)

---

## Links relacionados

- [API Numeradores de Impresión - PreviousAPI Numeradores de Comprobantes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-comprobantes/)
- [Next - API Numeradores de ImpresiónAPI Números de RUT](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeros-de-rut/)
- [Numeradores de Impresión](https://zetasoftware.info/ayuda/configuracion/comprobantes/numeradores-de-impresion/)

