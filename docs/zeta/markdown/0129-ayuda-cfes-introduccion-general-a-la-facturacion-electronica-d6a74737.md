# Introducción General - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/cfes/introduccion-general-a-la-facturacion-electronica/
- URL final: https://zetasoftware.info/ayuda/cfes/introduccion-general-a-la-facturacion-electronica/

---

## Contenido

# Introducción General

Le sugerimos dedicar tiempo a la lectura de esta página para familiarizarse con los aspectos esenciales de la Facturación Electrónica. Aquí se abordan las prácticas recomendadas para la emisión de Comprobantes Fiscales Electrónicos, así como consejos para evitar errores comunes. También se incluyen aspectos clave que todo emisor debe tener en cuenta para cumplir con las normativas de emisión y validación de comprobantes.

Este material está diseñado para ofrecer una comprensión clara y directa de los procedimientos y reglas involucradas en la facturación electrónica, incluso si usted no tiene conocimientos previos en el tema. Con esta guía, pretendemos equiparlo con las herramientas necesarias para navegar con confianza en el entorno de la Facturación Electrónica, minimizando errores y garantizando el cumplimiento de todas las regulaciones pertinentes.

## Definición de Facturación Electrónica

La Facturación Electrónica es un sistema modernizado de documentación comercial que utiliza Comprobantes Fiscales Electrónicos (CFE) para registrar transacciones. Estos comprobantes sirven como una alternativa digital a los tradicionales comprobantes impresos, y son enviados tanto a la Dirección General Impositiva (DGI) como al cliente, a quien de ahora en adelante nos referiremos como el Receptor.

### Actores y Participantes en el Régimen de Facturación Electrónica

En el contexto de la Facturación Electrónica, es fundamental entender el rol de los diferentes actores implicados en el proceso:

1.  **Dirección General Impositiva (D.G.I.)**: Es la entidad que autoriza la incorporación de contribuyentes al sistema de Facturación Electrónica. Inicialmente, acepta la solicitud del contribuyente para unirse al sistema y, finalmente, emite una resolución que confiere el estatus de “Emisor Electrónico”.
2.  **Emisor Electrónico**: Se trata de la empresa o entidad autorizada por la DGI para generar y emitir CFEs. Una vez recibida la autorización, el contribuyente tiene un plazo máximo de 120 días para migrar totalmente al formato electrónico para documentar sus transacciones. Durante este período, se pueden usar tanto formatos tradicionales como electrónicos. Superado el plazo, la documentación debe ser exclusivamente electrónica. Es imperativo que el emisor electrónico genere CFEs para todos sus clientes, independientemente de si son o no “Receptores Electrónicos”.
3.  **Receptor**: Este es el cliente que recibe el CFE generado por el Emisor Electrónico. Puede ser tanto un “Receptor Electrónico” (quien puede recibir y almacenar comprobantes de manera digital) como un “Receptor no Electrónico” (quien recibirá una versión impresa del CFE con validez legal).

Es crucial destacar que todo “Emisor Electrónico” se considera, por defecto, también un “Receptor Electrónico”.

Este esquema de actores y procesos tiene el objetivo de modernizar y agilizar las transacciones comerciales, al tiempo que facilita el cumplimiento de las obligaciones fiscales tanto para el emisor como para el receptor.

## Funcionamiento del Régimen de e-Factura

El proceso de Facturación Electrónica se desarrolla a través de una serie de etapas bien definidas que involucran a múltiples actores. A continuación, se detalla cómo opera este sistema:

1.  **Emisión del CFE**: El Emisor Electrónico genera un Comprobante Fiscal Electrónico (CFE) de acuerdo con los tipos de comprobantes que utiliza y para los cuales está autorizado. Este acto de generación se basa en las transacciones comerciales que desea documentar.
2.  **Validación por la D.G.I.**: Una vez generado, el CFE se envía a la Dirección General Impositiva (D.G.I.), que procederá a su validación. Según esta evaluación, el CFE será aprobado, rechazado o anulado por la D.G.I.
3.  **Entrega al Receptor**: Posteriormente, el CFE se entrega al Receptor. Si este es un “Receptor Electrónico”, recibirá tanto el documento como el archivo informático vía correo electrónico de manera automática. Si el Receptor no está habilitado electrónicamente, se le proporcionará una versión impresa del CFE con validez legal.
4.  **Reporte Diario a la D.G.I.**: Al cierre de cada jornada, se genera un resumen diario que agrupa todos los CFE emitidos en esa fecha. Este compendio, conocido como Reporte Diario, debe ser enviado a la D.G.I. todos los días del año, sin excepciones. Este proceso se automatiza a través de ZetaSoftware, y la responsabilidad del Emisor es simplemente asegurarse de que el envío se efectúe.
5.  **Revisión y Respuesta de CFEs**: Dado que todo Emisor Electrónico es también un Receptor Electrónico, tiene la responsabilidad de revisar los CFEs emitidos en su nombre y responder con una aceptación o un rechazo. En otras palabras, así como sus clientes tendrán que revisar y responder a los CFEs que usted emite, usted deberá hacer lo mismo con los CFEs emitidos hacia su empresa.

