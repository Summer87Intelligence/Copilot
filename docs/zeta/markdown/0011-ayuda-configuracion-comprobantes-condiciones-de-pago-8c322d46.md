# Condiciones de Pago - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/comprobantes/condiciones-de-pago/
- URL final: https://zetasoftware.info/ayuda/configuracion/comprobantes/condiciones-de-pago/

---

## Contenido

# Condiciones de Pago

Las **Condiciones de Pago** en ZetaSoftware son una funcionalidad que permite definir de manera exacta y automática los vencimientos de las facturas a crédito. Esto significa que, en lugar de tener que crear manualmente cada plazo de pago con su respectivo importe y fecha de vencimiento, puede predefinirse en la propia Condición de Pago y el sistema se encargará de generarlos por ti.

Imagina, por ejemplo, que vendes un producto a crédito y quieres establecer diferentes plazos de pago. Con la Condición de Pago, puedes definir cuántas cuotas se deben pagar, cuándo vencen y qué cantidad corresponde a cada una. Una vez establecido esto, cada vez que utilices esa Condición de Pago en una factura a crédito, ZetaSoftware generará automáticamente todos los vencimientos correspondientes.

Es importante señalar que el uso de las Condiciones de Pago no es obligatorio al emitir facturas a crédito. En caso de que decidas no utilizar una Condición de Pago, el sistema asumirá que la factura debe pagarse en su totalidad el mismo día de su emisión, generando una sola cuota para esa fecha.

### Datos de la Condición de Pago

### Identificación

-   **Código:** Dato alfanumérico de hasta 3 caracteres que funciona como identificador único. El código puede reflejar las características de la Condición de Pago. Por ejemplo, “30D” podría representar un vencimiento a los 30 días, mientras que “4C” podría representar 4 cuotas consecutivas.
-   **Nombre:** Proporciona una descripción más detallada. Por ejemplo, “Pago en 30 días” o “4 cuotas mensuales consecutivas”.

### Cuotas

-   **Tipo:** Determina si todas las cuotas serán iguales (mismos importes) o si tendrán importes variables, definidos por un porcentaje específico para cada cuota.
-   **Cantidad:** Define el número de cuotas o vencimientos que se generarán.
-   **Desde:** Permite seleccionar si la primera cuota se generará a partir de la fecha de la factura o a partir de mes vencido (último día del mes de la fecha de la factura).
-   **% Recargo:** Permite agregar un porcentaje de recargo al precio de los artículos de la factura.
-   **Acumular Decimales en la cuota 1°:** Determina si los decimales residuales resultantes de la división del importe total entre la cantidad de cuotas se acumularán en la primera cuota.

### Primer Vencimiento y Separación de Cuotas

Estos dos campos sólo aparecen si se selecciona “cuotas iguales” en el campo Tipo. Permiten establecer:

-   El número de días o meses desde la fecha de la factura hasta la fecha del primer vencimiento
-   La separación en días o meses entre las fechas de vencimiento de las cuotas

Por ejemplo, podría establecerse que la primera cuota se vence 30 días después de la fecha de la factura, y que las cuotas subsiguientes se vencen cada 15 días.

### Cuotas Diferentes

Al seleccionar “Diferentes” en el campo “Tipo”, en la grilla de condiciones se mostrará la opción **“Cuotas”** para aquellas que correspondan a este tipo. Esta opción permite establecer el porcentaje aplicado para cada cuota y definir el intervalo en días y/o meses entre cada una de ellas.

### Te puede interesar

-   [Formas de Pago](/ayuda/configuracion/comprobantes/formas-de-pago/)
-   [Comprobantes](/ayuda/configuracion/comprobantes/comprobantes/)

[Condiciones de Pago - PreviousComprobantes](https://zetasoftware.info/ayuda/configuracion/comprobantes/comprobantes/)[Next - Condiciones de PagoFormas de Pago](https://zetasoftware.info/ayuda/configuracion/comprobantes/formas-de-pago/)

---

## Links relacionados

- [Comprobantes](https://zetasoftware.info/ayuda/configuracion/comprobantes/comprobantes/)
- [Formas de Pago](https://zetasoftware.info/ayuda/configuracion/comprobantes/formas-de-pago/)

