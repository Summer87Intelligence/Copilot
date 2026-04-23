# Tipos de Descuentos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-descuentos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-descuentos/

---

## Contenido

# Tipos de Descuentos

La API para los Tipos de Descuentos permite una configuración precisa y eficiente de las estructuras de descuento dentro de su sistema de gestión. Esta funcionalidad se encuentra en el menú de [Configuración > Tipos de Descuentos](https://zetasoftware.info/ayuda/configuracion/contactos/tipos-de-descuentos/) a nivel de aplicación. Se recomienda tener un entendimiento claro de la estrategia comercial y de precios antes de utilizar esta API, dado que los cambios afectarán directamente a los términos de transacción entre usted y sus clientes.

#### URL

-   Descripción: [https://api.zetasoftware.com/z.apis.asoapdescuentosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapdescuentosv1?wsdl)
-   Servicio: [https://api.zetasoftware.com/z.apis.asoapdescuentosv1](https://api.zetasoftware.com/z.apis.asoapdescuentosv1)

#### Método Query

-   **Filtros**:
    -   `IdDesde`: Enviar vacío.
    -   `IdHasta`: Enviar vacío.
    -   `NombreContiene`: T(20)
-   **Resultado**:
    -   `Id`
    -   `Nombre`

#### Método Save

-   **Datos**:
    -   `Id`: Enviar siempre vacío.
    -   `Nombre`: T(50)
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

#### Método Load

-   **Filtros**:
    -   `Id`: N(2) – Valor asignado internamente por ZetaSoftware. Puede determinar los valores existentes ejecutando el método Query.
-   **Resultado**:
    -   `Id`
    -   `Nombre`

En caso de error, el resultado será `False` y un mensaje correspondiente.

#### Método Delete

-   **Filtros**:
    -   `Id`: N(2) – Valor asignado internamente por ZetaSoftware. Puede determinar los valores existentes ejecutando el método Query.
    -   Nota: Un tipo de descuento asignado no puede ser eliminado.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

* * *

[Tipos de Descuentos - PreviousTipos de CFE](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-cfe/)[Next - Tipos de DescuentosUnidades de Stock](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/unidades-de-stock/)

---

## Links relacionados

- [Tipos de Descuentos - PreviousTipos de CFE](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tipos-de-cfe/)
- [Next - Tipos de DescuentosUnidades de Stock](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/unidades-de-stock/)
- [Configuración > Tipos de Descuentos](https://zetasoftware.info/ayuda/configuracion/contactos/tipos-de-descuentos/)