La estructura de este régimen tiene como objetivo lograr una eficiencia operativa y un cumplimiento tributario óptimo. La automatización del proceso a través de ZetaSoftware asegura que los emisores puedan cumplir con todas las exigencias normativas de forma más simple y efectiva.

## Tipos de Comprobantes Fiscales Electrónicos (CFEs)

En el marco del sistema de Facturación Electrónica, es crucial que cada empresa o contribuyente entienda qué tipos de Comprobantes Fiscales Electrónicos (CFEs) está habilitada para emitir. Este proceso comienza con la Postulación de Ingreso en la web de la Dirección General Impositiva (D.G.I.), donde se especifica a qué tipos de CFEs se desea acceder.

### Categorías Básicas y Obligatorias de CFEs

Existen ciertos tipos de comprobantes a los que todo contribuyente debe obligatoriamente postularse. Estos incluyen comprobantes de venta y sus respectivas notas correctivas:

-   **e-Ticket**: Este es un comprobante que se emite a nombre de un consumidor final. Independientemente de la forma o el plazo de pago, siempre que se emita un comprobante a una persona sin Registro Único Tributario (RUT), se generará un e-Ticket.
-   **Nota de Crédito de e-Ticket y Nota de Débito de e-Ticket**: Estos son comprobantes que documentan, respectivamente, la anulación o disminución y los cargos adicionales de un e-Ticket previamente emitido.
-   **e-Factura**: Se trata de un comprobante que se emite a nombre de un contribuyente, es decir, una empresa con RUT. Independientemente de la forma o el plazo de pago, siempre que se emita un comprobante a una empresa con RUT, se generará una e-Factura.
-   **Nota de Crédito de e-Factura y Nota de Débito de e-Factura**: Similar a las notas para e-Ticket, estas documentan la anulación o disminución y los cargos adicionales de una e-Factura previamente emitida.

### CFEs Especiales

-   **Resguardo Electrónico (e-Resguardo)**: este CFE es obligatorio para aquellos contribuyentes que son agentes de retención o percepción de impuestos. El e-Resguardo sirve para documentar retenciones y percepciones de impuestos efectuadas, actuando como un respaldo de estas transacciones tributarias.

Es imperativo para el contribuyente estar al tanto de qué tipos de CFEs puede o debe emitir, ya que este conocimiento facilita el cumplimiento de las obligaciones fiscales y legales. Además, la utilización de ZetaSoftware en este contexto simplifica la tarea de emitir los distintos tipos de CFEs, al automatizar muchos de los procesos y asegurar que se cumplan todas las directrices establecidas por la D.G.I.

## ¿Qué es Contingencia?

La contingencia en el contexto de facturación electrónica se refiere a situaciones excepcionales en las que no es posible acceder al sistema de facturación electrónica habitual, en este caso, ZetaSoftware. Este tipo de inconvenientes puede surgir debido a problemas técnicos como la falta de conexión a Internet o fallas en el dispositivo. En tales circunstancias, los emisores deben recurrir a los Comprobantes Fiscales de Contingencia (CFC).

Es fundamental comunicar a la Dirección General Impositiva (DGI) estas situaciones a través del formulario “Comunicación de contingencia” disponible en su portal, tanto al inicio de la contingencia como cuando esta ha sido resuelta.

### ¿Cómo se emite un Comprobante Fiscal de Contingencia (CFC)?

1.  **Solicitud de CAE desde DGI**: Antes de emitir un CFC, es necesario solicitar los Certificados de Autorización Electrónica (CAE) correspondientes a través de la web de DGI, bajo la opción de Servicios en Línea.
2.  **Agregar CAE en ZetaSoftware**: Una vez obtenidos, estos CAE deben ser incorporados en el módulo de e-Factura dentro de ZetaSoftware.
3.  **Impresión de Comprobantes**: El siguiente paso es contactar una imprenta autorizada para imprimir los comprobantes en formato papel, asegurándose de que estos contengan todos los datos pertinentes, incluyendo el código QR y la numeración.
4.  **Emisión Manual de Comprobantes**: En el periodo de contingencia, se utilizarán estos comprobantes impresos para emitir facturas de manera manual.
5.  **Ingreso en ZetaSoftware**: Al restablecerse el acceso a ZetaSoftware, se deben ingresar manualmente estos comprobantes emitidos durante la contingencia. Deben ser idénticos a los generados manualmente, incluyendo el tipo de comprobante, modalidad de pago, cliente, artículos y descuentos.

