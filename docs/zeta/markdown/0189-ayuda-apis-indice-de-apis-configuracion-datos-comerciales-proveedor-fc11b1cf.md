# API Datos Comerciales de Proveedor - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-proveedor/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-proveedor/

---

## Contenido

# API Datos Comerciales de Proveedor

Esta API permite gestionar los datos comerciales asociados a proveedores, incluyendo categorización, condiciones de pago, descuentos, configuración de IVA y parámetros operativos vinculados a la relación comercial.

La funcionalidad asociada en el sistema se encuentra en Configuración > Contactos, Clientes y Proveedores > Datos Comerciales de Proveedor.

## Casos de uso

-   Consultar configuración comercial de proveedores.
-   Definir categorías y condiciones comerciales.
-   Gestionar descuentos comerciales aplicables a compras.
-   Sincronizar datos comerciales de proveedores con sistemas externos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapproveedorv3?wsdl](https://api.zetasoftware.com/z.apis.asoapproveedorv3?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapproveedorv3](https://api.zetasoftware.com/z.apis.asoapproveedorv3)

## Método Query

Permite obtener un listado de proveedores con sus datos comerciales, aplicando filtros por código, nombre y fecha de registro.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(10) | No | Código inicial del rango de proveedores a consultar. |
| `CodigoHasta` | T(10) | No | Código final del rango de proveedores a consultar. |
| `NombreContiene` | T(20) | No | Texto a buscar dentro del nombre del proveedor. |
| `RUT` | N(12) | No | RUT del proveedor a consultar. |
| `FechaRegistroDesde` | AAAA-MM-DD | No | Fecha inicial del rango de registro. |
| `FechaRegistroHasta` | AAAA-MM-DD | No | Fecha final del rango de registro. |
| `Page` | N(2) | No | Paginación (500 registros por página) |

### Ejemplo de request

```
{
  "CodigoDesde": "",
  "CodigoHasta": "",
  "NombreContiene": "",
   "RUT": "",
  "FechaRegistroDesde": "2026-01-01",
  "FechaRegistroHasta": "2026-01-31"
}
```

### Ejemplo de response

```
[
  {
    "Codigo": "P0001",
    "Nombre": "Proveedor Demo S.A.",
    "Rut": 040349070015,
    "Activo": "S",
    "CategoriaCodigo": "001",
    "CategoriaNombre": "Nacional",
    "CondicionCodigo": "030",
    "CondicionNombre": "30 días",
    "PorcentajeDto1": 2.50,
    "PorcentajeDto2": 0.00,
    "PorcentajeDto3": 0.00,
    "IVA": "01",
    "LocalCodigo": 1,
    "LocalNombre": "Casa Central",
    "CodigoContable": "211001",
    "ContribuyenteEBoleta": "N",
    "FechaRegistro": "2026-01-15"
    "IsLastPage: "true"
  }
]
```

## Método Load

Permite obtener los datos comerciales de un proveedor específico.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
CategoriaCodigo
CondicionCodigo
PorcentajeDto1
PorcentajeDto2
PorcentajeDto3
IVA
LocalCodigo
CodigoContable
ContribuyenteEBoleta
```

## Método Save

Permite crear o actualizar los datos comerciales de un proveedor.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(10) | Sí | Código del proveedor. |
| `CategoriaCodigo` | T(3) | No | Categoría comercial del proveedor. |
| `CondicionCodigo` | T(3) | No | Condición de pago asociada. |
| `PorcentajeDto1` | N(3.2) | No | Primer descuento comercial. |
| `PorcentajeDto2` | N(3.2) | No | Segundo descuento comercial. |
| `PorcentajeDto3` | N(3.2) | No | Tercer descuento comercial. |
| `IVA` | T(2) | Sí | Configuración de IVA aplicable al proveedor. |
| `LocalCodigo` | N(3) | Sí | Local asociado. |
| `CodigoContable` | T(50) | No | Código contable asociado. |
| `ContribuyenteEBoleta` | T(1) | No | Indica si es contribuyente e-Boleta. Valores admitidos: `S`, `N`. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar los datos comerciales de un proveedor.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Restricción

No es posible eliminar los datos comerciales del proveedor si existen transacciones relacionadas, como comprobantes de compra o recibos de pago.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   El método `Query` permite consultas masivas por rango, nombre o fecha.
-   El método `Load` es adecuado para consultas puntuales.
-   El método `Save` permite tanto alta como modificación.
-   Estos datos impactan directamente en compras, pagos y configuración comercial del proveedor.

## Consideraciones de integración

-   Validar previamente la existencia del proveedor en la API de contactos.
-   Sincronizar condiciones comerciales con procesos de compras y pagos.
-   Verificar dependencias antes de intentar eliminar registros.
-   Persistir localmente la información comercial si otros procesos dependen de ella.

[API Datos Comerciales de Proveedor - PreviousAPI Datos Comerciales de Cliente](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-cliente/)[Next - API Datos Comerciales de ProveedorAPI Departamentos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/departamentos/)

---

## Links relacionados

- [API Datos Comerciales de Proveedor - PreviousAPI Datos Comerciales de Cliente](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-cliente/)
- [Next - API Datos Comerciales de ProveedorAPI Departamentos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/departamentos/)

