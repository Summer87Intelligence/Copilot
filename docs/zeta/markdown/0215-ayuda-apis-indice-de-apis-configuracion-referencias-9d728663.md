# Referencias - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/referencias/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/referencias/

---

## Contenido

# Referencias

La API de [Referencias](https://zetasoftware.info/ayuda/configuracion/empresa/referencias/) actúa como un marco etiquetado en el entorno de la contabilidad y los comprobantes financieros. Su finalidad es permitir a los usuarios definir etiquetas específicas que pueden asignarse a comprobantes y asientos contables.

#### Especificaciones de URL

-   URL de Descripción: [`https://api.zetasoftware.com/z.apis.asoapreferenciasv1?wsdl`](https://api.zetasoftware.com/z.apis.asoapreferenciasv1?wsdl)
-   Servicio: [`https://api.zetasoftware.com/z.apis.asoapreferenciasv1`](https://api.zetasoftware.com/z.apis.asoapreferenciasv1)

#### Método `Query`

-   **Filtros**:
    -   `CodigoDesde y CodigoHasta: T(10)` – Establecen un rango de códigos de referencia para la consulta.
    -   `NombreContiene: T(20)` – Facilita la búsqueda de referencias por su nombre.
    -   `Page: N(2)` – Obligatorio. Controla la paginación de los resultados.
-   **Resultado**: Se ofrecerán datos como el código y el nombre de las referencias que coincidan con los filtros aplicados.

#### Método `Save`

-   **Datos**:
    -   `Codigo: T(10)` – Obligatorio. Representa el identificador único de la referencia.
    -   `Nombre: T(40)` – Obligatorio. Define el nombre que llevará la referencia.
-   **Resultado**: Se obtendrá un estado de `Succeed` si la operación es exitosa, `Error` si se presenta alguna falla o un mensaje más detallado.

#### Método `Load` y `Delete`

-   **Filtros**:
    -   `Codigo: T(10)` – Obligatorio. Identifica la referencia que se desea cargar o eliminar.
-   **Resultado**: Se obtendrá una respuesta de `Succeed` o `Error`, acompañada de un mensaje en caso de error.

* * *

[Referencias - PreviousPrecios de Venta](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-de-venta/)[Next - ReferenciasRetenciones y Percepciones](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/retenciones/)

---

## Links relacionados

- [Referencias - PreviousPrecios de Venta](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/precios-de-venta/)
- [Next - ReferenciasRetenciones y Percepciones](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/retenciones/)
- [Referencias](https://zetasoftware.info/ayuda/configuracion/empresa/referencias/)

