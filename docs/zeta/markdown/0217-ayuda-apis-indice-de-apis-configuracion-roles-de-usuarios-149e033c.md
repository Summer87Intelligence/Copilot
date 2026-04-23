# Roles de Usuarios - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/roles-de-usuarios/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/roles-de-usuarios/

---

## Contenido

# Roles de Usuarios

La API [Roles de Usuarios](https://zetasoftware.info/ayuda/configuracion/empresa/roles-de-usuarios/) tiene como objetivo primordial establecer quiénes son los usuarios dentro de la organización.

#### Especificaciones de URL

-   URL de Descripción: [`https://api.zetasoftware.com/z.apis.asoapusuariosempresav1?wsdl`](https://api.zetasoftware.com/z.apis.asoapusuariosempresav1?wsdl)
-   Servicio: [`https://api.zetasoftware.com/z.apis.asoapusuariosempresav1`](https://api.zetasoftware.com/z.apis.asoapusuariosempresav1)

#### Método `Query`

-   **Filtros**:
    -   `CodigoDesde, CodigoHasta: N(3)` – Establece un rango de códigos para filtrar usuarios.
    -   `NombreContiene, UsuarioNombreContiene: T(20)` – Filtra por coincidencia parcial en nombres de roles o usuarios.
    -   `UsuarioEmail: T(50)` – Filtra por dirección de correo electrónico asociada al usuario.
-   **Resultado**: Los campos `Codigo, Nombre, Tipo, Activo, Caducidad, HorarioDesde, HorarioHasta, Permiso, UsuarioNombre, UsuarioEmail` brindan un panorama completo del perfil de acceso de cada usuario.

* * *

[Roles de Usuarios - PreviousRetenciones y Percepciones](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/retenciones/)[Next - Roles de UsuariosTasas de IVA](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tasas-de-iva/)

---

## Links relacionados

- [Roles de Usuarios - PreviousRetenciones y Percepciones](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/retenciones/)
- [Next - Roles de UsuariosTasas de IVA](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/tasas-de-iva/)
- [Roles de Usuarios](https://zetasoftware.info/ayuda/configuracion/empresa/roles-de-usuarios/)

