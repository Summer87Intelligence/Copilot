# Plan de Cuentas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/plan-de-cuentas/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/plan-de-cuentas/

---

## Contenido

# Plan de Cuentas

La API de Plan de Cuentas permite la consulta detallada del [plan contable de la empresa](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/), incluyendo sus cuentas y capítulos.

#### Especificaciones de URL

-   **URL de Descripción**: [`https://api.zetasoftware.com/z.apis.asoapplancuentasv2?wsdl`](https://api.zetasoftware.com/z.apis.asoapplancuentasv2?wsdl)
-   **Servicio**: [`https://api.zetasoftware.com/z.apis.asoapplancuentasv2`](https://api.zetasoftware.com/z.apis.asoapplancuentasv2)

#### Método `Query`

-   **Filtros**:
    -   `CodigoDesde y CodigoHasta: T(10)` – Establecen el rango de códigos para la búsqueda de cuentas.
    -   `NombreContiene: T(20)` – Búsqueda textual en el nombre de las cuentas.
    -   `EsImputable: T(1)` – Opcional. Indica si la cuenta es imputable (`S`\=Sí, `N`\=No).
    -   `MonedaCodigo: N(2)` – Código de la moneda asociada a la cuenta.
    -   `GrupoCodigo: T(3)` – Código del grupo de cuentas.
    -   `Page: N(2)` – Obligatorio. Paginación de los resultados.
-   **Resultado**: El resultado incluirá una amplia gama de atributos asociados con cada cuenta, tales como su código, nombre, si es imputable, entre otros.

#### Parámetros del Resultado

-   `Codigo, Nombre, CodigoNombre, EsImputable, CodigoPresentacion` detallan características básicas de la cuenta.
-   `Capitulo` indica la categoría más general, como activo, pasivo, patrimonio, etc.
-   `CuentaPadre` señala a la cuenta de nivel superior más próxima.
-   `Nivel` muestra la cantidad de dígitos de la cuenta, indicando su posición jerárquica.
-   `GrupoCodigo, GrupoNombre` indican el grupo al que pertenece la cuenta.
-   `CalculaDifCambio, MonedaCodigo, MonedaSimbolo, MonedaNombre, MonedaAbreviacion, LiteralTributario, UsaCentroCostos` proporcionan detalles adicionales, incluyendo la moneda asociada y otros atributos financieros.

* * *

[Plan de Cuentas - PreviousPaíses](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/paises/)[Next - Plan de CuentasPrecios Base](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-base/)

---

## Links relacionados

- [Plan de Cuentas - PreviousPaíses](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/paises/)
- [Next - Plan de CuentasPrecios Base](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-base/)
- [plan contable de la empresa](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/)

