# API Comprobantes - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/comprobantes/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/comprobantes/

---

## Contenido

# API Comprobantes

Esta API permite consultar la configuración de comprobantes fiscales, comerciales, contables, de stock, caja y bancos definidos en la empresa. Su objetivo es exponer la parametrización funcional de cada comprobante para su uso en integraciones, validaciones y automatizaciones.

La funcionalidad asociada en el sistema se encuentra en Configuración > Comprobantes.

## Casos de uso

-   Consultar comprobantes configurados en la empresa.
-   Identificar el tipo funcional de un comprobante.
-   Validar si un comprobante está activo, emite CFE o trabaja en contingencia.
-   Obtener datos auxiliares de formatos, depósitos, numeradores y comportamiento operativo.
-   Integrar reglas de negocio en sistemas externos según tipo de comprobante.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcomprobantesv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcomprobantesv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcomprobantesv1](https://api.zetasoftware.com/z.apis.asoapcomprobantesv1)

## Método Query

Permite obtener un listado paginado de comprobantes configurados, aplicando filtros por código, nombre, tipo, local y estado.

### Requisitos previos

-   Contar con acceso habilitado a la API.
-   Definir el rango de códigos a consultar.
-   Conocer, si aplica, el tipo básico de comprobante o el local a filtrar.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | N(3) | Sí | Código inicial del rango de comprobantes a consultar. |
| `CodigoHasta` | N(3) | Sí | Código final del rango de comprobantes a consultar. |
| `NombreContiene` | T(20) | No | Texto a buscar dentro del nombre del comprobante. |
| `Tipo` | N(2) | No | Código del tipo básico de comprobante. |
| `LocalCodigo` | N(2) | No | Código del local asociado. |
| `Activo` | T(1) | No | Estado del comprobante. Valores admitidos: `S` = Sí, `N` = No. |
| `Pagina` | N(2) | Sí | Número de página a consultar. |

### Estructura del request

```
CodigoDesde
CodigoHasta
NombreContiene
Tipo
LocalCodigo
Activo
Pagina
```

### Estructura del response

```
Codigo
Nombre
Abreviacion
Tipo
TipoNombre
LocalCodigo
LocalNombre
ComprobanteGastos
ComprobanteResguardo
Activo
CFE
Contingencia
Exportacion
NotaDebito
RemitoInterno
IVA
FormatoCodigo
FormatoNombre
DepositoOrigenCodigo
DepositoOrigenNombre
DepositoDestinoCodigo
DepositoDestinoNombre
TomarParaActualizarCostos
PermiteSalidasSinStock
NumeradorCodigo
NumeradorNombre
FormaPagoCodigo
IncluirEnFichaComprobantes
IncluirEnLibros
PendienteFacturacionRemision
ConceptoObligatorio
SolicitaDatosReparto
Notas
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Codigo` | Código del comprobante. |
| `Nombre` | Nombre del comprobante. |
| `Abreviacion` | Abreviación del comprobante. |
| `Tipo` | Código del tipo básico de comprobante. |
| `TipoNombre` | Descripción del tipo básico. |
| `LocalCodigo` | Código del local asociado. |
| `LocalNombre` | Nombre del local asociado. |
| `ComprobanteGastos` | Indica si el comprobante corresponde a gastos. |
| `ComprobanteResguardo` | Indica si el comprobante corresponde a resguardo. |
| `Activo` | Indica si el comprobante está activo. |
| `CFE` | Indica si el comprobante es electrónico. |
| `Contingencia` | Indica si el comprobante opera en contingencia. |
| `Exportacion` | Indica si el comprobante corresponde a exportación. |
| `NotaDebito` | Indica si el comprobante es nota de débito. |
| `RemitoInterno` | Indica si el comprobante se utiliza como remito interno. |
| `IVA` | Configuración de IVA del comprobante. |
| `FormatoCodigo` | Código del formato de impresión asociado. |
| `FormatoNombre` | Nombre del formato de impresión. |
| `DepositoOrigenCodigo` | Código del depósito de origen. |
| `DepositoOrigenNombre` | Nombre del depósito de origen. |
| `DepositoDestinoCodigo` | Código del depósito de destino. |
| `DepositoDestinoNombre` | Nombre del depósito de destino. |
| `TomarParaActualizarCostos` | Indica si el comprobante actualiza costos. |
| `PermiteSalidasSinStock` | Indica si permite salidas sin stock. |
| `NumeradorCodigo` | Código del numerador asociado. |
| `NumeradorNombre` | Nombre del numerador asociado. |
| `FormaPagoCodigo` | Código de la forma de pago por defecto o asociada. |
| `IncluirEnFichaComprobantes` | Indica si se muestra en ficha de comprobantes. |
| `IncluirEnLibros` | Indica si se incluye en libros. |
| `PendienteFacturacionRemision` | Indica si genera pendiente de facturación/remisión. |
| `ConceptoObligatorio` | Indica si el concepto es obligatorio. |
| `SolicitaDatosReparto` | Indica si solicita datos de reparto. |
| `Notas` | Observaciones configuradas para el comprobante. |

### Ejemplo de request

```
{
  "CodigoDesde": 1,
  "CodigoHasta": 999,
  "NombreContiene": "",
  "Tipo": "",
  "LocalCodigo": "",
  "Activo": "S",
  "Pagina": 1
}
```

### Ejemplo de response

```
[
  {
    "Codigo": 3,
    "Nombre": "Venta Contado",
    "Abreviacion": "VC",
    "Tipo": 3,
    "TipoNombre": "Venta Contado",
    "LocalCodigo": 1,
    "LocalNombre": "Casa Central",
    "ComprobanteGastos": "N",
    "ComprobanteResguardo": "N",
    "Activo": "S",
    "CFE": "S",
    "Contingencia": "N",
    "Exportacion": "N",
    "NotaDebito": "N",
    "RemitoInterno": "N",
    "IVA": "S",
    "FormatoCodigo": 5,
    "FormatoNombre": "Factura estándar",
    "DepositoOrigenCodigo": 1,
    "DepositoOrigenNombre": "Principal",
    "DepositoDestinoCodigo": 0,
    "DepositoDestinoNombre": "",
    "TomarParaActualizarCostos": "N",
    "PermiteSalidasSinStock": "N",
    "NumeradorCodigo": 2,
    "NumeradorNombre": "Ventas",
    "FormaPagoCodigo": 1,
    "IncluirEnFichaComprobantes": "S",
    "IncluirEnLibros": "S",
    "PendienteFacturacionRemision": "N",
    "ConceptoObligatorio": "N",
    "SolicitaDatosReparto": "N",
    "Notas": ""
  }
]
```

## Listado de tipos básicos de comprobantes

| Código | Tipo básico |
| --- | --- |
| 1 | Factura de Venta Crédito |
| 2 | Nota de Crédito de Venta |
| 3 | Venta Contado |
| 4 | Devolución de Venta Contado |
| 5 | Recibo de Cobro |
| 21 | Factura de Compra Crédito |
| 22 | Nota de Crédito de Compra |
| 23 | Compra Contado |
| 24 | Devolución de Compra Contado |
| 25 | Recibo de Pago |
| 31 | Movimiento de Stock de Proveedores |
| 32 | Movimiento de Stock de Clientes |
| 33 | Armado de Artículos |
| 34 | Desarmado de Artículos |
| 35 | Transferencia entre Depósitos |
| 41 | Ingreso de Caja |
| 42 | Egreso de Caja |
| 43 | Cheque Recibido |
| 44 | Tarjeta de Crédito Recibida |
| 45 | Documento Recibido |
| 46 | Documento Emitido |
| 51 | Crédito de Cuenta Bancaria |
| 52 | Débito de Cuenta Bancaria |
| 53 | Cheque Emitido |
| 54 | Retiro de Cuenta Bancaria |
| 55 | Depósito en Cuenta Bancaria |

## Observaciones

-   Los parámetros `CodigoDesde`, `CodigoHasta` y `Pagina` son obligatorios.
-   La API expone configuración funcional de comprobantes, no genera ni modifica comprobantes.
-   El filtro `Tipo` permite acotar por tipo básico de comprobante.
-   El filtro `Activo` permite consultar únicamente comprobantes activos o inactivos.

## Consideraciones de integración

-   Se recomienda consumir esta API como fuente de parametrización para otras integraciones operativas.
-   Persistir localmente la configuración de comprobantes si otros procesos dependen de ella.
-   Usar el catálogo de tipos básicos para validar reglas de negocio en sistemas externos.
-   Verificar combinaciones como CFE, contingencia, IVA, depósitos y numeradores antes de automatizar procesos de emisión o movimiento.

[API Comprobantes - PreviousAPI Centros de Costo](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/centros-de-costo/)[Next - API ComprobantesAPI Conceptos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/conceptos/)

---

## Links relacionados

- [API Comprobantes - PreviousAPI Centros de Costo](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/centros-de-costo/)
- [Next - API ComprobantesAPI Conceptos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/conceptos/)

