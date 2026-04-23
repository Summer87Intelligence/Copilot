# Tasas de IVA - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tasas-de-iva/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tasas-de-iva/

---

## Contenido

# Tasas de IVA

Esta API permite configurar las diferentes tasas de IVA que serán asignadas a los artículos. Para acceder a esta funcionalidad, se puede hacer desde [Configuración > Tasas de IVA](https://zetasoftware.info/ayuda/configuracion/empresa/tasas-de-iva/) a nivel de aplicación.

#### URL

-   **Descripción**: [https://api.zetasoftware.com/z.apis.asoaptasasivav1?wsdl](https://api.zetasoftware.com/z.apis.asoaptasasivav1?wsdl)
-   **Servicio**: [https://api.zetasoftware.com/z.apis.asoaptasasivav1](https://api.zetasoftware.com/z.apis.asoaptasasivav1)

#### Método Query

-   **Filtros**:
    -   `CodigoDesde, CodigoHasta: N(2)`
    -   `NombreContiene: T(20)`
    -   `Page: N(2)` – Obligatorio.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `Tasa`
    -   `Tipo`
    -   `Abreviacion`
    -   `CodigoContableCompras`
    -   `LiteralTributarioCompras`
    -   `CodigoContableVentas`
    -   `LiteralTributarioVentas`

#### Método Save

-   **Datos**:
    -   `Codigo: N(2)` – Obligatorio.
    -   `Nombre: T(20)` – Obligatorio.
    -   `Tasa: N(3.2)` – Obligatorio.
    -   `Tipo: T(1)` – Obligatorio.
    -   `CodigoContableCompras: T(30)`
    -   `LiteralTributarioCompras: N(3)`
    -   `CodigoContableVentas: T(30)`
    -   `LiteralTributarioVentas: N(3)`
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

#### Método Load

-   **Filtros**:
    -   `Codigo: N(2)` – Obligatorio.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `Tasa`
    -   `Tipo`
    -   `CodigoContableCompras`
    -   `LiteralTributarioCompras`
    -   `CodigoContableVentas`
    -   `LiteralTributarioVentas`

#### Método Delete

-   **Filtros**:
    -   `Codigo: N(2)` – Obligatorio.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

* * *

[Tasas de IVA - PreviousRoles de Usuarios](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/roles-de-usuarios/)[Next - Tasas de IVATextos Predefinidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/textos-predefinidos/)

---

## Links relacionados

- [Tasas de IVA - PreviousRoles de Usuarios](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/roles-de-usuarios/)
- [Next - Tasas de IVATextos Predefinidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/textos-predefinidos/)
- [Configuración > Tasas de IVA](https://zetasoftware.info/ayuda/configuracion/empresa/tasas-de-iva/)

