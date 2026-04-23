# Vendedores y Cobradores - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/vendedores/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/vendedores/

---

## Contenido

# Vendedores y Cobradores

Esta API se especializa en la gestión de los datos básicos de los vendedores y cobradores en su empresa, incluida la configuración de sus comisiones. Esta API se accede mediante la ruta [Configuración > Vendedores](https://zetasoftware.info/ayuda/configuracion/empresa/vendedores/) en la interfaz de la aplicación.

#### URL

-   Descripción: [https://api.zetasoftware.com/z.apis.asoapvendedoresv1?wsdl](https://api.zetasoftware.com/z.apis.asoapvendedoresv1?wsdl)
-   Servicio: [https://api.zetasoftware.com/z.apis.asoapvendedoresv1](https://api.zetasoftware.com/z.apis.asoapvendedoresv1)

#### Método Query

-   **Filtros**:
    -   `CodigoDesde`: T(3)
    -   `CodigoHasta`: T(3)
    -   `NombreContiene`: T(20)
    -   `EsVendedor`: T(1) – Valores admitidos (S=Si, N=No)
    -   `EsCobrador`: T(1) – Valores admitidos (S=Si, N=No)
    -   `LocalCodigo`: T(4)
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `EsVendedor`
    -   `EsCobrador`
    -   `LocalCodigo`
    -   `LocalNombre`

#### Método Save

-   **Datos**:
    -   `Codigo`: T(3) – Obligatorio.
    -   `Nombre`: T(40) – Obligatorio.
    -   `EsVendedor`: T(1) – Valores admitidos (S=Si, N=No)
    -   `EsCobrador`: T(1) – Valores admitidos (S=Si, N=No)
    -   `LocalCodigo`: T(4)
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

#### Método Load

-   **Filtros**:
    -   `Codigo`: T(3) – Obligatorio.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `EsVendedor`
    -   `EsCobrador`
    -   `LocalCodigo`

#### Método Delete

-   **Filtros**:
    -   `Codigo`: T(3) – Obligatorio.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

**Notas**: un vendedor no puede ser eliminado si hay información en Comisiones por Vendedor, Oportunidades de Venta, Documentos, Contratos y/o Clientes.

* * *

[Vendedores y Cobradores - PreviousUnidades de Stock](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/unidades-de-stock/)[Next - Vendedores y CobradoresVentajas Competitivas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ventajas-competitivas/)

---

## Links relacionados

- [Vendedores y Cobradores - PreviousUnidades de Stock](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/unidades-de-stock/)
- [Next - Vendedores y CobradoresVentajas Competitivas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ventajas-competitivas/)
- [Configuración > Vendedores](https://zetasoftware.info/ayuda/configuracion/empresa/vendedores/)

