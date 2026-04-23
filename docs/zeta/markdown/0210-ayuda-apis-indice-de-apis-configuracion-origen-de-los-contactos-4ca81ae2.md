# Origen de los Contactos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/origen-de-los-contactos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/origen-de-los-contactos/

---

## Contenido

# Origen de los Contactos

La API de Orígenes de los Contactos es especialmente útil para llevar a cabo análisis de segmentación y estrategias de marketing más efectivas. Se accede a esta API a través de la opción Configuración > [Orígenes de los Contactos](https://zetasoftware.info/ayuda/configuracion/contactos/origenes/) en la aplicación.

#### Especificaciones de URL

-   **URL de Descripción**: [`https://api.zetasoftware.com/z.apis.asoaporigencontactosv1?wsdl`](https://api.zetasoftware.com/z.apis.asoaporigencontactosv1?wsdl)
-   **Servicio**: [`https://api.zetasoftware.com/z.apis.asoaporigencontactosv1`](https://api.zetasoftware.com/z.apis.asoaporigencontactosv1)

#### Método `Query`

-   **Filtros**:
    -   `CodigoDesde y CodigoHasta: T(3)` – Rango de códigos para filtrar la búsqueda de registros.
    -   `NombreContiene: T(20)` – Filtro para buscar registros que contienen un texto específico en el nombre.
    -   `Page: N(2)` – Obligatorio. Control de paginación que muestra 100 registros por página.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`

#### Método `Save`

-   **Datos**:
    -   `Codigo: T(3)` – Identificador único para el origen del contacto.
    -   `Nombre: T(50)` – Nombre descriptivo del origen del contacto.
-   **Resultado**: `Succeed / Error / Mensaje`

#### Método `Load`

-   **Filtros**:
    -   `Codigo: T(3)` – Obligatorio. Identificador único para el origen del contacto.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
-   En caso de error, se devuelve `False` y un mensaje explicativo.

#### Método `Delete`

-   **Filtros**:
    -   `Codigo: T(3)` – Obligatorio. Identificador único para el origen del contacto.
-   **Resultado**: `Succeed / Error / Mensaje`

* * *

[Origen de los Contactos - PreviousAPI Números de RUT](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeros-de-rut/)[Next - Origen de los ContactosPaíses](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/paises/)

---

## Links relacionados

- [Origen de los Contactos - PreviousAPI Números de RUT](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeros-de-rut/)
- [Next - Origen de los ContactosPaíses](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/paises/)
- [Orígenes de los Contactos](https://zetasoftware.info/ayuda/configuracion/contactos/origenes/)

