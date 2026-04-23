# Recibos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/facturacion/recibos/
- URL final: https://zetasoftware.info/ayuda/facturacion/recibos/

---

## Contenido

# Recibos

Los Recibos de Cobranza constituyen una herramienta esencial para llevar un registro exacto del saldo de cada cliente y sus facturas pendientes. En esta sección, encontrará una grilla donde se almacenan todos los recibos de cobranza registrados.

## Diseño y Funcionalidades de la Grilla de Recibos

La grilla de Recibos de Cobranza está organizada de forma descendente, mostrando el último recibo ingresado en la parte superior. En la última columna, encontrará indicadores cromáticos que proporcionan información instantánea sobre el estado del recibo: verde indica que no hay saldo pendiente, naranja significa que existe un saldo parcialmente pendiente, y rojo muestra que el monto total del recibo está sin vincular a ninguna factura.

## Proceso de Ingreso de Nuevo Recibo

Ingresar un nuevo recibo es un procedimiento bastante intuitivo. Al seleccionar el botón “Agregar”, se despliega un formulario que debe ser completado con varios campos esenciales:

-   **Fecha**: Se sugiere la fecha del último recibo ingresado, pero es modificable.
-   **Serie y Número**: Se sugiere el siguiente número en la serie.
-   **Moneda**: Seleccionar la moneda en la que se efectuará la transacción. Esta debe ser la moneda de las facturas a cobrar.
-   **Cotización Especial**: Este campo permite a los usuarios ingresar un tipo de cambio personalizado, diferente al valor que se registra automáticamente en nuestra tabla de [Monedas y Cotizaciones](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/). Se recomienda dejas el campo de “Cotización Especial” en cero, ya que en la mayoría de los casos, los usuarios pueden continuar utilizando el tipo de cambio oficial. Solo se debería introducir un valor en este campo cuando se tenga una razón válida para utilizar una cotización diferente a la oficial.
-   **Cliente**: Debe elegirse un cliente que ya exista en el registro. Este cliente debe ser el mismo de las facturas a cobrar.
-   **Concepto**: Aquí se puede añadir cualquier nota o descripción pertinente.
-   **Total**: El monto total cobrado.

Al confirmar estos datos, el sistema automáticamente vincula el nuevo recibo con la o las facturas pendientes más antiguas del mismo cliente y en la misma moneda.

## Herramientas de Acción en la Grilla

En la grilla, se ofrecen varias acciones para cada recibo:

-   **Modificar**: Editar los datos del recibo siempre y cuando no esté vinculado a ninguna factura de crédito.
-   **Eliminar**: Esto eliminará el recibo y todos sus vínculos existentes.
-   **Vincular**: Permite visualizar, eliminar y agregar vinculaciones con facturas de venta crédito del cliente en la moneda del recibo.
-   **Emitir**: Genera un PDF del recibo para impresión o descarga.
-   **E-mail**: Envía el recibo como un archivo PDF al cliente y al usuario remitente.
-   **Asiento**: Puede ver el asiento que ha generado el recibo, o bien ver el asiento que el mismo generará.

## Gestionando Vínculos con Facturas de Crédito

La opción “Vincular” en la grilla lleva al usuario a una nueva interfaz donde se pueden gestionar las facturas vinculadas al recibo en cuestión. En todo momento, es posible eliminar o modificar estos vínculos, ajustando los saldos pendientes de los comprobantes vinculados consecuentemente. La funcionalidad “Agregar” en esta interfaz permite vincular facturas adicionales si el recibo aún tiene un saldo pendiente.

## Vinculación Automática y Seguimiento Financiero

Es fundamental entender que ZetaSoftware ofrece una vinculación automática de recibos a las facturas pendientes más antiguas del cliente. Esta funcionalidad es especialmente útil cuando un recibo paga múltiples facturas del mismo cliente. Además, un adecuado seguimiento de estas vinculaciones asegura que las facturas se retiren del informe de [Facturas Pendientes](https://zetasoftware.info/ayuda/facturacion/informes/facturas-pendientes/), manteniendo así un registro financiero exacto.

* * *

#### Te puede interesar

-   [Video Recibos de Cobranza](https://vimeo.com/583815175)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Recibos - PreviousFacturas](https://zetasoftware.info/ayuda/facturacion/facturas/)[Next - RecibosInformes](https://zetasoftware.info/ayuda/facturacion/informes/)

---

## Links relacionados

- [Monedas y Cotizaciones](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/)
- [Recibos - PreviousFacturas](https://zetasoftware.info/ayuda/facturacion/facturas/)
- [Next - RecibosInformes](https://zetasoftware.info/ayuda/facturacion/informes/)
- [Facturas Pendientes](https://zetasoftware.info/ayuda/facturacion/informes/facturas-pendientes/)
- [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

