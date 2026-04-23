# Zonas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/zonas/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/zonas/

---

## Contenido

# Zonas

Esta API facilita la definición de las zonas geográficas en las cuales se encuentran sus contactos. La API es accesible desde la sección [Configuración > Zonas](https://zetasoftware.info/ayuda/configuracion/contactos/zonas/) dentro de la interfaz de la aplicación.

#### URL

-   Descripción: [https://api.zetasoftware.com/z.apis.asoapzonasv1?wsdl](https://api.zetasoftware.com/z.apis.asoapzonasv1?wsdl)
-   Servicio: [https://api.zetasoftware.com/z.apis.asoapzonasv1](https://api.zetasoftware.com/z.apis.asoapzonasv1)

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
    -   `Nombre`: T(50) – Obligatorio.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

#### Método Load

-   **Filtros**:
    -   `Codigo`: T(3)
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`

#### Método Delete

-   **Filtros**:
    -   `Codigo`: T(30) – Una zona asignada a un contacto no puede ser eliminada.
-   **Resultado**:
    -   `Succeed / Error / Mensaje`

* * *

[Zonas - PreviousVentajas Competitivas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ventajas-competitivas/)[Next - ZonasPreguntas Frecuentes y Anexos](https://zetasoftware.info/ayuda/preguntas-frecuentes/)

---

## Links relacionados

- [Zonas - PreviousVentajas Competitivas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ventajas-competitivas/)
- [Configuración > Zonas](https://zetasoftware.info/ayuda/configuracion/contactos/zonas/)
- [Next - ZonasPreguntas Frecuentes y Anexos](https://zetasoftware.info/ayuda/preguntas-frecuentes/)

