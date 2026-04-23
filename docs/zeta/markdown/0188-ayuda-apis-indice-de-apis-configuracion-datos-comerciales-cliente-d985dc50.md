# API Datos Comerciales de Cliente - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-cliente/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-cliente/

---

## Contenido

# API Datos Comerciales de Cliente

Esta API permite gestionar los datos comerciales asociados a clientes, incluyendo condiciones de venta, categorización, límites de crédito y parámetros operativos utilizados en procesos comerciales.

La funcionalidad asociada en el sistema se encuentra en Configuración > Contactos, Clientes y Proveedores > Datos Comerciales de Cliente.

## Casos de uso

-   Consultar configuración comercial de clientes.
-   Definir condiciones de venta y listas de precios.
-   Gestionar límites de crédito y condiciones financieras.
-   Sincronizar datos comerciales con sistemas externos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapclientev4?wsdl](https://api.zetasoftware.com/z.apis.asoapclientev4?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapclientev4](https://api.zetasoftware.com/z.apis.asoapclientev4)

## Método Query

Permite obtener un listado de clientes con sus datos comerciales.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(10) | No | Código inicial del rango de clientes a consultar |
| `CodigoHasta` | T(10) | No | Código final del rango de clientes a consultar. |
| `NombreContiene` | T(20) | No | Texto a buscar dentro del nombre del cliente. |
| `RUT` | N(12) | No | RUT del cliente a consultar. |
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
    "IsLastPage:true
  }
]
```

## Método Load

Permite obtener los datos comerciales de un cliente específico.

### Parámetro

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
CategoriaCodigo
LocalCodigo
ComprobantesPorCliente
VendedorCodigo
PrecioVentaCodigo
CondicionCodigo
TextoPredefinidoCodigo
PorcentajeDto1
PorcentajeDto2
PorcentajeDto3
CodigoContable
EmailAdministracion
ExentoIVA
MonedaCodigo
TopeCreditoMonto
TopACreditoDias
```

## Método Save

Permite crear o actualizar los datos comerciales de un cliente.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(10) | Sí | Código del cliente. |
| `CategoriaCodigo` | T(3) | No | Categoría comercial. |
| `LocalCodigo` | N(3) | Sí | Local asociado. |
| `ComprobantesPorCliente` | T(1) | Sí | Visibilidad por local (S/N). |
| `VendedorCodigo` | T(3) | No | Vendedor asignado. |
| `PrecioVentaCodigo` | N(3) | No | Lista de precios. |
| `CondicionCodigo` | T(3) | No | Condición de pago. |
| `TextoPredefinidoCodigo` | T(3) | No | Texto comercial. |
| `PorcentajeDto1` | N(3.2) | No | Descuento 1. |
| `PorcentajeDto2` | N(3.2) | No | Descuento 2. |
| `PorcentajeDto3` | N(3.2) | No | Descuento 3. |
| `CodigoContable` | T(10) | No | Código contable. |
| `EmailAdministracion` | T(500) | No | Email administrativo. |
| `ExentoIVA` | T(1) | Sí | Exoneración de IVA (S/N). |
| `MonedaCodigo` | N(3) | Sí | Moneda del cliente. |
| `TopeCreditoMonto` | T | No | Límite de crédito. |
| `CTopeCreditoDias` | N(3) | No | Días de crédito. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar los datos comerciales de un cliente.

### Parámetro

-   `Codigo` – Obligatorio.

### Restricción

No es posible eliminar si el cliente tiene movimientos asociados (comprobantes, cobros u otros registros).

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   El método `Query` permite consultas masivas.
-   El método `Load` es para consultas puntuales.
-   El método `Save` permite alta y modificación.
-   Estos datos impactan directamente en ventas, facturación y crédito.

## Consideraciones de integración

-   Validar previamente la existencia del cliente en la API de contactos.
-   Controlar dependencias antes de eliminar registros.
-   Sincronizar condiciones comerciales con procesos de ventas.
-   Verificar límites de crédito antes de automatizar operaciones.

[API Datos Comerciales de Cliente - PreviousAPI Cuentas Bancarias](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cuentas-bancarias/)[Next - API Datos Comerciales de ClienteAPI Datos Comerciales de Proveedor](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-proveedor/)

---

## Links relacionados

- [API Datos Comerciales de Cliente - PreviousAPI Cuentas Bancarias](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cuentas-bancarias/)
- [Next - API Datos Comerciales de ClienteAPI Datos Comerciales de Proveedor](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-proveedor/)

