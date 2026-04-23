# Retenciones y Percepciones - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/retenciones/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/retenciones/

---

## Contenido

# Retenciones y Percepciones

Esta API facilita la configuración y el manejo de [retenciones y percepciones](https://zetasoftware.info/ayuda/configuracion/empresa/retenciones/) vinculadas a artículos y resguardos, permitiendo un mayor control y precisión en estos procesos complejos y a menudo regulados.

#### Especificaciones de URL

-   URL de Descripción: [`https://api.zetasoftware.com/z.apis.asoapretencionespercepcionesv1?wsdl`](https://api.zetasoftware.com/z.apis.asoapretencionespercepcionesv1?wsdl)
-   Servicio: [`https://api.zetasoftware.com/z.apis.asoapretencionespercepcionesv1`](https://api.zetasoftware.com/z.apis.asoapretencionespercepcionesv1)

#### Método `Query`

-   **Filtros**:
    -   `CodigoDesde, CodigoHasta: T(10)` – Establecen un rango de códigos para realizar la consulta.
    -   `NombreContiene: T(20)` – Facilita la búsqueda por nombre.
    -   `Tipo: T(1)` – Permite filtrar por Retención (‘R’) o Percepción (‘P’).
    -   `Page: N(2)` – Obligatorio. Pagina y muestra los resultados paginados.
-   **Resultado**: Los campos `Codigo, Nombre, Tipo, Activa` permiten comprender rápidamente las características y el estado de cada retención o percepción.

#### Método `Save`

-   **Datos**:
    -   `Codigo: T(10)` – Obligatorio. Debe ser un código válido según la Tabla de Códigos de Retenciones de DGI.
    -   `Nombre: T(40)` – Obligatorio.
    -   `Tipo: T(1)` – Obligatorio. ‘R’ para Retención y ‘P’ para Percepción.
    -   `Activa: T(1)` – Obligatorio. Indica si la retención o percepción está activa o no.
-   **Resultado**: Respuestas de `Succeed` o `Error`, y un mensaje detallado en caso necesario.

#### Método `Load` y `Delete`

-   **Filtros**:
    -   `Codigo: T(10)` – Obligatorio.
-   **Resultado**: Los campos `Codigo, Nombre, Tipo, Activa` para `Load` y el estado `Succeed / Error / Mensaje` para `Delete`.

* * *

[Retenciones y Percepciones - PreviousReferencias](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/referencias/)[Next - Retenciones y PercepcionesRoles de Usuarios](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/roles-de-usuarios/)

---

## Links relacionados

- [Retenciones y Percepciones - PreviousReferencias](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/referencias/)
- [Next - Retenciones y PercepcionesRoles de Usuarios](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/roles-de-usuarios/)
- [retenciones y percepciones](https://zetasoftware.info/ayuda/configuracion/empresa/retenciones/)

