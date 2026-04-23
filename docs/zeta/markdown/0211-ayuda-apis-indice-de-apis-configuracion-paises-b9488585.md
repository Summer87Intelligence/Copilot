# Países - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/paises/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/paises/

---

## Contenido

# Países

La API de Países se enfoca en la administración de países y sus respectivos departamentos que se asignan a los contactos dentro de una empresa. La API se accede a través de la opción [Configuración > Países y Departamentos](https://zetasoftware.info/ayuda/configuracion/empresa/paises/)

#### Especificaciones de URL

-   **URL de Descripción**: [`https://api.zetasoftware.com/z.apis.asoappaisesv1?wsdl`](https://api.zetasoftware.com/z.apis.asoappaisesv1?wsdl)
-   **Servicio**: [`https://api.zetasoftware.com/z.apis.asoappaisesv1`](https://api.zetasoftware.com/z.apis.asoappaisesv1)

#### Método `Query`

-   **Filtros**:
    -   `CodigoDesde y CodigoHasta: T(3)` – Rango de códigos para la búsqueda de registros.
    -   `NombreContiene: T(20)` – Permite buscar países que contengan ciertos caracteres en su nombre.
    -   `Page: N(2)` – Obligatorio. Control de paginación con 500 registros por página.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `CodigoISO`

#### Método `Save`

-   **Datos**:
    -   `Codigo: T(3)` – Identificador único para el país.
    -   `Nombre: T(40)` – Denominación oficial del país.
    -   `CodigoISO: T(2)` – Obligatorio. Código ISO 3166-1 alfa-2 correspondiente al país.
-   **Resultado**: `Succeed / Error / Mensaje`

#### Método `Load`

-   **Filtros**:
    -   `Codigo: T(3)` – Obligatorio. Identificador único para el país.
-   **Resultado**:
    -   `Codigo`
    -   `Nombre`
    -   `CodigoISO`
-   En caso de error, se devuelve `False` y un mensaje descriptivo.

#### Método `Delete`

-   **Filtros**:
    -   `Codigo: T(3)` – Obligatorio. Identificador único para el país.
-   **Resultado**: `Succeed / Error / Mensaje`

* * *

[Países - PreviousOrigen de los Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/origen-de-los-contactos/)[Next - PaísesPlan de Cuentas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/plan-de-cuentas/)

---

## Links relacionados

- [Países - PreviousOrigen de los Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/origen-de-los-contactos/)
- [Next - PaísesPlan de Cuentas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/plan-de-cuentas/)
- [Configuración > Países y Departamentos](https://zetasoftware.info/ayuda/configuracion/empresa/paises/)

