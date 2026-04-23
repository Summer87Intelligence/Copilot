# API Numeradores de Comprobantes - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-comprobantes/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-comprobantes/

---

## Contenido

# API Numeradores de Comprobantes

Esta API permite gestionar los numeradores utilizados para la generación de comprobantes en ZetaSoftware.

La funcionalidad corresponde a Configuración > [Numeradores de Comprobantes](https://zetasoftware.info/ayuda/configuracion/comprobantes/numeradores-de-comprobantes/).

## Casos de uso

-   Consultar numeradores existentes.
-   Crear o actualizar numeradores.
-   Obtener un numerador específico.
-   Eliminar numeradores sin uso.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapnumeradoresv1?wsdl](https://api.zetasoftware.com/z.apis.asoapnumeradoresv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapnumeradoresv1](https://api.zetasoftware.com/z.apis.asoapnumeradoresv1)

## Método Query

Permite obtener un listado de numeradores de comprobantes.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Búsqueda por nombre. |

### Estructura del response

```
Codigo
Nombre
Serie
UltimoNumero
CodigoLocal
NombreLocal
NombreNumerador
```

## Método Save

Permite crear o actualizar un numerador.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Identificador del numerador. |
| `Nombre` | T(30) | Sí | Nombre del numerador. |
| `Serie` | T(6) | Sí | Serie asociada. |
| `UltimoNumero` | N(10) | No | Último número utilizado. |
| `CodigoLocal` | T(3) | No | Local asociado. |

### Resultado

```
Succeed / Error / Mensaje
```

## Método Load

Permite obtener un numerador específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del numerador. |

### Resultado

```
Codigo
Nombre
Serie
UltimoNumero
CodigoLocal
```

## Método Delete

Permite eliminar un numerador.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del numerador. |

### Resultado

```
Succeed / Error / Mensaje
```

## Consideraciones

-   Los numeradores controlan la numeración de comprobantes.
-   La serie y el último número determinan la secuencia de emisión.

[API Numeradores de Comprobantes - PreviousAPI Motivos de Pérdidas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/motivos-de-perdidas/)[Next - API Numeradores de ComprobantesAPI Numeradores de Impresión](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-impresion/)

---

## Links relacionados

- [API Numeradores de Comprobantes - PreviousAPI Motivos de Pérdidas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/motivos-de-perdidas/)
- [Next - API Numeradores de ComprobantesAPI Numeradores de Impresión](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-impresion/)
- [Numeradores de Comprobantes](https://zetasoftware.info/ayuda/configuracion/comprobantes/numeradores-de-comprobantes/)

