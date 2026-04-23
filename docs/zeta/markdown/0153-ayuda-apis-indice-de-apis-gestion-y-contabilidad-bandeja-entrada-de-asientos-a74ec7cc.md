# API Bandeja de Entrada de Asientos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/bandeja-entrada-de-asientos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/bandeja-entrada-de-asientos/

---

## Contenido

# API Bandeja de Entrada de Asientos

Esta API permite gestionar asientos contables importados en la bandeja de entrada de ZetaSoftware. Los asientos disponibles en esta bandeja están pendientes de validación e importación definitiva dentro del sistema contable.

La bandeja de entrada se encuentra en el sistema en la ruta: Contabilidad > Herramientas > Bandeja de Entrada.

## Casos de uso

-   Consultar asientos contables importados antes de su validación.
-   Insertar nuevos asientos desde sistemas externos.
-   Actualizar asientos existentes en la bandeja.
-   Eliminar registros incorrectos o no requeridos.
-   Integrar procesos de importación contable automatizada.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapbandejaentradaasientosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapbandejaentradaasientosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapbandejaentradaasientosv1](https://api.zetasoftware.com/z.apis.asoapbandejaentradaasientosv1)

## Requisitos previos

-   Acceso habilitado a la API.
-   Configuración previa de tipos de asiento, cuentas contables y centros de costos en el sistema.
-   Conocimiento de los códigos internos utilizados por la empresa (cuentas, monedas, contactos, etc.).

## Método Query

Permite consultar los asientos disponibles en la bandeja de entrada mediante filtros.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `IdDesde` | N | No | Identificador inicial del rango de asientos. |
| `IdHasta` | N | No | Identificador final del rango de asientos. |
| `FechaDesde` | Fecha | No | Fecha inicial del rango de consulta. |
| `FechaHasta` | Fecha | No | Fecha final del rango de consulta. |
| `TipoAsiento` | T(3) | No | Código del tipo de asiento contable. |
| `Origen` | T | No | Origen del asiento (por ejemplo: API, Excel, AsCMP). |
| `Validado` | T(1) | No | Indica si el asiento fue validado (‘S’ / ‘N’). |
| `Page` | N | Sí | Número de página a consultar. Cada página devuelve hasta 500 registros. |

### Estructura del request

```
IdDesde
IdHasta
FechaDesde
FechaHasta
TipoAsiento
Origen
Validado
Page
```

### Estructura del response

```
Id
Fecha
TipoAsiento
Concepto
Moneda
TipoCambio
RUT
Contacto
Cuenta
Importe
DebeHaber
CentroCostos
Referencia
Local
LiteralTributario
Origen
Validado
Error
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Id` | Identificador del asiento en bandeja. |
| `Fecha` | Fecha del asiento. |
| `TipoAsiento` | Tipo de asiento contable. |
| `Concepto` | Descripción del asiento. |
| `Moneda` | Código de moneda. |
| `TipoCambio` | Tipo de cambio aplicado. |
| `RUT` | Identificación fiscal asociada. |
| `Contacto` | Código de cliente o proveedor. |
| `Cuenta` | Código de cuenta contable. |
| `Importe` | Importe del movimiento. |
| `DebeHaber` | Indica Debe (‘D’) o Haber (‘H’). |
| `CentroCostos` | Código de centro de costos. |
| `Referencia` | Referencia asociada. |
| `Local` | Código de local. |
| `LiteralTributario` | Código de literal tributario. |
| `Origen` | Origen del asiento. |
| `Validado` | Estado de validación. |
| `Error` | Detalle de error si el registro presenta inconsistencias. |

## Método Save

Permite insertar o actualizar asientos contables en la bandeja de entrada.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `RegistroId` | N | Sí | Debe enviarse en 0 para nuevos registros. |
| `AsientoId` | N | Sí | Identificador del asiento para agrupar líneas Debe/Haber. |
| `Fecha` | Fecha | Sí | Formato AAAA-MM-DD. |
| `TipoAsiento` | T(3) | Sí | Código de tipo de asiento. |
| `Concepto` | T | No | Descripción del asiento. |
| `Moneda` | N | Sí | Código de moneda. |
| `TipoCambio` | N | No | Tipo de cambio aplicado. |
| `RUT` | T | No | Identificación fiscal. |
| `Contacto` | T | No | Código de cliente o proveedor. |
| `Cuenta` | N | Sí | Cuenta contable. |
| `Importe` | N | Sí | Importe del movimiento. |
| `DebeHaber` | T(1) | Sí | ‘D’ o ‘H’. |
| `CentroCostos` | T | No | Código de centro de costos. |
| `Referencia` | T | No | Referencia adicional. |
| `Local` | N | No | Código de local. |
| `LiteralTributario` | N | No | Código tributario. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Load

Permite recuperar el detalle de un asiento específico.

### Parámetro de entrada

-   `RegistroId`: Identificador del registro.

### Resultado

Devuelve los mismos campos definidos en el método Save.

## Método Delete

Permite eliminar un asiento de la bandeja de entrada.

### Parámetro de entrada

-   `RegistroId`: Identificador del registro a eliminar.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   La API opera sobre asientos en estado previo a la importación definitiva.
-   Los asientos deben ser validados dentro del sistema antes de impactar en contabilidad.
-   La paginación en Query es obligatoria y retorna hasta 500 registros por página.

## Consideraciones de integración

-   Se recomienda validar previamente los datos antes de utilizar el método Save.
-   El campo `AsientoId` debe mantenerse consistente entre líneas Debe y Haber.
-   Controlar el campo `Error` en Query para detectar inconsistencias.
-   Evitar duplicación de registros gestionando correctamente los identificadores.

[API Bandeja de Entrada de Asientos - PreviousAPI Balance Contable](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/balance-contable/)[Next - API Bandeja de Entrada de AsientosAPI CFEs Recibidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cfes-recibidos/)

---

## Links relacionados

- [API Bandeja de Entrada de Asientos - PreviousAPI Balance Contable](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/balance-contable/)
- [Next - API Bandeja de Entrada de AsientosAPI CFEs Recibidos](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cfes-recibidos/)

