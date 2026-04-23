# API Ejercicios Contables - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ejercicios-contables/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ejercicios-contables/

---

## Contenido

# API Ejercicios Contables

Esta API permite consultar los ejercicios contables definidos en la empresa, incluyendo su período, estado y cantidad de asientos asociados.

La funcionalidad asociada en el sistema se encuentra en Configuración > Ejercicios Contables.

## Casos de uso

-   Consultar ejercicios contables existentes.
-   Validar períodos contables activos o cerrados.
-   Integrar información contable con sistemas externos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapejerciciosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapejerciciosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapejerciciosv1](https://api.zetasoftware.com/z.apis.asoapejerciciosv1)

## Método Query

Permite obtener un listado paginado de ejercicios contables configurados en la empresa.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | N(2) | No | Código inicial del rango de ejercicios a consultar. |
| `CodigoHasta` | N(2) | No | Código final del rango de ejercicios a consultar. |
| `Page` | N(2) | Sí | Número de página. |

### Estructura del response

```
Codigo
Nombre
Desde
Hasta
Cerrado
CantidadAsientos
Notas
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Codigo` | Código del ejercicio contable. |
| `Nombre` | Nombre descriptivo del ejercicio. |
| `Desde` | Fecha de inicio del ejercicio. |
| `Hasta` | Fecha de finalización del ejercicio. |
| `Cerrado` | Indica si el ejercicio está cerrado. |
| `CantidadAsientos` | Cantidad de asientos registrados. |
| `Notas` | Información adicional. |

## Observaciones

-   El método `Query` permite consultas masivas con paginación.
-   El estado `Cerrado` indica si el ejercicio admite nuevos movimientos contables.
-   La cantidad de asientos permite validar el volumen de actividad contable.

## Consideraciones de integración

-   Validar el estado del ejercicio antes de registrar movimientos.
-   Utilizar paginación para consultas con múltiples ejercicios.
-   Sincronizar ejercicios con sistemas contables externos.
-   Evitar operar sobre ejercicios cerrados.

[API Ejercicios Contables - PreviousAPI Depósitos de Stock](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/depositos-de-stock/)[Next - API Ejercicios ContablesAPI Estados de Oportunidades](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/estados-de-oportunidades/)

---

## Links relacionados

- [API Ejercicios Contables - PreviousAPI Depósitos de Stock](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/depositos-de-stock/)
- [Next - API Ejercicios ContablesAPI Estados de Oportunidades](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/estados-de-oportunidades/)

