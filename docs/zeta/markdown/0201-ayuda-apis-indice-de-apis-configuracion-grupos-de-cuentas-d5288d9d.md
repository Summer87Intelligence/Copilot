# API Grupos de Cuentas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-cuentas/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-cuentas/

---

## Contenido

# API Grupos de Cuentas

Esta API permite gestionar los grupos de cuentas definidos en ZetaSoftware.

La funcionalidad corresponde a Configuración > Grupos de Cuentas dentro del módulo de Contabilidad.

## Casos de uso

-   Consultar grupos de cuentas existentes.
-   Crear nuevos grupos contables.
-   Modificar grupos existentes.
-   Eliminar grupos sin uso.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapgruposcuentasv1?wsdl](https://api.zetasoftware.com/z.apis.asoapgruposcuentasv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapgruposcuentasv1](https://api.zetasoftware.com/z.apis.asoapgruposcuentasv1)

## Método Query

Permite obtener un listado de grupos de cuentas.

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

Permite crear o actualizar un grupo de cuentas.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del grupo de cuentas. |
| `Nombre` | T(40) | Sí | Nombre del grupo de cuentas. |

### Resultado

```
Succeed / Error / Mensaje
```

## Método Load

Permite obtener un grupo de cuentas específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del grupo de cuentas. |

### Estructura del response

```
Codigo
Nombre
```

## Método Delete

Permite eliminar un grupo de cuentas.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del grupo de cuentas. |

### Resultado

```
Succeed / Error / Mensaje
```

## Validaciones

-   El código debe ser único.
-   El nombre es obligatorio.

## Consideraciones

-   Los grupos de cuentas organizan el plan contable.
-   Son utilizados para clasificar cuentas contables.

**Importante:** No es posible eliminar un grupo de cuentas si está asociado a cuentas contables.

[API Grupos de Cuentas - PreviousAPI Grupos de Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-contactos/)[Next - API Grupos de CuentasAPI Listas de Precios](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/listas-de-precios/)

---

## Links relacionados

- [API Grupos de Cuentas - PreviousAPI Grupos de Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/grupos-de-contactos/)
- [Next - API Grupos de CuentasAPI Listas de Precios](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/listas-de-precios/)

