# API Precio Base y Precio de Venta - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/precio-base-y-precio-de-venta/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/precio-base-y-precio-de-venta/

---

## Contenido

# API Precio Base y Precio de Venta

Esta API permite consultar y gestionar precios base y precios de venta de artículos. Está orientada tanto a la obtención de precios calculados como a la administración de precios base, los cuales impactan directamente en la estructura de precios de venta del sistema.

La funcionalidad requiere conocimiento previo sobre la configuración de precios en la empresa, incluyendo listas de precios, condiciones de pago y estructura de IVA.

## Casos de uso

-   Obtener el precio de venta de un artículo.
-   Consultar precios base de artículos.
-   Actualizar precios base de artículos.
-   Integrar precios con sistemas externos de ventas o e-commerce.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoappreciosarticulosv2?wsdl](https://api.zetasoftware.com/z.apis.asoappreciosarticulosv2?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoappreciosarticulosv2](https://api.zetasoftware.com/z.apis.asoappreciosarticulosv2)

## Método ObtenerPrecioVenta

Permite obtener el precio de venta de un artículo calculado en base a su precio base y configuración comercial.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `ArticuloCodigo` | T(20) | Sí | Código del artículo. |
| `PrecioVentaCodigo` | N(3) | Sí | Código de lista de precios. |
| `MonedaCodigo` | N(2) | No | Moneda de salida. |
| `ClienteCodigo` | T(10) | No | Código de cliente para precios específicos. |
| `CondicionPagoCodigo` | T(3) | No | Condición de pago. |

### Resultado

```
PrecioSinIVA
PrecioConIVA
```

## Método ObtenerPrecioBase

Permite consultar precios base de artículos. Puede utilizarse para un artículo específico o para todos.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `ArticuloCodigo` | T(20) | No | Si se envía vacío, consulta todos los artículos. |
| `PrecioBaseCodigo` | N(3) | No | Código de precio base. |
| `FechaRegistroDesde` | AAAA-MM-DD | No | Fecha inicial de registro. |
| `FechaRegistroHasta` | AAAA-MM-DD | No | Fecha final de registro. |

### Resultado

```
CodigoArticulo
CodigoMoneda
CodigoPrecio
PrecioSinIVA
PrecioConIVA
```

## Método GrabarPrecioBase

Permite crear o actualizar precios base de un artículo. Este método impacta directamente en los precios de venta derivados.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `ArticuloCodigo` | T(20) | Sí | Código del artículo. |
| `PrecioBaseCodigo` | N(3) | Sí | Código de precio base. |
| `MonedaCodigo` | N(2) | Sí | Moneda del precio. |
| `PrecioSinIVA` | N(12.5) | No | Precio sin IVA. |
| `PrecioConIVA` | N(12.5) | No | Precio con IVA. |

### Resultado

```
Succeed
Mensaje
```

## Observaciones

-   Los métodos dependen de la correcta configuración de precios en el sistema.
-   El precio de venta se calcula en base al precio base y condiciones comerciales.
-   En `GrabarPrecioBase` se debe enviar solo uno de los campos: `PrecioSinIVA` o `PrecioConIVA`.
-   Si ambos valores se envían en cero, se elimina el precio base del artículo.

## Buenas prácticas de integración

-   Consultar precios base completos fuera de horario comercial.
-   Persistir información en una base local para evitar consultas repetitivas.
-   Utilizar filtros de fecha para detectar cambios de precios.
-   Evitar llamadas frecuentes a la API en horarios de operación.

[API Precio Base y Precio de Venta - PreviousAPI Movimientos de Caja](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-caja/)[Next - API Precio Base y Precio de VentaAPI Recibo de Cobro](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-cobro/)

---

## Links relacionados

- [API Precio Base y Precio de Venta - PreviousAPI Movimientos de Caja](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/movimientos-de-caja/)
- [Next - API Precio Base y Precio de VentaAPI Recibo de Cobro](https://zetasoftware.info/ayuda/apis/indice-de-apis/gestion-y-contabilidad/recibo-de-cobro/)

