# API Sucursales de Contactos - ZetaSoftware

# API Sucursales de Contactos

Esta API permite gestionar las sucursales asociadas a un contacto (cliente y/o proveedor), incluyendo direcciones, teléfonos y datos operativos. Incluye operaciones de consulta, creación, modificación y eliminación.

La funcionalidad asociada en el sistema se encuentra en Configuración > Contactos, Clientes y Proveedores.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcontactossucursalesv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcontactossucursalesv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcontactossucursalesv1](https://api.zetasoftware.com/z.apis.asoapcontactossucursalesv1)

## Método Query

Permite obtener un listado paginado de sucursales de contactos.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `ContactoCodigo` | T | No | Código del contacto. |
| `Sucursal` | N | No | Código de la sucursal. |
| `Page` | N | Sí | Número de página. |

### Estructura del response

```
ContactoCodigo
Nombre
RazonSocial
RUT
Sucursal
Direccion
Localidad
DepartamentoCodigo
Departamento
ZonaCodigo
Zona
Telefono
PersonaContacto
Email
LugarEntrega
IsLastPage
```

## Método Load

Permite obtener una sucursal específica.

### Parámetros

-   `ContactoCodigo`
-   `SucursalCodigo`

### Resultado

```
ContactoCodigo
SucursalCodigo
Direccion
Localidad
DepartamentoCodigo
ZonaCodigo
Telefono
PersonaContacto
Email
LugarEntrega
```

## Método Save

Permite crear o actualizar una sucursal de un contacto.

### Parámetros de entrada

| Campo | Obligatorio | Descripción |
| --- | --- | --- |
| `ContactoCodigo` | Sí | Código del contacto. |
| `SucursalCodigo` | Sí | Código de la sucursal. |
| `Direccion` | No | Dirección. |
| `Localidad` | No | Localidad. |
| `DepartamentoCodigo` | No | Departamento. |
| `ZonaCodigo` | No | Zona. |
| `Telefono` | No | Teléfono. |
| `PersonaContacto` | No | Persona de contacto. |
| `Email` | No | Email. |
| `LugarEntrega` | No | Lugar de entrega. |

### Resultado

```
Succeed
Error
Message
```

## Método Delete

Permite eliminar una sucursal de un contacto.

### Parámetros

-   `ContactoCodigo`
-   `SucursalCodigo`

### Resultado

```
Succeed
Error
Message
```

## Observaciones

-   El método `Query` permite consultas masivas con paginación.
-   El método `Load` es para consultas puntuales.
-   El método `Save` permite alta y modificación.
-   La combinación `ContactoCodigo + SucursalCodigo` identifica un registro único.

## Consideraciones de integración

-   Utilizar paginación y controlar `IsLastPage`.
-   Mantener una base local para evitar consultas frecuentes.
-   Validar existencia del contacto antes de operar sucursales.
-   Evitar duplicar registros con la misma combinación de claves.

[API Sucursales de Contactos - PreviousAPI Contactos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/contactos/)[Next - API Sucursales de ContactosAPI Cotización de Monedas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cotizacion-de-monedas/)
