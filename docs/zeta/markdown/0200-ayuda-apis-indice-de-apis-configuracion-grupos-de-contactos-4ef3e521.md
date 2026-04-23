# API Grupos de Contactos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-contactos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-contactos/

---

## Contenido

# API Grupos de Contactos

Esta API permite gestionar los grupos de contactos definidos en ZetaSoftware.

La funcionalidad corresponde a Configuración > Grupos de Contactos.

## Casos de uso

-   Consultar grupos de contactos existentes.
-   Crear nuevos grupos.
-   Modificar grupos existentes.
-   Eliminar grupos sin uso.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapgruposcontactosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapgruposcontactosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapgruposcontactosv1](https://api.zetasoftware.com/z.apis.asoapgruposcontactosv1)

## Método Query

Permite obtener un listado de grupos de contactos.

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

Permite crear o actualizar un grupo de contactos.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del grupo de contactos. |
| `Nombre` | T(50) | Sí | Nombre del grupo de contactos. |

### Resultado

```
Succeed / Error / Mensaje
```

## Método Load

Permite obtener un grupo de contactos específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del grupo de contactos. |

### Estructura del response

```
Codigo
Nombre
```

## Método Delete

Permite eliminar un grupo de contactos.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del grupo de contactos. |

### Resultado

```
Succeed / Error / Mensaje
```

## Validaciones

-   El código debe ser único.
-   El nombre es obligatorio.

## Consideraciones

-   Los grupos de contactos permiten segmentar clientes y proveedores.
-   Facilitan búsquedas y reportes.

**Importante:** No es posible eliminar un grupo de contactos si está asignado a registros existentes.

[API Grupos de Contactos - PreviousAPI Grupos de Conceptos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-conceptos/)[Next - API Grupos de ContactosAPI Grupos de Cuentas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-cuentas/)

---

## Links relacionados

- [API Grupos de Contactos - PreviousAPI Grupos de Conceptos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-conceptos/)
- [Next - API Grupos de ContactosAPI Grupos de Cuentas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-cuentas/)

