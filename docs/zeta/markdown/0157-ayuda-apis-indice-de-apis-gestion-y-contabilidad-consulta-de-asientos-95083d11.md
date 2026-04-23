# API Consulta de Asientos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/consulta-de-asientos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/consulta-de-asientos/

---

## Contenido

# API Consulta de Asientos

Esta API permite consultar y listar asientos contables previamente generados en la empresa. La información expuesta corresponde a movimientos ya registrados en el sistema y equivale funcionalmente a la consulta disponible en Contabilidad > Asientos.

## Casos de uso

-   Consultar asientos contables por ejercicio y rango de fechas.
-   Filtrar asientos por tipo de asiento.
-   Integrar movimientos contables con sistemas externos de auditoría, reporting o conciliación.
-   Obtener detalle de cuentas, importes, centros, referencias y contactos asociados a cada asiento.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapasientov1?wsdl](https://api.zetasoftware.com/z.apis.asoapasientov1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapasientov1](https://api.zetasoftware.com/z.apis.asoapasientov1)

## Método Lista

Permite recuperar asientos contables ya generados, aplicando filtros por ejercicio, período y tipo de asiento.

### Requisitos previos

-   Contar con acceso habilitado a la API.
-   Disponer de un código de ejercicio contable válido.
-   Conocer el código de tipo de asiento si se requiere filtrado específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Ejercicio` | N(2) | Sí | Código del ejercicio contable. Valor máximo admitido: 10. |
| `FechaInicio` | Fecha | No | Fecha inicial del rango de consulta, en formato AAAAMMDD. |
| `FechaFin` | Fecha | No | Fecha final del rango de consulta, en formato AAAAMMDD. |
| `TipoAsiento` | T(3) | No | Código del tipo de asiento. Si se envía vacío, se incluyen todos los tipos de asiento. |

### Estructura del request

```
Ejercicio
FechaInicio
FechaFin
TipoAsiento
```

### Ejemplo de request

```
{
  "Ejercicio": 1,
  "FechaInicio": "20260101",
  "FechaFin": "20260131",
  "TipoAsiento": ""
}
```

### Estructura del response

```
Numero
Fecha
Cuenta
CuentaNombre
Concepto
Moneda
MonedaSimbolo
Debe
Haber
Tipo
TipoNombre
Cotizacion
Centro
CentroNombre
Referencia
Local
Contacto
ContactoRazonSocial
RUT
Tributo
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Numero` | Número del asiento contable. |
| `Fecha` | Fecha del asiento. |
| `Cuenta` | Código de la cuenta contable. |
| `CuentaNombre` | Nombre de la cuenta contable. |
| `Concepto` | Concepto o descripción del movimiento. |
| `Moneda` | Código de la moneda del asiento. |
| `MonedaSimbolo` | Símbolo de la moneda. |
| `Debe` | Importe imputado al debe. |
| `Haber` | Importe imputado al haber. |
| `Tipo` | Código del tipo de asiento. |
| `TipoNombre` | Nombre del tipo de asiento. |
| `Cotizacion` | Cotización aplicada a la moneda del asiento. |
| `Centro` | Código del centro de costos. |
| `CentroNombre` | Nombre del centro de costos. |
| `Referencia` | Código o dato de referencia asociado. |
| `Local` | Código del local asociado al asiento. |
| `Contacto` | Código del contacto vinculado. |
| `ContactoRazonSocial` | Razón social del contacto. |
| `RUT` | RUT asociado al movimiento. |
| `Tributo` | Código o identificador tributario asociado. |

### Ejemplo de response

```
[
  {
    "Numero": 1542,
    "Fecha": "20260115",
    "Cuenta": "1.1.01",
    "CuentaNombre": "Caja",
    "Concepto": "Cobranza contado",
    "Moneda": 1,
    "MonedaSimbolo": "$",
    "Debe": 15000.00,
    "Haber": 0.00,
    "Tipo": "ING",
    "TipoNombre": "Ingreso",
    "Cotizacion": 1.00,
    "Centro": "ADM",
    "CentroNombre": "Administración",
    "Referencia": "REF001",
    "Local": 1,
    "Contacto": "C00045",
    "ContactoRazonSocial": "Cliente Demo S.A.",
    "RUT": "214567890012",
    "Tributo": 0
  }
]
```

## Observaciones

-   La API consulta únicamente asientos ya generados en el sistema.
-   Si `TipoAsiento` se envía vacío, la consulta incluye todos los tipos de asiento.
-   Para conocer los tipos de asiento disponibles, se debe consultar la API de configuración de tipos de asiento.

## Consideraciones de integración

-   Se recomienda filtrar por rango de fechas para reducir el volumen de datos.
-   Validar previamente el ejercicio contable antes de ejecutar la consulta.
-   Usar el campo `TipoAsiento` cuando se requiera segmentación funcional de los movimientos.

[API Consulta de Asientos - PreviousAPI Comprobantes por Cliente](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/comprobantes-por-cliente/)[Next - API Consulta de AsientosAPI Cuotas Pendientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cuotas-de-cliente-y-proveedor/)

---

## Links relacionados

- [API Consulta de Asientos - PreviousAPI Comprobantes por Cliente](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/comprobantes-por-cliente/)
- [Next - API Consulta de AsientosAPI Cuotas Pendientes](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/cuotas-de-cliente-y-proveedor/)

