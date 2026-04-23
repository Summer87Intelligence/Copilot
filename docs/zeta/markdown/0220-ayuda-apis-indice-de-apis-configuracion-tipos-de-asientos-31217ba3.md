# Tipos de Asientos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-asientos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-asientos/

---

## Contenido

# Tipos de Asientos

Esta API permite definir los tipos que podrán asignarse a los asientos para filtrar y categorizar la información contable. Este recurso es accesible desde [Configuración > Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/), en el módulo Contabilidad.

#### URL

-   Descripción: [https://api.zetasoftware.com/z.apis.asoaptiposasientosv1?wsdl](https://api.zetasoftware.com/z.apis.asoaptiposasientosv1?wsdl)
-   Servicio: [https://api.zetasoftware.com/z.apis.asoaptiposasientosv1](https://api.zetasoftware.com/z.apis.asoaptiposasientosv1)

#### Método Query

-   **Filtros**:
    -   `CodigoDesde: T(3)`
    -   `CodigoHasta: T(3)`
    -   `NombreContiene: T(20)`
    -   `AuxiliarCodigo: T(3)` – Los códigos de Auxiliares los puede obtener ejecutando la API Configuración Auxiliares.
    -   `Page: N(2)` – Obligatorio.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `Concepto`
    -   `AuxiliarCodigo`
    -   `AuxiliarNombre`
    -   `ColumnaIVA`
    -   `DGI2181`
    -   `ImportesNegativoAuxiliares`
    -   `ResumirDiarios`

#### Método Save

-   **Datos**:
    -   `Codigo: T(3)` – Obligatorio.
    -   `Nombre: T(30)` – Obligatorio.
    -   `Concepto: T(50)`
    -   `AuxiliarCodigo: T(3)` – Los códigos de Auxiliares los puede obtener ejecutando la API Configuración Auxiliares.
    -   `ColumnaIVA: T(1)`
    -   `DGI2181: T(1)`
    -   `ImportesNegativoAuxiliares: T(1)`
    -   `ResumirDiarios: T(1)`
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

#### Método Load

-   **Filtros**:
    -   `Codigo: T(3)` – Obligatorio.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `Concepto`
    -   `AuxiliarCodigo`
    -   `ColumnaIVA`
    -   `DGI2181`
    -   `ImportesNegativoAuxiliares`
    -   `ResumirDiarios`

#### Método Delete

-   **Filtros**:
    -   `Codigo: T(3)` – Obligatorio.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

* * *

[Tipos de Asientos - PreviousTextos Predefinidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/textos-predefinidos/)[Next - Tipos de AsientosTipos de CFE](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-cfe/)

---

## Links relacionados

- [Tipos de Asientos - PreviousTextos Predefinidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/textos-predefinidos/)
- [Next - Tipos de AsientosTipos de CFE](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-cfe/)
- [Configuración > Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/)