A diferencia de los CFE, donde la numeración es automática, en el caso de los CFC, la numeración debe ingresarse manualmente, siguiendo la que figura en el comprobante impreso.

### Características del formulario preimpreso de Contingencia

-   **Nombre del Documento**: Este suele ser el tipo de CFE que está siendo reemplazado, añadiendo la palabra ‘Contingencia’ (por ejemplo, e-Ticket de Contingencia).
-   **Numeración**: La numeración de estos documentos es independiente de la de los CFE y sigue la numeración tradicional en papel.
-   **Validez**: Los formularios preimpresos tienen una validez de cinco años.
-   **Detalles**: Deben incluir un sello digital correspondiente a la constancia de autorización de impresión y, si es aplicable, la sucursal donde se realizó la operación.

### Consideraciones y Normativa

Las normativas y limitaciones que aplican a los CFE también son válidas para los CFC. Esto incluye la necesidad de proporcionar información completa del cliente, las restricciones sobre el precio unitario de los artículos y otros requisitos legales y fiscales.

En resumen, el proceso de emisión de un CFC en ZetaSoftware está diseñado para ser un procedimiento detallado pero intuitivo, garantizando que las empresas puedan seguir funcionando eficientemente incluso en situaciones excepcionales. Asegurar la exactitud en este proceso es crucial, no solo para el cumplimiento con las regulaciones fiscales sino también para mantener la integridad de los datos contables de la empresa.

## Errores relacionados con datos propios o del Cliente (Receptor)

1.  **Información del Cliente**: Antes de emitir un Comprobante Fiscal Electrónico (CFE), asegúrese de que la información del cliente esté completa y sea precisa. Esto incluye el tipo de documento, dirección, localidad y país. Cualquier omisión o error en estos campos puede resultar en el rechazo del comprobante.
2.  **Validación de RUT y Cédula**: Si el tipo de documento es RUT o Cédula, el número correspondiente debe ser válido y estar correctamente ingresado. La validación de estos números es crucial para evitar incongruencias que puedan desencadenar un rechazo.
3.  **Configuración de la Empresa**: Si el RUT de su empresa está incorrectamente ingresado en la configuración, esto podría dar lugar a errores. Asegúrese de que el RUT corresponda al registrado en el Formulario DGI 6906 y que esté ingresado sin espacios entre los dígitos.

### Errores relacionados con moneda, precio unitario y montos totales

1.  **Subtotales Altos para Consumidores Finales**: Si el subtotal del comprobante supera las UI 5,000, es obligatorio informar el tipo y número de documento del cliente.
2.  **Artículos y Descuentos**: No se puede agregar un artículo con un precio unitario negativo. Si desea otorgar un descuento, este debe añadirse en la línea correspondiente del artículo o mediante una Nota de Crédito vinculada al comprobante original.

### Errores relacionados a CAE o Certificado Digital

1.  **Importancia del CAE**: Al emitir un comprobante, ZetaSoftware buscará el Certificado de Autorización Electrónica (CAE) correspondiente. Si este no se cuenta con un CAE vigente, el comprobante no podrá emitirse. Es crucial tener un CAEs vigentes para cada tipo de CFE.
2.  **Certificado Digital**: De igual manera, la ausencia de un Certificado Digital válido y a nombre de la empresa imposibilitará la emisión de un CFE.

### Errores relacionados con devoluciones o anulaciones

1.  **IVA en Devoluciones**: Si un comprobante ha sido rechazado por la DGI y se desea anularlo, el comprobante de Venta y la Nota de Crédito deben tener el mismo tipo de IVA definido. De lo contrario, el contradocumento no podrá ser seleccionado en el momento de la anulación.

La emisión de un CFE es un proceso que requiere precisión y atención al detalle. Cada uno de los puntos mencionados arriba minimiza el riesgo de rechazo por parte de las autoridades fiscales.

* * *

#### Te puede interesar

-   [Preguntas Frecuentes sobre CFEs](https://zetasoftware.info/ayuda/preguntas-frecuentes/cfes/)

[Introducción General - PreviousCFEs](https://zetasoftware.info/ayuda/cfes/)[Next - Introducción GeneralCFEs Emitidos](https://zetasoftware.info/ayuda/cfes/cfes-emitidos/)

---

## Links relacionados

- [Introducción General - PreviousCFEs](https://zetasoftware.info/ayuda/cfes/)
- [Next - Introducción GeneralCFEs Emitidos](https://zetasoftware.info/ayuda/cfes/cfes-emitidos/)
- [Preguntas Frecuentes sobre CFEs](https://zetasoftware.info/ayuda/preguntas-frecuentes/cfes/)

