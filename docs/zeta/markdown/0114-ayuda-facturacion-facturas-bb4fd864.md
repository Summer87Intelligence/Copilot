# Facturas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/facturacion/facturas/
- URL final: https://zetasoftware.info/ayuda/facturacion/facturas/

---

## Contenido

# Facturas

La facturación es un proceso crucial para cualquier empresa o trabajador independiente. Representa no solo la culminación de una transacción comercial, sino también el inicio de una serie de procesos contables y fiscales. Los tipos de facturas que se pueden emitir son las Facturas Crédito, Facturas Contado, Notas de Crédito, Devoluciones Contado, y Facturas de Contingencia. Cada uno de estos tipos tiene características específicas y aplicaciones diversas que responden tanto a normativas fiscales como a estrategias comerciales.

Cuando se agrega una nueva factura lo primero que se solicitan son los datos del cabezal. Una vez confirmados los datos del cabezal se ingresan los servicios o artículos facturados.

## Cabezal de la Factura

-   **Comprobante**: Este dato ya viene predefinido en ZetaSoftware e indica el tipo de comprobante que se está ingresando (Venta Crédito, Venta Contado o sus devoluciones). Este dato no indica el tipo de CFE (eFactura, eTicket, Nota de Crédito de eFactura o Nota de Crédito de eTicket) ya que el mismo será determinado automáticamente por ZetaSoftware de acuerdo al documento y país del cliente que seleccione, facilitando así la tarea de registración y haciendo que el usuario ponga foco solo en indicar si la venta es crédito o contado. Los comprobantes crédito, a diferencia de los contado, quedarán con un saldo pendiente; estos saldos podrán ser cancelados más adelante por medio de los recibos de cobro o las devoluciones por medio de notas de crédito.
-   **Fecha**: ZetaSoftware sugiere siempre los datos de la última factura ingresada, no obstante el usuario puede modificarla.
-   **Moneda**: ZetaSoftware permite facturar en cualquier moneda, tanto nacional (código 1) como extranjera. Estas monedas debe estar previamente definidas en la opción Monedas y Cotizaciones.
-   **Cotización Especial**: Este campo permite a los usuarios ingresar un tipo de cambio personalizado, diferente al valor que se registra automáticamente en nuestra tabla de [Monedas y Cotizaciones](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/). Se recomienda dejas el campo de “Cotización Especial” en cero, ya que en la mayoría de los casos, los usuarios pueden continuar utilizando el tipo de cambio oficial. Solo se debería introducir un valor en este campo cuando se tenga una razón válida para utilizar una cotización diferente a la oficial.
-   **Cliente**: Debe seleccionar el cliente al cual se le está facturando, quien debe estar previamente creado en la tabla correspondiente. Recuerde que puede utilizar “clientes genéricos” (por ejemplo, un mismo cliente para todos los que son Consumo Final) y luego en la propia factura ingresar los datos eventuales de facturación como el RUT y la Razón Social, hará que esos datos queden guardados solo para la factura en cuestión y no para futuras que sean con la misma información.

## Agregar líneas en la factura

Una vez confirmado el cabezal de la factura se pasa a solicitarle al usuario, que ingrese los artículos de dicha factura. Al igual que el cabezal, el ingreso se realiza por medio de una ventana emergente que pide los datos del artículo. Estos datos son:

-   **Artículo**: Deberá seleccionar un artículo previamente definido en su correspondiente tabla.
-   **Descripción**: Se sugiere como descripción el nombre del artículo seleccionado, pudiendo si se requiere ser modificada a criterio del usuario. Por ejemplo, el artículo puede sugerir la palabra Honorarios, pero el usuario puede cambiarla a Honorarios Octubre.
-   **Cantidad**: Cantidad de artículos a facturar, por ejemplo, se pueden especificar 10 horas de consultoría.
-   **Precio**: Ingrese el precio unitario, el cual será multiplicado por la cantidad para saber el total a facturar. El precio puede ser ingresado con IVA o sin IVA, según se haya establecido en la configuración de la empresa, en la opción Tipos de Comprobantes. El desglose de IVA de cada línea se calculará automáticamente según la tasa de IVA asignada al artículo.  
    Si al artículo se le ha asignado un precio, el mismo será sugerido al momento de ingresar una nueva línea de la factura.
