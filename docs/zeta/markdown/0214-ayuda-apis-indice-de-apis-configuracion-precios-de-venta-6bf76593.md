# Precios de Venta - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-de-venta/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-de-venta/

---

## Contenido

# Precios de Venta

La API de [Precios de Venta](https://zetasoftware.info/ayuda/configuracion/stock/precios-de-venta/) permite no solo asignar nombres a los precios de venta sino también especificar formas de cálculo que tomarán como referencia los precios base. Así, se logra un nivel avanzado de personalización y estrategia en la fijación de precios.

#### Especificaciones de URL

-   URL de Descripción: [`https://api.zetasoftware.com/z.apis.asoappreciosventav1?wsdl`](https://api.zetasoftware.com/z.apis.asoappreciosventav1?wsdl)
-   Servicio: [`https://api.zetasoftware.com/z.apis.asoappreciosventav1`](https://api.zetasoftware.com/z.apis.asoappreciosventav1)

#### Método `Query`

-   **Filtros**:
    -   `CodigoDesde y CodigoHasta: N(3)` – Delimitan el rango de códigos de precios de venta a consultar.
    -   `NombreContiene: T(20)` – Permite buscar precios de venta por nombre.
    -   `Page: N(2)` – Obligatorio. Regula la paginación de resultados.
-   **Resultado**: Se ofrecerá un conjunto de datos con elementos como el código, el nombre, la abreviación, el porcentaje aplicado, entre otros, que coinciden con los filtros seleccionados.

#### Método `Save`

-   **Datos**:
    -   `Codigo: N(3)` – Obligatorio. Identificador único del precio de venta.
    -   `Nombre: T(40)` – El nombre descriptivo.
    -   `Porcentaje: N(3.2)` – Porcentaje que se aplicará sobre el precio base.
    -   `SumarUtilidadArticulo: T(1)` – Obligatorio. Indica si se debe sumar la utilidad del artículo (S=Si, N=No).
    -   `VigenciaHasta: AAAA-MM-DD` – Fecha hasta la cual será vigente este precio de venta.
-   **Resultado**: La operación podrá resultar en éxito (`Succeed`), en error (`Error`) o emitirá un mensaje más detallado.

#### Método `Load` y `Delete`

-   **Filtros**:
    -   `Codigo: N(3)` – Obligatorio. Identificador del precio de venta para ambas operaciones.
-   **Nota**: No se puede eliminar un precio de venta si está vinculado a distintos elementos como listas de precios, documentos, clientes, etc.

* * *

[Precios de Venta - PreviousPrecios Base](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-base/)[Next - Precios de VentaReferencias](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/referencias/)

---

## Links relacionados

- [Precios de Venta - PreviousPrecios Base](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-base/)
- [Next - Precios de VentaReferencias](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/referencias/)
- [Precios de Venta](https://zetasoftware.info/ayuda/configuracion/stock/precios-de-venta/)

