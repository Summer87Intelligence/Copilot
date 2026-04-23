# Datos de Conexión - ZetaSoftware

# Datos de Conexión

Las APIs de ZetaSoftware utilizan un esquema de autenticación por credenciales estáticas estructurado en dos niveles: **desarrollador/integrador** y **empresa cliente**. Toda solicitud autenticada debe incluir ambos conjuntos de credenciales en el payload del request.

* * *

## Modelo de credenciales

| Campo | Tipo | Origen | Descripción |
| --- | --- | --- | --- |
| `DesarrolladorCodigo` | String | ZetaSoftware | Identificador único del desarrollador o integrador. Invariante respecto a la empresa cliente. |
| `DesarrolladorClave` | String | ZetaSoftware | Clave secreta del desarrollador. Se entrega de forma confidencial junto con `DesarrolladorCodigo`. |
| `EmpresaCodigo` | String | Empresa cliente | Identificador único de la empresa cuyos datos se van a operar. |
| `EmpresaClave` | String | Empresa cliente | Clave generada individualmente para cada par Desarrollador–Empresa. Se configura en _Configuración > APIs_ dentro del sistema. |
| `RolCodigo` | String | Empresa cliente | Código de un rol existente y activo en la empresa. El sistema únicamente valida existencia y estado activo; no evalúa permisos granulares sobre los recursos. Valor recomendado: `1`. |
| `UsuarioCodigo` | — | — | No utilizado. No debe enviarse con valor. |
| `UsuarioClave` | — | — | No utilizado. No debe enviarse con valor. |

* * *

## Obtención de credenciales

### Credenciales del desarrollador

El desarrollador debe solicitar sus credenciales directamente a ZetaSoftware completando el formulario de registro disponible a través de [soporte@zetasoftware.com](mailto:soporte@zetasoftware.com).

ZetaSoftware proveerá `DesarrolladorCodigo` y `DesarrolladorClave` de forma directa y confidencial. Estas credenciales son estáticas por defecto y pueden modificarse únicamente a solicitud explícita del desarrollador.

### Credenciales de la empresa cliente

`EmpresaCodigo` y `EmpresaClave` deben ser provistos por la empresa contratante. La clave se genera de forma individualizada para cada par Desarrollador–Empresa desde _Configuración > APIs_ en el sistema ZetaSoftware.

`RolCodigo` también debe ser suministrado por la empresa. Debe corresponder a un rol existente en _Configuración > Roles de Usuario_ con estado **Activo**.

* * *

## Observaciones importantes

-   **Validación de `RolCodigo`:** el sistema verifica únicamente que el rol exista y esté activo en la empresa. No se evalúan permisos específicos sobre recursos. Para evitar errores por modificaciones futuras al rol, se recomienda  
    usar `RolCodigo = 1`, que permanece siempre activo.
-   **Alcance de las credenciales del desarrollador:**  
    `DesarrolladorCodigo` y `DesarrolladorClave` son independientes de la empresa cliente. Un mismo par de credenciales de desarrollador puede operar contra múltiples empresas.
-   **Campos no utilizados:** `UsuarioCodigo` y `UsuarioClave` están reservados pero no tienen uso activo. Deben omitirse  
    o enviarse vacíos; no deben contener valores operativos.
-   **Confidencialidad:** las claves (`DesarrolladorClave` y `EmpresaClave`) no deben exponerse en código fuente accesible públicamente ni transmitirse por canales no seguros.

#### Te puede interesar

-   [Habilitar las APIs al Desarrollador](https://zetasoftware.info/ayuda/configuracion/empresa/apis/)
-   [Índice de APIs](https://zetasoftware.info/ayuda/apis/indice-de-apis/)

[Datos de Conexión - PreviousAPIs](https://zetasoftware.info/ayuda/apis/)[Next - Datos de ConexiónMétodos de la API](https://zetasoftware.info/ayuda/apis/metodos-generales/)
