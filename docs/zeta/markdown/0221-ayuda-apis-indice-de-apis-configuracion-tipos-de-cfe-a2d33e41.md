# Tipos de CFE - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-cfe/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-cfe/

---

## Contenido

# Tipos de CFE

Esta API se enfoca en la configuración del estado de los tipos de Comprobantes Fiscales Electrónicos (CFE). Se puede acceder a esta funcionalidad a través de [Configuración > Tipos de CFE](https://zetasoftware.info/ayuda/configuracion/cfes/tipos-de-cfe/) a nivel de aplicación. Debido a la complejidad y las implicaciones legales relacionadas con la Facturación Electrónica, se recomienda utilizar esta API solo si se poseen conocimientos avanzados en el área.

#### URL

-   Descripción: [https://api.zetasoftware.com/z.apis.asoaptipocfev1?wsdl](https://api.zetasoftware.com/z.apis.asoaptipocfev1?wsdl)
-   Servicio: [https://api.zetasoftware.com/z.apis.asoaptipocfev1](https://api.zetasoftware.com/z.apis.asoaptipocfev1)

#### Método Query

-   **Filtros**:
    -   `CodigoDesde: N(3)` – Códigos asignados por DGI.
    -   `CodigoHasta: N(3)` – Códigos asignados por DGI.
    -   `NombreContiene: T(20)`
    -   `Etapa: T(1)` – Solo para nuevos registros. Valores: T=Testing, H=Homologación, P=Producción.
    -   `Page: N(2)` – Obligatorio.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `Etapa`

#### Método Save

-   **Datos**:
    -   `Codigo: N(3)` – Obligatorio. Códigos asignados por DGI.
    -   `Nombre: T(50)` – Obligatorio.
    -   `Etapa: T(1)` – Obligatorio. Valores: T=Testing, H=Homologación, P=Producción.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

#### Método Load

-   **Filtros**:
    -   `Codigo: N(3)` – Obligatorio.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `Etapa`

#### Método Delete

-   **Filtros**:
    -   `Codigo: N(3)` – Obligatorio.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

#### Codificación Tipos de CFE

-   101 – e-Ticket
-   102 – Nota de Crédito de e-Ticket
-   103 – Nota de Débito de e-Ticket
-   111 – e-Factura
-   112 – Nota de Crédito de e-Factura
-   113 – Nota de Débito de e-Factura
-   121 – e-Factura Exportación
-   122 – Nota de Crédito de e-Factura Exportación
-   123 – Nota de Débito de e-Factura Exportación
-   124 – e-Remito de Exportación
-   131 – e-Ticket Venta por Cuenta Ajena
-   132 – Nota de Crédito de e-Ticket Venta por Cuenta Ajena
-   133 – Nota de Débito de e-Ticket Venta por Cuenta Ajena
-   141 – e-Factura Venta por Cuenta Ajena
-   142 – Nota de Crédito de e-Factura Venta por Cuenta Ajena
-   143 – Nota de Débito de e-Factura Venta por Cuenta Ajena
-   181 – e-Remito
-   182 – e-Resguardo
-   201 – e-Ticket Contingencia
-   202 – Nota de Crédito de e-Ticket Contingencia
-   203 – Nota de Débito de e-Ticket Contingencia
-   211 – e-Factura Contingencia
-   212 – Nota de Crédito de e-Factura Contingencia
-   213 – Nota de Débito de e-Factura Contingencia
-   221 – e-Factura Exportación Contingencia
-   222 – Nota de Crédito de e-Factura Exportación Contingencia
-   223 – Nota de Débito de e-Factura Exportación Contingencia
-   224 – e-Remito de Exportación Contingencia
-   231 – e-Ticket Venta por Cuenta Ajena Contingencia
-   232 – Nota de Crédito de e-Ticket Venta por Cuenta Ajena Contingencia
-   233 – Nota de Débito de e-Ticket Venta por Cuenta Ajena Contingencia
-   241 – e-Factura Venta por Cuenta Ajena Contingencia
-   242 – Nota de Crédito de e-Factura Venta por Cuenta Ajena Contingencia
-   243 – Nota de Débito de e-Factura Venta por Cuenta Ajena Contingencia
-   281 – e-Remito Contingencia
-   282 – e-Resguardo Contingencia

La implementación adecuada de estos códigos es esencial para asegurar una gestión eficiente y cumplir con los requisitos legales.

* * *

[Tipos de CFE - PreviousTipos de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-asientos/)[Next - Tipos de CFETipos de Descuentos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-descuentos/)

---

## Links relacionados

- [Tipos de CFE - PreviousTipos de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-asientos/)
- [Next - Tipos de CFETipos de Descuentos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-descuentos/)
- [Configuración > Tipos de CFE](https://zetasoftware.info/ayuda/configuracion/cfes/tipos-de-cfe/)