-   **Descuento**: Puede ingresarse el porcentaje de descuento a aplicarle a una línea, cuando corresponda.

Una vez confirmados los datos de la línea los mismos se graban y con la tecla Enter o haciendo clic en AGREGAR se puede volver a ingresar otra línea en la factura.

## Botones

-   **Editar**: Habilita la modificación del cabezal de la factura permitiendo modificar cualquiera de sus datos.
-   **Vincular**: Permite ver los comprobantes vinculados a la factura. En caso de ser una factura crédito podrá ver los recibos y notas de crédito vinculados, en caso de ser una nota de crédito permite ver las facturas crédito vinculadas. A su vez se puede gestionar estos vínculos agregando nuevos o quitando los existentes.
-   **Cobrar**: Cuando el comprobante es una factura crédito, este botón genera automáticamente un recibo de cobro por el saldo pendiente de la factura y lo deja vinculado a la misma.
-   **Duplicar**: Genera automáticamente una copia de la factura seleccionada para la duplicación, pero con fecha del día de la copia.
-   **Eliminar**: Borra la factura y todos sus vínculos.
-   **Anular**: Este botón tiene dos funciones de acuerdo al estado DGI del comprobante. Cuando el comprobante ya fue emitido y DGI la anula, este botón permite anularlo ya que el mismo no puede ser eliminado por estar ya reportado a la DGI. Cuando el comprobante ya fue emitido y Aceptado por DGI es posible generar el comprobante de corrección con este botón. El nuevo comprobante generado cancela el original.
-   **Asiento**: Puede ver el asiento que ha generado la factura, o bien ver el asiento que la misma generará.

No todas las acciones estarán habilitadas ya que las mismas dependen del estado y tipo de comprobante. Por ejemplo, el botón Cobrar no estará disponible para las facturas que no sean crédito así como el botón Editar no estará disponible si el comprobante ya fue emitido.

### Emitir y Vista Previa

Este botón es fundamental por ser el último paso del proceso de facturación. Al emitir el sistema realiza lo siguiente:

1.  Controla que se hayan ingresado todos los datos necesarios para la emisión. Si llegasen a faltar datos o fuesen incorrectos, el comprobante no será emitido y se informará los motivos para que el usuario pueda subsanarlos y ejecutar nuevamente la emisión.
2.  Firma electrónicamente el comprobante emitido, lo que permite asegurar que ese documento lo emitió la empresa.
3.  Asigna al comprobante su Serie y Número de acuerdo al CAE que le corresponda., salvo en los comprobantes de contingencia donde el usuario ingresa estos datos.
4.  Asigna en forma automática el tipo de CFE que le corresponde (e-Ticket, e-Factura, e-Nota de crédito de e-Factura, etc.)
5.  Emite la factura electrónica en un archivo de formato PDF para ser impreso o descargado.
6.  Envía este archivo al cliente vía email en caso de estar ingresado dicho dato en su ficha.
7.  Procede a reportar a la DGI la información de la factura en caso de corresponder.

Una vez que se emitió el comprobante, el botón EMITIR ya no se muestra, viendo en su lugar el botón VER PDF por si se quiere descargar o volver a imprimir.

### CFE Rechazado

Cuando un comprobante es emitido y posteriormente la DGI lo rechaza (en la grilla se muestra Rechazado en su Estado DGI) es el único caso que el botón Emitir se volverá a mostrar para ser ejecutado nuevamente una vez subsanado el motivo del rechazo.

## Vencimientos, Formas de Pago y Notas

