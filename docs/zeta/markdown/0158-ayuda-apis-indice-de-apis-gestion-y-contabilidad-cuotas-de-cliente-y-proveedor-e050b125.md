# API Cuotas Pendientes - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cuotas-de-cliente-y-proveedor/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cuotas-de-cliente-y-proveedor/

---

## Contenido

# API Cuotas Pendientes

Esta API permite consultar cuotas pendientes asociadas a clientes y proveedores. Su objetivo es exponer obligaciones financieras aún no cobradas o no pagadas, facilitando su integración con sistemas externos de gestión, seguimiento y control.

## Casos de uso

-   Consultar cuotas pendientes de cobro de clientes.
-   Consultar cuotas pendientes de pago a proveedores.
-   Integrar vencimientos y saldos con sistemas de gestión financiera.
-   Automatizar procesos de seguimiento de cuentas por cobrar y cuentas por pagar.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcuotasv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcuotasv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcuotasv1](https://api.zetasoftware.com/z.apis.asoapcuotasv1)

## Método QueryCliente

Permite consultar cuotas pendientes de cobro correspondientes a un cliente específico.

### Requisitos previos

-   Contar con acceso habilitado a la API.
-   Disponer de un código de cliente válido.
-   Definir el rango de vencimiento y el rango de saldo a consultar.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `RegistroId` | – | Sí | Debe enviarse vacío. |
| `ClienteCodigo` | T(10) | Sí | Código del cliente. |
| `CuotaVencimientoDesde` | Fecha | Sí | Fecha inicial de vencimiento, en formato AAAA-MM-DD. |
| `CuotaVencimientoHasta` | Fecha | Sí | Fecha final de vencimiento, en formato AAAA-MM-DD. |
| `MonedaCodigo` | N(2) | No | Código de moneda para filtrar la consulta. |
| `CuotaSaldoDesde` | N(12.5) | Sí | Importe mínimo del saldo pendiente. |
| `CuotaSaldoHasta` | N(12.5) | Sí | Importe máximo del saldo pendiente. |
| `Page` | N(2) | Sí | Número de página a consultar. Devuelve hasta 500 registros por página. |

### Estructura del request

```
RegistroId
ClienteCodigo
CuotaVencimientoDesde
CuotaVencimientoHasta
MonedaCodigo
CuotaSaldoDesde
CuotaSaldoHasta
Page
```

### Estructura del response

```
RegistroId
ClienteCodigo
CuotaNumero
CuotaVencimiento
MonedaCodigo
CuotaTotal
CuotaSaldo
EsEntregaInicial
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `RegistroId` | Identificador del registro. |
| `ClienteCodigo` | Código del cliente asociado a la cuota. |
| `CuotaNumero` | Número de cuota. |
| `CuotaVencimiento` | Fecha de vencimiento de la cuota. |
| `MonedaCodigo` | Código de la moneda. |
| `CuotaTotal` | Importe total de la cuota. |
| `CuotaSaldo` | Saldo pendiente de la cuota. |
| `EsEntregaInicial` | Indica si la cuota corresponde a una entrega inicial. |

## Método QueryProveedor

Permite consultar cuotas pendientes de pago correspondientes a un proveedor específico.

### Requisitos previos

-   Contar con acceso habilitado a la API.
-   Disponer de un código de proveedor válido.
-   Definir el rango de vencimiento y el rango de saldo a consultar.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `RegistroId` | – | Sí | Debe enviarse vacío. |
| `ProveedorCodigo` | T(10) | Sí | Código del proveedor. |
| `CuotaVencimientoDesde` | Fecha | Sí | Fecha inicial de vencimiento, en formato AAAA-MM-DD. |
| `CuotaVencimientoHasta` | Fecha | Sí | Fecha final de vencimiento, en formato AAAA-MM-DD. |
| `MonedaCodigo` | N(2) | No | Código de moneda para filtrar la consulta. |
| `CuotaSaldoDesde` | N(12.5) | Sí | Importe mínimo del saldo pendiente. |
| `CuotaSaldoHasta` | N(12.5) | Sí | Importe máximo del saldo pendiente. |
| `Page` | N(2) | Sí | Número de página a consultar. |

### Estructura del request

```
RegistroId
ProveedorCodigo
CuotaVencimientoDesde
CuotaVencimientoHasta
MonedaCodigo
CuotaSaldoDesde
CuotaSaldoHasta
Page
```

### Estructura del response

```
RegistroId
ProveedorCodigo
CuotaNumero
CuotaVencimiento
MonedaCodigo
CuotaTotal
CuotaSaldo
EsEntregaInicial
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `RegistroId` | Identificador del registro. |
| `ProveedorCodigo` | Código del proveedor asociado a la cuota. |
| `CuotaNumero` | Número de cuota. |
| `CuotaVencimiento` | Fecha de vencimiento de la cuota. |
| `MonedaCodigo` | Código de la moneda. |
| `CuotaTotal` | Importe total de la cuota. |
| `CuotaSaldo` | Saldo pendiente de la cuota. |
| `EsEntregaInicial` | Indica si la cuota corresponde a una entrega inicial. |

### Ejemplo de request

```
{
  "RegistroId": "",
  "ClienteCodigo": "C0001",
  "CuotaVencimientoDesde": "2026-03-01",
  "CuotaVencimientoHasta": "2026-03-31",
  "MonedaCodigo": 1,
  "CuotaSaldoDesde": 0,
  "CuotaSaldoHasta": 999999999.99999,
  "Page": 1
}
```

### Ejemplo de response

```
[
  {
    "RegistroId": 1254,
    "ClienteCodigo": "C0001",
    "CuotaNumero": 3,
    "CuotaVencimiento": "2026-03-20",
    "MonedaCodigo": 1,
    "CuotaTotal": 15000.00000,
    "CuotaSaldo": 5000.00000,
    "EsEntregaInicial": "N"
  }
]
```

## Observaciones

-   Los métodos `QueryCliente` y `QueryProveedor` consultan únicamente cuotas pendientes.
-   El parámetro `RegistroId` debe enviarse vacío en ambos métodos.
-   La cantidad de registros por página difiere según el método.
-   Se recomienda definir rangos de vencimiento y saldo acotados para mejorar precisión y rendimiento.

## Consideraciones de integración

-   Iterar por páginas hasta completar la recuperación de datos necesarios.
-   Persistir el identificador del registro y el número de cuota para evitar reprocesamiento.
-   Aplicar filtros por moneda cuando se maneje múltiples monedas.

[API Cuotas Pendientes - PreviousAPI Consulta de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/consulta-de-asientos/)[Next - API Cuotas PendientesAPI Facturas de Clientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-clientes/)

---

## Links relacionados

- [API Cuotas Pendientes - PreviousAPI Consulta de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/consulta-de-asientos/)
- [Next - API Cuotas PendientesAPI Facturas de Clientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/facturas-de-clientes/)

