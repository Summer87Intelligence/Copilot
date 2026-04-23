# API Balance Contable - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/balance-contable/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/balance-contable/

---

## Contenido

# API Balance Contable

Esta API permite consultar la información de un balance contable previamente generado en ZetaSoftware. No genera balances ni ejecuta procesos de cierre; únicamente expone los datos de un balance existente para su consulta e integración con sistemas externos.

## Casos de uso

-   Consultar saldos contables generados previamente en ZetaSoftware.
-   Integrar información de balance con sistemas externos de reportes o análisis.
-   Obtener cuentas contables y sus saldos paginados para procesamiento posterior.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapbalancev1?wsdl](https://api.zetasoftware.com/z.apis.asoapbalancev1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapbalancev1](https://api.zetasoftware.com/z.apis.asoapbalancev1)

## Método de consulta

La operación permite recuperar registros del balance contable mediante filtros de consulta y paginación.

## Requisitos previos

-   El balance contable debe haber sido generado previamente en ZetaSoftware.
-   Se debe contar con un código de usuario válido en el parámetro `RolUsuario`.
-   La consulta requiere informar la página a recuperar mediante el parámetro `Page`.

## Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `RolUsuario` | T(3) | Sí | Código del usuario que realiza la consulta. |
| `CuentaCodigoDesde` | T(10) | No | Código de la cuenta contable inicial. Si se envía en cero, se toma la primera cuenta del plan de cuentas. |
| `CuentaCodigoHasta` | T(10) | No | Código de la cuenta contable final. Si se envía vacío, se toma la última cuenta del plan de cuentas. |
| `CuentaNombreContiene` | T(20) | No | Texto a buscar dentro del nombre de la cuenta contable. |
| `CuentaGrupo` | T(3) | No | Código del grupo de cuentas a filtrar. |
| `Page` | N(2) | Sí | Número de página a consultar. Cada página devuelve hasta 500 registros. |

## Estructura del request

```
RolUsuario
CuentaCodigoDesde
CuentaCodigoHasta
CuentaNombreContiene
CuentaGrupo
Page
```

## Ejemplo de request

```
{
  "RolUsuario": "001",
  "CuentaCodigoDesde": "0",
  "CuentaCodigoHasta": "",
  "CuentaNombreContiene": "",
  "CuentaGrupo": "",
  "Page": 1
}
```

## Estructura del response

```
RolUsuario
CuentaCodigo
CuentaNombre
CuentaImputable
CuentaGrupo
CuentaNivel
CuentaCapitulo
Saldo1
Saldo2
```

## Campos devueltos

| Campo | Descripción |
| --- | --- |
| `RolUsuario` | Código del usuario asociado a la consulta. |
| `CuentaCodigo` | Código de la cuenta contable. |
| `CuentaNombre` | Nombre de la cuenta contable. |
| `CuentaImputable` | Indica si la cuenta admite imputaciones. |
| `CuentaGrupo` | Código del grupo contable al que pertenece la cuenta. |
| `CuentaNivel` | Nivel jerárquico de la cuenta dentro del plan de cuentas. |
| `CuentaCapitulo` | Capítulo o clasificación asociada a la cuenta. |
| `Saldo1` | Saldo expresado en la primera moneda solicitada por el usuario |
| `Saldo2` | Saldo expresado en la segunda moneda solicitada por el usuario |

## Ejemplo de response

```
[
  {
    "RolUsuario": "001",
    "CuentaCodigo": "1.1.01",
    "CuentaNombre": "Caja",
    "CuentaImputable": "S",
    "CuentaGrupo": "ACT",
    "CuentaNivel": 3,
    "CuentaCapitulo": "Disponible",
    "Saldo1": 150000.25,
    "Saldo2": 3200.50
  }
]
```

## Observaciones

-   La API consulta únicamente balances ya generados en el sistema.
-   La paginación es obligatoria y retorna hasta 100 registros por página.
-   Los filtros de cuenta son opcionales y permiten acotar el conjunto de resultados.

## Consideraciones de integración

-   Se recomienda iterar por páginas hasta completar la extracción del balance requerido.
-   Antes de integrar, validar el formato esperado de cada campo según su definición funcional y longitud informada.

[API Balance Contable - PreviousGestión PyME y Contabilidad](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/)[Next - API Balance ContableAPI Bandeja de Entrada de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/bandeja-entrada-de-asientos/)

---

## Links relacionados

- [API Balance Contable - PreviousGestión PyME y Contabilidad](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/)
- [Next - API Balance ContableAPI Bandeja de Entrada de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/bandeja-entrada-de-asientos/)

