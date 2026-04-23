# API Artículos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/articulos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/articulos/

---

## Contenido

# API Artículos

Esta API permite gestionar artículos de la empresa, incluyendo consultas, alta, modificación, eliminación y obtención de campos adicionales. Está orientada a la administración de productos, servicios e inventario desde sistemas externos.

La funcionalidad asociada en el sistema se encuentra en Configuración > Stock > Artículos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoaparticulosv3?wsdl](https://api.zetasoftware.com/z.apis.asoaparticulosv3?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoaparticulosv3](https://api.zetasoftware.com/z.apis.asoaparticulosv3)

## Método Query

Permite obtener artículos de la empresa aplicando filtros.

### Requisitos previos

-   Se recomienda mantener una base de datos local de artículos para evitar consultas frecuentes.
-   Utilizar filtros por fecha para sincronización incremental.

### Parámetros de entrada

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `CodigoDesde` | T(20) | Código inicial. |
| `CodigoHasta` | T(20) | Código final. |
| `NombreContiene` | T(20) | Filtro por nombre. |
| `CodigoOrigen` | T(20) | Código externo. |
| `CodigoBarras` | T(30) | Código de barras. |
| `ArticulosActivo` | T(1) | S/N. |
| `CategoriaCodigo` | T(3) | Categoría. |
| `FamiliaCodigoDesde` | T(10) | Familia desde. |
| `FamiliaCodigoHasta` | T(10) | Familia hasta. |
| `MarcaCodigo` | T(3) | Marca. |
| `ProveedorCodigo` | T(10) | Proveedor. |
| `ConceptoCodigo` | T(10) | Concepto. |
| `IVACodigo` | N(2) | IVA. |
| `UnidadPrincipalCodigo` | T(3) | Unidad. |
| `MonedaCodigo` | N(2) | Moneda. |
| `FechaRegistroDesde` | AAAA-MM-DD | Fecha inicial. |
| `FechaRegistroHasta` | AAAA-MM-DD | Fecha final. |
| `Page` | N(2) | Paginación (500 registros). |

### Estructura del response

```
Codigo
Nombre
Abreviacion
CodigoOrigen
CodigoBarras
ArticulosActivo
CategoriaCodigo
CategoriaNombre
FamiliaCodigo
FamiliaNombre
MarcaCodigo
MarcaNombre
ProveedorCodigo
ProveedorNombre
ConceptoCodigo
ConceptoNombre
IVACodigo
IVANombre
IVATasa
IVATipo
PercepcionCodigo
PercepcionNombre
CodigoContableCompras
CodigoContableVentas
CodigoContableProduccion
ContabilizarStock
UnidadPrincipalCodigo
UnidadPrincipalNombre
UnidadPrincipalSimbolo
UnidadSecundariaCodigo
UnidadSecundariaNombre
UnidadSecundariaSimbolo
CantidadPorUnidad
TrabajaDobleCantidad
IncluirListaPrecios
Lotes
Vencimiento
CostoFecha
MonedaCodigo
MonedaSimbolo
Costo
PorcentajeUtilidadCosto
TextoPredefinidoCodigo
TextoPredefinidoNombre
Web
Notas
FechaRegistro
```

## Método Load

Permite obtener un único artículo.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

## Método Save

Permite crear o actualizar artículos.

### Parámetros obligatorios

-   `Codigo`
-   `Nombre`
-   `Abreviacion`
-   `ArticulosActivo` (S/N)
-   `IVACodigo`
-   `ContabilizarStock` (S/N)
-   `TrabajaDobleCantidad` (S/N)
-   `IncluirListaPrecios` (S/N)
-   `MonedaCodigo`

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar un artículo.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Restricción

Un artículo no puede eliminarse si ya fue utilizado en operaciones. En ese caso debe marcarse como inactivo.

## Método CamposAdicionales

Permite obtener campos personalizados de artículos.

### Parámetro de entrada

-   `ArticuloCodigo` – Opcional.

### Resultado

```
Codigo
CodigoCampo
Valor
```

## Método StockMínimo

Permite obtener el Stock Mínimo de artículos.

### Parámetro de entrada

-   `ArticuloCodigo` – Opcional.

### Resultado

```
CodigoArticulo
CodigoLocal
StockMinimo
```

## Observaciones

-   Se recomienda utilizar filtros de fecha para detectar altas o modificaciones.
-   El método `Query` puede devolver grandes volúmenes de datos.
-   El método `Load` es más eficiente para consultas puntuales.
-   El método `Delete` tiene restricciones operativas según uso del artículo.

## Consideraciones de integración

-   Persistir artículos en base local para reducir consumo de API.
-   Utilizar sincronización incremental mediante fechas.
-   Evitar consultas completas frecuentes sin filtros.
-   Validar dependencias antes de eliminar artículos.

[API Artículos - PreviousConfiguración](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/)[Next - API ArtículosAPI Auxiliares](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/auxiliares/)

---

## Links relacionados

- [API Artículos - PreviousConfiguración](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/)
- [Next - API ArtículosAPI Auxiliares](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/auxiliares/)

