# API Contactos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/contactos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/contactos/

---

## Contenido

# API Contactos

Esta API permite gestionar contactos, clientes y proveedores dentro del sistema. Incluye operaciones de consulta, creación, modificación y eliminación de registros.

La funcionalidad asociada en el sistema se encuentra en Configuración > Contactos, Clientes y Proveedores.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcontactosv3?wsdl](https://api.zetasoftware.com/z.apis.asoapcontactosv3?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcontactosv3](https://api.zetasoftware.com/z.apis.asoapcontactosv3)

## Método Query

Permite obtener un listado de contactos aplicando filtros.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Search` | T | No | Búsqueda por nombre o razón social. |
| `CodigoDesde` | T(10) | No | Código inicial. |
| `CodigoHasta` | T(10) | No | Código final. |
| `RUTContiene` | T(12) | No | Filtro por RUT. |
| `DocumentoContiene` | T(30) | No | Filtro por documento. |
| `EsCliente` | T(1) | No | S/N. |
| `EsProveedor` | T(1) | No | S/N. |
| `ContactoActivo` | T(1) | No | S/N. |
| `PaisCodigo` | T(3) | No | Filtro por país. |
| `ZonaCodigo` | T(3) | No | Filtro por zona. |
| `GiroCodigo` | T(3) | No | Filtro por giro. |
| `GrupoCodigo` | T(3) | No | Filtro por grupo. |
| `OrigenCodigo` | T(3) | No | Filtro por origen. |
| `PropietarioCodigo` | N(3) | No | Responsable del contacto. |
| `FechaRegistroDesde` | Fecha | No | Fecha desde. |
| `FechaRegistroHasta` | Fecha | No | Fecha hasta. |

### Estructura del response

```
Codigo
Nombre
RazonSocial
DocumentoTipo
RUT
Documento
EsCliente
EsProveedor
ContactoActivo
PaisCodigo
PaisNombre
DepartamentoCodigo
DepartamentoNombre
Localidad
Direccion
DireccionCompleta
CodigoPostal
ZonaCodigo
ZonaNombre
Telefono
Celular
Web
Email1
Email2
GiroCodigo
GiroNombre
GrupoCodigo
GrupoNombre
OrigenCodigo
OrigenNombre
PropietarioCodigo
PropietarioNombre
Notas
NotasCFEs
FechaRegistro
```

## Método Load

Permite obtener un contacto específico.

### Parámetro de entrada

-   `Codigo`

### Resultado

Devuelve los mismos datos que el método Query para un único registro.

## Método Save

Permite crear o actualizar un contacto.

### Parámetros principales

-   `Codigo` – Obligatorio
-   `Nombre` – Obligatorio
-   `RazonSocial` – Obligatorio
-   `DocumentoTipo` – Obligatorio
-   `EsCliente` – Obligatorio
-   `EsProveedor` – Obligatorio
-   `ContactoActivo` – Obligatorio
-   `PaisCodigo` – Obligatorio
-   `DepartamentoCodigo` – Obligatorio
-   `Localidad` – Obligatorio
-   `Direccion` – Obligatorio

Importante: debe informarse Teléfono o Celular.

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar un contacto.

### Parámetro

-   `Codigo`

### Resultado

```
Succeed
Error
Mensaje
```

## Restricciones

-   No se puede eliminar si tiene datos comerciales asociados.
-   No se puede eliminar si tiene movimientos (comprobantes, pagos, etc.).

## Observaciones

-   El método `Query` es para consultas masivas.
-   El método `Load` es para consultas puntuales.
-   El método `Save` permite alta y modificación.

## Buenas prácticas de integración

-   Mantener una base de datos local de contactos.
-   Ejecutar `Query` completo inicialmente.
-   Luego consultar por fechas para sincronización incremental.
-   Evitar consultas constantes a la API.

[API Contactos - PreviousAPI Condiciones de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/condiciones-de-pago/)[Next - API ContactosAPI Sucursales de Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/sucursales-de-contactos/)

---

## Links relacionados

- [API Contactos - PreviousAPI Condiciones de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/condiciones-de-pago/)
- [Next - API ContactosAPI Sucursales de Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/sucursales-de-contactos/)

