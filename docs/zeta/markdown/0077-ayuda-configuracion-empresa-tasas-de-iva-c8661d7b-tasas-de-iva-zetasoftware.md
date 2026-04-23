# Tasas de IVA - ZetaSoftware

# Tasas de IVA

Las **Tasas de IVA** (Impuesto al Valor Agregado) son una parte fundamental en la gestión contable y comercial de cualquier empresa. En ZetaSoftware, podrás configurar las Tasas de IVA que necesites para aplicarlas a tus operaciones comerciales, ya sea en compras o en ventas.

### Datos de la Tasa de IVA

-   **Código:** Número que va del 1 al 99 y no podrá repetirse. Este número permite identificar la tasa de manera única y no podrá ser modificado después de creada.
-   **Tasa %:** Porcentaje que se aplicará automáticamente cuando se utilice esta tasa en una operación. Por ejemplo, si se crea una Tasa con el código 5 y se indica que su tasa es del 10%, al aplicar esta tasa a una venta de $100, se le agregará automáticamente un valor de $10 correspondiente al IVA.
-   **Nombre:** Descripción que se utiliza para identificar la tasa. ZetaSoftware sugiere un nombre para la tasa al momento de crearla, el cual incluye el código de la tasa, la palabra “IVA” y el porcentaje definido. Este nombre puede ser cambiado por el usuario en caso de que sea necesario.
-   **Tipo:** Puede ser Tasa Básica, Tasa Mínima, Exento u Otro. Esta clasificación permite identificar la tasa de manera más precisa y aplicarla de manera correcta en las operaciones correspondientes.

### Información para la Contabilidad

Es importante destacar que en la configuración de los IVAs en ZetaSoftware se deben completar algunos datos específicos para la contabilidad de la empresa. Si la compañía necesita generar asientos contables, deberá completar la información que se presenta a continuación:

-   **Cuentas contables:** Se deben seleccionar las cuentas contables que se definieron para la empresa en el módulo de Contabilidad, en la opción Plan de cuentas de la Configuración.
-   **Cuenta Compras:** Se debe indicar el código contable definido en el Plan de Cuentas para el IVA Compras de la tasa que se está definiendo.
-   **Cuenta Ventas:** Se debe indicar el código contable definido en el Plan de Cuentas para el IVA Ventas de la tasa que se está definiendo.
-   **Literal:** En este campo se deben indicar los códigos que la DGI exige al declarar los IVAs en el formulario 2/181, que solo deben presentar determinados tipos de empresas.

Con esta información, ZetaSoftware permitirá la generación automática de los asientos contables correspondientes a cada comprobante ingresado en el módulo de Facturación o Gestión PyME. De esta manera, la contabilidad de la empresa se llevará de forma más eficiente y precisa, cumpliendo con todas las obligaciones fiscales y tributarias correspondientes.

### Indicadores de Facturación

Un aspecto crítico al enviar un CFE a la DGI es el Indicador de Facturación o tipo de IVA, que se aplica a cada artículo o servicio facturado. Aunque ZetaSoftware tiene predefinidas las tasas de IVA más utilizadas, existen otras que son especiales y solo utilizan algunas empresas. A continuación, te presentamos cómo ZetaSoftware determina cada indicador de facturación al emitir los CFEs:

-   **No gravado:** Se declara cuando el artículo o servicio facturado es Exento de IVA y no se trata de una Factura de Exportación.
-   **IVA Tasa Mínima:** Se aplica cuando el artículo o servicio facturado está gravado por IVA tasa mínima y no se trata de una Factura de Exportación.
-   **IVA Tasa Básica:** Se aplica cuando el artículo o servicio facturado está gravado por IVA tasa básica y no se trata de una Factura de Exportación.
-   **IVA Otra Tasa:** Se declara, por ejemplo, en la venta de autos usados comprados en determinadas condiciones, que requiere una tasa de IVA especial del 2.2%. Aquí, debes crear una Tasa de IVA con el 2.2% en el campo Tasa %, el nombre debe contener “otra tasa”, la opción Otro en el campo Tipo, y luego asignar esta tasa a los artículos o servicios correspondientes.
-   **Entrega Gratuita:** Se aplica a aquellos artículos en la factura que tienen precio 0. No se usa si se ha aplicado un descuento del 100%.
-   **Servicios NO Facturables:** Se aplica a artículos o servicios que no generan IVA por ser un reintegro de gastos. Aquí, debes crear una Tasa de IVA con 0% en el campo Tasa %, la opción Exento en el campo Tipo, y “no facturable” en el campo Nombre.
-   **Devolución de servicios NO Facturables:** Esta situación no está contemplada en nuestro sistema.
-   **Corrección de e-Remitos:** No aplica en el módulo de Facturación Profesional de ZetaSoftware ya que no contempla el uso de Remitos.
-   **Corrección de e-Resguardos:** Se declara cuando en el módulo de eFacturas se anula un e-Resguardo.
-   **Exportación y asimiladas:** Se aplica en situaciones de Exportación y similares, con algunas variaciones dependiendo del tipo de comprobante. Si el comprobante no es de tipo Exportación y se requiere el indicador de facturación 10, el artículo deberá tener asociada una Tasa de IVA con 0% en el campo Tasa %, la opción Exento en el campo Tipo, y “asimilada” en el campo Nombre.
-   **Impuesto Percibido:** Se aplica cuando se crea una Tasa de IVA con 0% en el campo Tasa %, la opción Exento en el campo Tipo, y “percibido” en el campo Nombre.
-   **IVA en Suspenso:** Aplica a productos agropecuarios que se venden en su estado natural. Aquí, debes crear una Tasa de IVA con 0% en el campo Tasa %, la opción Exento en el campo Tipo, y “suspenso” en el campo Nombre.
-   **No contribuyente:** No aplica en el módulo de Facturación Profesional de ZetaSoftware. En casos especiales donde la empresa está obligada a emitir e-Boletas de entrada, es necesario realizar ciertas configuraciones.
-   **IVA Mínimo, Monotributo o Monotributo Mides:** Funciona igual que el indicador de facturación anterior, pero seleccionando “Monotributista” en la opción de Contribuyente e-Boleta en la ficha del proveedor.
-   **Contribuyente de IMEBA:** Similar al indicador de facturación número 13 pero seleccionando “Contribuyente IMEBA” en la opción de Contribuyente e-Boleta.
-   **Ventas de Contribuyente IVA mínimo, Monotributo o Monotributo MIDES:** Aplica cuando se crea una Tasa de IVA con 0% en el campo Tasa %, la opción Exento en el campo Tipo, y “Literal E” o “monotributo” en el campo Nombre.

#### Te puede interesar

-   [Artículos](https://zetasoftware.info/ayuda/configuracion/stock/articulos/)
-   [Conceptos](https://zetasoftware.info/ayuda/finanzas-personales/configuracion/conceptos/)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Tasas de IVA - PreviousRetenciones y Percepciones](https://zetasoftware.info/ayuda/configuracion/empresa/retenciones/)[Next - Tasas de IVATerminales POS](https://zetasoftware.info/ayuda/configuracion/empresa/terminales-pos/)
