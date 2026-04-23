# Ventajas Competitivas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ventajas-competitivas/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ventajas-competitivas/

---

## Contenido

# Ventajas Competitivas

Esta API se enfoca en permitir la configuración de las ventajas competitivas que la empresa considera tener frente a sus competidores. La API es accesible desde la ruta [Configuración > Ventajas Competitivas](https://zetasoftware.info/ayuda/configuracion/oportunidades-y-contratos/ventajas-competitivas/) en la interfaz de la aplicación.

#### URL

-   Descripción: [https://api.zetasoftware.com/z.apis.asoapventajascompetitivasv1?wsdl](https://api.zetasoftware.com/z.apis.asoapventajascompetitivasv1?wsdl)
-   Servicio: [https://api.zetasoftware.com/z.apis.asoapventajascompetitivasv1](https://api.zetasoftware.com/z.apis.asoapventajascompetitivasv1)

#### Método Query

-   **Filtros**:
    -   `CodigoDesde`: T(3)
    -   `CodigoHasta`: T(3)
    -   `NombreContiene`: T(20)
    -   `Page`: N(2) – Obligatorio. Página y muestra de a 500 registros.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`

#### Método Save

-   **Datos**:
    -   `Codigo`: T(3) – Obligatorio.
    -   `Nombre`: T(4) – Obligatorio.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

#### Método Load

-   **Filtros**:
    -   `Codigo`: T(3) – Obligatorio.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`

#### Método Delete

-   **Filtros**:
    -   `Codigo`: T(3) – Obligatorio.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

**Nota**: Una ventaja competitiva no puede ser eliminada si existe información en Oportunidades de Venta.

* * *

[Ventajas Competitivas - PreviousVendedores y Cobradores](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/vendedores/)[Next - Ventajas CompetitivasZonas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/zonas/)

---

## Links relacionados

- [Ventajas Competitivas - PreviousVendedores y Cobradores](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/vendedores/)
- [Next - Ventajas CompetitivasZonas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/zonas/)
- [Configuración > Ventajas Competitivas](https://zetasoftware.info/ayuda/configuracion/oportunidades-y-contratos/ventajas-competitivas/)

