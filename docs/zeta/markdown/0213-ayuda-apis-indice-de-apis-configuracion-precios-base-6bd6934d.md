# Precios Base - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-base/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-base/

---

## Contenido

# Precios Base

La API de [Precios Base](https://zetasoftware.info/ayuda/configuracion/stock/precios-de-venta/) gestiona de manera eficaz los precios de sus productos o servicios. Mediante su implementación, es posible establecer distintos nombres para los precios base, los cuales posteriormente podrán ser asignados a los artículos de la empresa.

#### Especificaciones de URL

-   **URL de Descripción**: [`https://api.zetasoftware.com/z.apis.asoappreciosbasev1?wsdl`](https://api.zetasoftware.com/z.apis.asoappreciosbasev1?wsdl)
-   **Servicio**: [`https://api.zetasoftware.com/z.apis.asoappreciosbasev1`](https://api.zetasoftware.com/z.apis.asoappreciosbasev1)

#### Método `Query`

-   **Filtros**:
    -   `CodigoDesde y CodigoHasta: T(3)` – Estos filtros permiten definir un rango específico de códigos de precios base para consultar.
    -   `NombreContiene: T(20)` – Este parámetro facilita la búsqueda de precios base por su nombre.
    -   `Page: N(2)` – Obligatorio. Este parámetro regula la paginación de los resultados.
-   **Resultado**: Se obtendrá un conjunto de datos que incluye el código y el nombre de cada precio base que coincida con los filtros aplicados.

#### Método `Save`

-   **Datos**:
    -   `Codigo: T(3)` – Obligatorio. Este es el identificador único del precio base.
    -   `Nombre: T(40)` – Obligatorio. El nombre descriptivo del precio base.
-   **Resultado**: La respuesta indicará si la operación fue exitosa (`Succeed`), si ocurrió un error (`Error`) o proporcionará un mensaje detallado en caso necesario.

#### Método `Load`

-   **Filtros**:
    -   `Codigo: T(3)` – Obligatorio. Este parámetro es el identificador único del precio base que se desea consultar.

#### Método `Delete`

-   **Filtros**:
    -   `Codigo: T(3)` – Obligatorio. Identificador único del precio base que se desea eliminar.
-   **Nota**: No se podrá eliminar un precio base si está vinculado a precios de venta y/o a precios base de artículos.
-   **Resultado**: Similar al método `Save`, se obtendrá una respuesta que indica si la operación fue exitosa, fallida o se proporcionará un mensaje específico.

* * *

[Precios Base - PreviousPlan de Cuentas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/plan-de-cuentas/)[Next - Precios BasePrecios de Venta](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-de-venta/)

---

## Links relacionados

- [Precios Base - PreviousPlan de Cuentas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/plan-de-cuentas/)
- [Next - Precios BasePrecios de Venta](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-de-venta/)
- [Precios Base](https://zetasoftware.info/ayuda/configuracion/stock/precios-de-venta/)

