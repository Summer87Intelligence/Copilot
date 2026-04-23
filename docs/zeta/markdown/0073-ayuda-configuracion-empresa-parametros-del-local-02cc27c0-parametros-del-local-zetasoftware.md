# Parámetros del Local - ZetaSoftware

# Parámetros del Local

ZetaSoftware te brinda la posibilidad de personalizar un conjunto de parámetros específicos para cada local comercial, los cuales funcionan de manera autónoma con respecto a los Parámetros Generales del sistema.

### Datos Generales

-   **Trabado Comprobantes:** Dato de ingreso obligatorio que permite establecer una fecha límite a partir de la cual se prohíbe la modificación o eliminación de comprobantes ingresados. Esta función previene alteraciones accidentales en los registros ya verificados. Al ingresar el valor 01/01/00, el sistema ajusta automáticamente este límite al día anterior.
-   **Cliente Predeterminado:** Permite asignar un cliente por defecto para facilitar el registro de facturas de venta. Puede ser tu cliente más frecuente o un cliente genérico que sirva de comodín.
-   **Artículo Predeterminado:** Permite designar un artículo predeterminado que el sistema sugiere automáticamente al añadir una nueva línea a una factura.
-   **Precio Predeterminado:** Precio de Venta que el sistema sugiere en las facturas, siempre y cuando el cliente no tenga un precio específico asignado. Si el cliente tiene precio asignado, prevalecerá sobre el valor predeterminado.
-   **Correr al Lunes las cuotas que caen en día Domingo:** Al generar cuotas automáticas para facturas a crédito, si la fecha de alguna cuota coincide con un domingo, esta se trasladará al lunes siguiente si este parámetro está activado.
-   **Sugerir fecha del sistema para nuevos comprobantes:** Si se marca esta opción, el sistema propondrá la fecha actual como referencia para nuevos comprobantes. De no estar activada, sugerirá la fecha del último comprobante registrado del mismo tipo.
-   **Sugerir cotización en el ingreso de comprobantes:** Permite que el sistema sugiera automáticamente la cotización comercial de la moneda extranjera en la fecha de cada comprobante de venta.

### Comprobantes Predeterminados

-   **Recibo Cobranza/Pago:** ZetaSoftware puede automatizar la generación de un recibo de cobro o pago con tan solo presionar un botón mientras se visualiza la factura de crédito que se desea saldar. El tipo de comprobante que se utilizará se define en estos datos.
-   **Voucher Recibido y Forma de Pago:** Comprobante que se utiliza cuando se generan vouchers de manera automática a través de pagos con POS. La forma de pago indicada será la que se asigne al comprobante creado cuando se depositan vouchers.
-   **Cheque Recibido, Documento Recibido y Formas de Pago:** Comprobantes que se sugieren cada vez que se agregan nuevos comprobantes para cada tipo. También son los que se sugieren al traspasar documentos de una caja a otra. Las Formas de Pago se utilizan como sugerencia cuando se depositan los documentos y cheques recibidos en cartera.

[Parámetros del Local - PreviousPaíses y Departamentos](https://zetasoftware.info/ayuda/configuracion/empresa/paises/)[Next - Parámetros del LocalParámetros Generales](https://zetasoftware.info/ayuda/configuracion/empresa/parametros-generales-de-la-empresa/)
