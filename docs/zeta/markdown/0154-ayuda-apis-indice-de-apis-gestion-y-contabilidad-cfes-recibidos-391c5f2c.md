# API CFEs Recibidos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cfes-recibidos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cfes-recibidos/

---

## Contenido

# API CFEs Recibidos

Esta API permite consultar Comprobantes Fiscales Electrónicos (CFE) recibidos en la empresa, proporcionando tanto listados resumidos como información detallada de cada comprobante.

## Casos de uso

-   Consultar CFEs recibidos en un período determinado.
-   Supervisar estados de comprobantes (local, DGI, receptor).
-   Integrar información de facturación electrónica con sistemas externos.
-   Obtener detalle completo de comprobantes para procesamiento o auditoría.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcfesrecibidosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcfesrecibidosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcfesrecibidosv1](https://api.zetasoftware.com/z.apis.asoapcfesrecibidosv1)

## Requisitos previos

-   Acceso habilitado a la API.
-   Conocimiento de los códigos de tipo de CFE definidos por DGI.
-   Disponibilidad de datos de emisión de comprobantes en el sistema.

## Método CFERECIBIDOS

Permite obtener un listado de CFEs recibidos en formato resumido.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `LocalCodigo` | T | No | Debe enviarse vacío. |
| `FechaDesde` | Fecha | No | Fecha inicial (formato AAAA-MM-DD). |
| `FechaHasta` | Fecha | No | Fecha final (formato AAAA-MM-DD). |
| `TipoCFECodigo` | N(3) | No | Código de tipo de CFE según DGI. |
| `Pagina` | N | Sí | Número de página. Devuelve hasta 1000 registros por página. |

### Estructura del response

```
RUT
DenominacionSocial
EmisorCFETipo
Serie
Numero
EstadoLocal
EstadoDGI
EstadoReceptor
FechaEmision
FechaVencimiento
Moneda
TipoCambio
MontoAPagar
```

## Método CFERECIBIDODETALLE

Permite obtener el detalle completo de un CFE específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `EmisorRUT` | N(12) | Sí | RUT del emisor. |
| `CFETipo` | N(3) | Sí | Código de tipo de CFE. |
| `CFESerie` | T(2) | No | Serie del comprobante. |
| `CFENumero` | N | No | Número del comprobante. |

### Estructura del response

#### Datos del emisor

```
RUT
Sucursal
ComplementoFiscal
RUCEmisor
TipoDocumentoMandante
DocumentoMandante
NombreMandante
Pais
```

#### Datos del comprobante

```
EmisorTipo
EmisorSerie
EmisorNumero
FechaEmision
TipoTrasladoBienes
PeriodoFacturacionDesde
PeriodoFacturacionHasta
IndicadorMontosBrutos
FormaPago
FechaVencimiento
ClausulaVenta
ModalidadVenta
ViaDeTransporte
CFESerie
CFENumero
InformacionAdicional
SecretoProfesional
```

#### Datos del receptor

```
DenominacionSocial
Direccion
Ciudad
Localidad
CodigoPostal
Pais
PaisNombre
TipoDocumento
Documento
TipoDocumentoPais
LugarDestinoEntrega
NumeroDeCompra
InformacionAdicional
NoEnviarCFEAReceptor
```

#### Totales

```
Moneda
TipoCambio
MontoNoGravado
MontoExportado
MontoImpuestoPercibido
MontoIVAEnSuspenso
MontoNetoConIVATasaMinima
MontoNetoConIVATasaBasica
MontoNetoConIvaOtraTasa
TasaIVAMinimo
MontoIVAMinimo
TasaIVABasico
MontoIVABasico
TasaIVAOtraTasa
MontoIVAOtraTasa
MontoTotal
MontoRetenidoPercibido
CantidadLineasDetalle
MontoNoFacturable
MontoAPagar
MontoCreditosFiscales
```

#### Detalle de ítems

```
NumeroDeLinea
ItemCodigo
IndicadorDeFacturacion
IndicadorAgenteResponsable
Nombre
DescripcionAdicional
Cantidad
UnidadMedida
PrecioUnitario
DescuentoPorcentaje
DescuentoMonto
RecargoPorcentaje
RecargoMonto
MontoTotal
DescuentoGlosa
RecargoGlosa
```

## Observaciones

-   Se recomienda evitar consultas repetidas de detalle para los mismos comprobantes.
-   El campo `IndicadorDeFacturacion` permite identificar comprobantes de cobranza (valor 6).
-   La paginación en el método CFERECIBIDOS es obligatoria.

## Codificación de tipos de CFE

| Código | Descripción |
| --- | --- |
| 101 | e-Ticket |
| 111 | e-Factura |
| 112 | Nota de Crédito e-Factura |
| 113 | Nota de Débito e-Factura |
| 121 | e-Factura Exportación |
| 181 | e-Remito |
| 182 | e-Resguardo |

## Consideraciones de integración

-   Implementar control de duplicados al consultar detalles.
-   Persistir identificadores clave (RUT, tipo, serie, número).
-   Procesar resultados en forma paginada para grandes volúmenes.
-   Validar estados del comprobante antes de su uso en procesos internos.

[API CFEs Recibidos - PreviousAPI Bandeja de Entrada de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/bandeja-entrada-de-asientos/)[Next - API CFEs RecibidosAPI Cheques Recibidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cheques-recibidos/)

---

## Links relacionados

- [API CFEs Recibidos - PreviousAPI Bandeja de Entrada de Asientos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/bandeja-entrada-de-asientos/)
- [Next - API CFEs RecibidosAPI Cheques Recibidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cheques-recibidos/)