-   **Vencimientos**: Las facturas de venta crédito permitirán cambiar la fecha de vencimiento, la cual debe ser igual o mayor a la fecha de la factura. Esta información le dará al usuario la opción de emitir luego un informe con los [Vencimientos de las Facturas](https://zetasoftware.info/ayuda/facturacion/informes/vencimiento-de-facturas/) para un período que seleccione.
-   **Formas de Pago**: Las facturas de venta contado permitirán cambiar el medio de pago que tenga predeterminado el comprobante en su configuración, asignando cualquier otro también definido en la configuración de la empresa. Esta información se utiliza para enviar a la DGI cada vez que se emite una factura.
-   **Notas**: En cada factura es posible ingresar un texto cualquiera, por ejemplo para detallar los Cheques recibidos o cualquier otra información que se quiera mostrar en la factura emitida.

## Vínculos entre comprobantes

El botón **Vincular** dentro de la factura le permite al usuario asociar los recibos de cobro y/o las notas de crédito vinculadas, que van disminuyendo el saldo de la factura hasta que la misma queda sin saldo pendiente.

Pulsando Vincular se irá a una grilla donde se muestran los recibos o notas de crédito ya vinculadas a la factura. En cualquier momento es posible eliminar dichos vínculos, procediendo ZetaSoftware a restaurar los saldos originales de cada uno de los comprobantes vinculados. Por ejemplo, si a una Factura por $ 1.000 se le vincula un Recibo por $ 400, el saldo pendiente de la factura quedará en $ 600 mientras el saldo del Recibo en $0. Si se elimina el vínculo la factura volverá a su saldo de $ 1.000 y el recibo a $400.-

### Agregar nuevos vínculos

El botón AGREGAR solo aparecerá si a la factura aún le queda saldo pendiente. En caso de que lo tenga, al pulsar AGREGAR se irá a una grilla donde se muestran los recibos y notas de crédito de ese mismo cliente y moneda de la factura que se quiere vincular. Por ejemplo, si la moneda de la factura es en Pesos (moneda 1) y le queda saldo pendiente, al pulsar AGREGAR la grilla mostrará los recibos y notas de crédito del mismo cliente, en moneda Pesos y que aún tengan saldo pendiente para vincular. En la misma grilla ya se sugieren los montos a vincular los cuales pueden ser modificados por el usuario a su criterio.

### Vinculación automática

Algo a remarcar es que cuando se ingresa un Recibo y se confirman sus datos, automáticamente ZetaSoftware vincula el monto a la(s) factura(s) del cliente más antiguas. Lo mismo sucede cuando se selecciona la opción Cobrar dentro de una factura, el Recibo generado ya queda vinculado a la factura en cuestión. Por lo tanto, la opción Vincular por lo general, se debe usar cuando se desea referenciar una Nota de Crédito o cuando un recibo paga varias facturas diferentes del mismo cliente y no solo la más antigua.

### Informe de Facturas Pendientes

Es importante vincular las facturas a los recibos de cobro o notas de crédito para que dichas facturas no salgan en el reporte de Facturas Pendientes de cobro, ya que si no tiene comprobantes vinculados su saldo estará como pendiente.

ZetaSoftware Facturación permite trabajar con moneda extranjera. Para poder operar correctamente y que DGI no rechace o anule comprobantes, es necesario siempre [cargar las cotizaciones](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/) de las mismas. Estas pueden ser ingresadas en forma manual o importadas desde el Banco Central del Uruguay.

* * *

#### Te puede interesar

-   [Video Agregar Facturas](https://vimeo.com/583815134)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)
-   [¿Cómo informar Datos Adicionales en los Comprobantes Fiscales Electrónicos?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-informar-datos-adicionales-en-los-comprobantes-fiscales-electronicos-cfe/)
-   [¿Qué son y para qué sirven los Datos Eventuales de Facturación?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/que-son-y-para-que-sirven-los-datos-eventuales-de-facturacion/)

[Facturas - PreviousVer Todos los Recibos](https://zetasoftware.info/ayuda/facturacion/comprobantes-por-cliente/ver-todos-los-recibos/)[Next - FacturasRecibos](https://zetasoftware.info/ayuda/facturacion/recibos/)

---

## Links relacionados

- [Monedas y Cotizaciones](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/)
- [Facturas - PreviousVer Todos los Recibos](https://zetasoftware.info/ayuda/facturacion/comprobantes-por-cliente/ver-todos-los-recibos/)
- [Vencimientos de las Facturas](https://zetasoftware.info/ayuda/facturacion/informes/vencimiento-de-facturas/)
- [Next - FacturasRecibos](https://zetasoftware.info/ayuda/facturacion/recibos/)
- [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)
- [¿Cómo informar Datos Adicionales en los Comprobantes Fiscales Electrónicos?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-informar-datos-adicionales-en-los-comprobantes-fiscales-electronicos-cfe/)
- [¿Qué son y para qué sirven los Datos Eventuales de Facturación?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/que-son-y-para-que-sirven-los-datos-eventuales-de-facturacion/)

