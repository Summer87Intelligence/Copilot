# Comprobantes Contables - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/contabilidad/comprobantes-contables/
- URL final: https://zetasoftware.info/ayuda/contabilidad/comprobantes-contables/

---

## Contenido

# Comprobantes Contables

Los Comprobantes Contables son una interfaz simplificada para registrar operaciones contables sin necesidad de conocer los detalles técnicos de la partida doble. Están pensados para usuarios que no tienen formación contable pero necesitan ingresar gastos y otras transacciones al sistema.

## ¿Para qué sirven?

El usuario completa un formulario con los datos de la operación (fecha, proveedor, concepto, importes) y selecciona las cuentas correspondientes. El sistema genera automáticamente el asiento contable con la estructura correcta de Debe y Haber.

Esta funcionalidad es especialmente útil para:

-   Empresas que no utilizan los módulos de Gestión o Facturación
-   Registro de gastos menores o pagos esporádicos
-   Usuarios sin conocimiento de contabilidad que necesitan cargar información

## Diferencia con el ingreso directo de asientos

| Aspecto | Comprobantes Contables | Asientos directos |
| --- | --- | --- |
| Conocimiento requerido | Mínimo | Partida doble |
| Interfaz | Formulario guiado | Grilla de líneas Debe/Haber |
| Generación del asiento | Automática | Manual línea por línea |
| Flexibilidad | Limitada a operaciones estándar | Total |

## Relación entre comprobante y asiento

Cada Comprobante Contable genera un asiento vinculado. Esta relación tiene reglas importantes:

### Modificaciones

-   Si modificás el Comprobante Contable, el asiento asociado se actualiza automáticamente
-   Si modificás directamente el asiento, el Comprobante Contable no se modifica

Este diseño garantiza un flujo unidireccional: el comprobante es la “fuente de verdad” y el asiento es su reflejo contable.

### Eliminaciones

-   Si eliminás un Comprobante Contable, el asiento asociado se elimina automáticamente
-   Si eliminás el asiento, el Comprobante Contable también se elimina

Esta vinculación bidireccional en eliminaciones asegura que no queden registros huérfanos en el sistema.

## Cuándo usar cada opción

| Situación | Opción recomendada |
| --- | --- |
| Registro de gasto simple (factura de luz, alquiler) | Comprobante Contable |
| Asiento con múltiples cuentas o distribuciones complejas | [Asiento directo](https://zetasoftware.info/ayuda/contabilidad/asientos/) |
| Ajustes contables | [Asiento directo](https://zetasoftware.info/ayuda/contabilidad/asientos/) |
| Usuario sin conocimiento contable | Comprobante Contable |
| Operaciones desde Gestión/Facturación | [Asientos Automáticos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/) |

## Consideraciones importantes

-   **Eliminación irreversible:** Al eliminar un comprobante o su asiento asociado, ambos registros se borran permanentemente. Asegurate de que la eliminación sea correcta antes de confirmar.
-   **Consistencia de datos:** El sistema mantiene la coherencia entre comprobante y asiento. Si necesitás modificar la estructura del asiento (agregar líneas, cambiar distribución), es preferible trabajar directamente desde [Asientos](https://zetasoftware.info/ayuda/contabilidad/asientos/).
-   **Literal Tributario:** Si utilizás el [Anexo DGI 2/181](https://zetasoftware.info/ayuda/contabilidad/herramientas/generar-anexo-dgi/), asegurate de indicar el literal tributario correspondiente en las cuentas de gasto exento al momento de ingresar el comprobante.

## Relación con otras funcionalidades

Los Comprobantes Contables son una de las tres formas de generar asientos en ZetaSoftware:

1.  **Comprobantes Contables** (esta pantalla): Entrada simplificada para usuarios sin conocimiento contable
2.  **[Asientos directos](https://zetasoftware.info/ayuda/contabilidad/asientos/):** Control total sobre la estructura del asiento
3.  **[Asientos Automáticos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/):** Generación desde comprobantes de Gestión/Facturación o CFEs recibidos

#### Te puede interesar

-   [Video Comprobantes Contables](https://vimeo.com/596507405)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Comprobantes Contables - PreviousAsientos](https://zetasoftware.info/ayuda/contabilidad/asientos/)[Next - Comprobantes ContablesInformes](https://zetasoftware.info/ayuda/contabilidad/informes/)

---

## Links relacionados

- [Asiento directo](https://zetasoftware.info/ayuda/contabilidad/asientos/)
- [Asientos Automáticos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/)
- [Anexo DGI 2/181](https://zetasoftware.info/ayuda/contabilidad/herramientas/generar-anexo-dgi/)
- [Next - Comprobantes ContablesInformes](https://zetasoftware.info/ayuda/contabilidad/informes/)
- [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

