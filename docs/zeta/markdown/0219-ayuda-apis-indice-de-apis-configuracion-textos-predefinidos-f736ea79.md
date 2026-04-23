# Textos Predefinidos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/textos-predefinidos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/textos-predefinidos/

---

## Contenido

# Textos Predefinidos

Esta API permite definir los diferentes textos predeterminados que se podrán asignar a los artículos, contactos y comprobantes. Esta funcionalidad está disponible desde [Configuración > Textos Predefinidos](https://zetasoftware.info/ayuda/configuracion/empresa/textos-predefinidos/) a nivel de aplicación.

#### URL

-   Descripción: [https://api.zetasoftware.com/z.apis.asoaptextospredefinidosv1?wsdl](https://api.zetasoftware.com/z.apis.asoaptextospredefinidosv1?wsdl)
-   Servicio: [https://api.zetasoftware.com/z.apis.asoaptextospredefinidosv1](https://api.zetasoftware.com/z.apis.asoaptextospredefinidosv1)

#### Método Query

-   **Filtros**:
    -   `CodigoDesde: T(3)`
    -   `CodigoHasta: T(3)`
    -   `NombreContiene: T(20)`
    -   `Page: N(2)` – Obligatorio.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `Abreviacion`

#### Método Save

-   **Datos**:
    -   `Codigo: T(3)` – Obligatorio.
    -   `Nombre: T(1000)` – Se corresponde al contenido del texto predefinido.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

#### Método Load

-   **Filtros**:
    -   `Codigo: T(3)` – Obligatorio.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`

#### Método Delete

-   **Filtros**:
    -   `Codigo: T(3)` – Obligatorio.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

* * *

[Textos Predefinidos - PreviousTasas de IVA](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tasas-de-iva/)[Next - Textos PredefinidosTipos de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-asientos/)

---

## Links relacionados

- [Textos Predefinidos - PreviousTasas de IVA](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tasas-de-iva/)
- [Next - Textos PredefinidosTipos de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-asientos/)
- [Configuración > Textos Predefinidos](https://zetasoftware.info/ayuda/configuracion/empresa/textos-predefinidos/)

