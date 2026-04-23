# Unidades de Stock - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/unidades-de-stock/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/unidades-de-stock/

---

## Contenido

# Unidades de Stock

La API para la gestión de Unidades de Stock ofrece una estructura flexible para definir y administrar las unidades de medida que se aplicarán a sus artículos. La API se accede desde [Configuración > Unidades de Stock](https://zetasoftware.info/ayuda/configuracion/stock/unidades-de-stock/) en la interfaz de la aplicación.

#### URL

-   Descripción: [https://api.zetasoftware.com/z.apis.asoapunidadesstockv1?wsdl](https://api.zetasoftware.com/z.apis.asoapunidadesstockv1?wsdl)
-   Servicio: [https://api.zetasoftware.com/z.apis.asoapunidadesstockv1](https://api.zetasoftware.com/z.apis.asoapunidadesstockv1)

#### Método Query

-   **Filtros**:
    -   `CodigoDesde`: T(3)
    -   `CodigoHasta`: T(3)
    -   `NombreContiene`: T(20)
    -   `Page`: N(2) – Obligatorio. Página y muestra de a 500 registros.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `Simbolo`

#### Método Save

-   **Datos**:
    -   `Codigo`: T(3)
    -   `Nombre`: T(40)
    -   `Simbolo`: T(4)
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

#### Método Load

-   **Filtros**:
    -   `Codigo`: T(3) – Obligatorio.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `Simbolo`

En caso de error, el resultado será `False` y un mensaje correspondiente.

#### Método Delete

-   **Filtros**:
    -   `Codigo`: T(3) – Obligatorio.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

**Nota**: Una unidad de stock no puede ser eliminada si existe información en artículos.

* * *

[Unidades de Stock - PreviousTipos de Descuentos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-descuentos/)[Next - Unidades de StockVendedores y Cobradores](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/vendedores/)

---

## Links relacionados

- [Unidades de Stock - PreviousTipos de Descuentos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-descuentos/)
- [Next - Unidades de StockVendedores y Cobradores](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/vendedores/)
- [Configuración > Unidades de Stock](https://zetasoftware.info/ayuda/configuracion/stock/unidades-de-stock/)

