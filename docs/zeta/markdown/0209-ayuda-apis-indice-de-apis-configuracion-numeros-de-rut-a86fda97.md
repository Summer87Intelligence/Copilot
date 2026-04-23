# API Números de RUT - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeros-de-rut/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeros-de-rut/

---

## Contenido

# API Números de RUT

Esta API permite gestionar los números de RUT utilizados en el módulo de Contabilidad de ZetaSoftware.

La funcionalidad corresponde a Configuración > [Números de RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/).

## Casos de uso

-   Consultar números de RUT registrados.
-   Crear o actualizar registros de RUT.
-   Obtener un RUT específico.
-   Eliminar registros sin uso.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoaprutv1?wsdl](https://api.zetasoftware.com/z.apis.asoaprutv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoaprutv1](https://api.zetasoftware.com/z.apis.asoaprutv1)

## Método Query

Permite obtener un listado de números de RUT.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `RUTDesde` | T(30) | No | RUT inicial del rango. |
| `RUTHasta` | T(30) | No | RUT final del rango. |
| `NombreContiene` | T(20) | No | Búsqueda parcial por nombre. |
| `Page` | N(2) | Sí | Paginación de resultados (500 registros por página). |

### Estructura del response

```
RUT
Numero
```

## Método Save

Permite crear o actualizar un número de RUT.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `RUT` | T(30) | Sí | Identificador único de RUT. |
| `Nombre` | T(80) | Sí | Nombre asociado al RUT. |

### Resultado

```
Succeed / Error / Mensaje
```

## Método Load

Permite obtener un número de RUT específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `RUT` | T(30) | Sí | Identificador único de RUT. |

### Resultado

```
RUT
Nombre
```

## Método Delete

Permite eliminar un número de RUT.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `RUT` | T(30) | Sí | Identificador único de RUT. |

### Resultado

```
Succeed / Error / Mensaje
```

## Consideraciones

-   Los números de RUT se utilizan en procesos contables y fiscales.
-   Se recomienda validar previamente la existencia del RUT antes de crear o modificar registros.

**Importante:** No es posible eliminar un registro si existe información relacionada en tipos de asientos.

[API Números de RUT - PreviousAPI Numeradores de Impresión](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-impresion/)[Next - API Números de RUTOrigen de los Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/origen-de-los-contactos/)

---

## Links relacionados

- [API Números de RUT - PreviousAPI Numeradores de Impresión](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-impresion/)
- [Next - API Números de RUTOrigen de los Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/origen-de-los-contactos/)
- [Números de RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/)

