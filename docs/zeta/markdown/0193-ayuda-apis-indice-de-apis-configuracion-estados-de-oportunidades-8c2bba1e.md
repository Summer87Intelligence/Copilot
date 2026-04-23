# API Estados de Oportunidades - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/estados-de-oportunidades/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/estados-de-oportunidades/

---

## Contenido

# API Estados de Oportunidades

Esta API permite gestionar los estados de las oportunidades de venta, incluyendo su creación, consulta, modificación y eliminación.

La funcionalidad asociada en el sistema se encuentra en Configuración > Estados de Oportunidades.

## Casos de uso

-   Consultar estados de oportunidades.
-   Definir etapas del proceso comercial.
-   Actualizar probabilidades de cierre.
-   Sincronizar pipeline comercial con sistemas externos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapestadosoportunidadesv1?wsdl](https://api.zetasoftware.com/z.apis.asoapestadosoportunidadesv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapestadosoportunidadesv1](https://api.zetasoftware.com/z.apis.asoapestadosoportunidadesv1)

## Método Query

Permite obtener un listado de estados de oportunidades.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | N(2) | No | Código inicial del rango. |
| `CodigoHasta` | N(2) | No | Código final del rango. |

### Estructura del response

```
Codigo
Nombre
PorcentajeProbabilidad
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Codigo` | Código del estado. |
| `Nombre` | Nombre del estado. |
| `PorcentajeProbabilidad` | Probabilidad de cierre asociada. |

## Método Load

Permite obtener un estado específico.

### Parámetro

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
PorcentajeProbabilidad
```

## Método Save

Permite crear o actualizar un estado de oportunidad.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | N(2) | Sí | Código del estado. |
| `Nombre` | T(40) | Sí | Nombre del estado. |
| `PorcentajeProbabilidad` | N(3) | No | Probabilidad de cierre asociada. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar un estado de oportunidad.

### Parámetro

-   `Codigo` – Obligatorio.

### Restricciones

-   No se pueden eliminar ni modificar los estados predefinidos.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   Los estados representan el avance de una oportunidad comercial.
-   El porcentaje de probabilidad permite estimar cierres.
-   Se recomienda mantener una estructura clara de pipeline comercial.

## Consideraciones de integración

-   Sincronizar estados con CRM externos.
-   Utilizar probabilidades para análisis y reportes.
-   Evitar modificar estados en uso en oportunidades activas.

**Importante:** Los estados con código 1, 2, 3, 98 y 99 son predefinidos y no pueden ser eliminados ni modificados.

[API Estados de Oportunidades - PreviousAPI Ejercicios Contables](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ejercicios-contables/)[Next - API Estados de OportunidadesAPI Familias de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/familias-de-articulos/)

---

## Links relacionados

- [API Estados de Oportunidades - PreviousAPI Ejercicios Contables](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ejercicios-contables/)
- [Next - API Estados de OportunidadesAPI Familias de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/familias-de-articulos/)

