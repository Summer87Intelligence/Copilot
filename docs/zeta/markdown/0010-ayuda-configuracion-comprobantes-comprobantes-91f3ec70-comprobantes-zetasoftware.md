# Comprobantes - ZetaSoftware

# Comprobantes

En ZetaSoftware, comprendemos que cada PyME tiene necesidades únicas y distintas realidades operativas. Esta comprensión se traduce en nuestra política de ofrecer una herramienta que se adapta y moldea de acuerdo a estas necesidades individuales. La **Configuración de Comprobantes** es un claro ejemplo de este enfoque centrado en el usuario.

### Tipos de Comprobantes

La Configuración de Comprobantes es uno de los elementos principales en la configuración del módulo de Gestión PyME. Esta funcionalidad te permite crear tus propios comprobantes, cada uno con su nombre y atributos específicos. En su esencia, la configuración de comprobantes define el comportamiento de los comprobantes que creas.

ZetaSoftware ofrece una serie de **Tipos Básicos** de comprobantes, cada uno destinado a gestionar diferentes aspectos de tu operación:

### Clientes

-   Factura de Venta Crédito
-   Nota de Crédito de Venta
-   Venta Contado
-   Devolución de Venta Contado
-   Recibo de Cobro

### Proveedores

-   Factura de Compra Crédito
-   Nota de Crédito de Compra
-   Compra Contado
-   Devolución de Compra Contado
-   Recibo de Pago

### Stock

-   Movimiento de Stock de Proveedores
-   Movimiento de Stock de Clientes
-   Armado de Artículos
-   Desarmado de Artículos
-   Transferencia entre Depósitos

### Caja y Documentos

-   Ingreso de Caja
-   Egreso de Caja
-   Cheque Recibido
-   Tarjeta de Crédito Recibida
-   Documento Recibido
-   Documento Emitido

### Bancos

-   Crédito de Cuenta Bancaria
-   Débito de Cuenta Bancaria
-   Cheque Emitido
-   Retiro de Cuenta Bancaria
-   Depósito en Cuenta Bancaria

Una vez asignado un Tipo Básico a un comprobante, el mismo no podrá ser modificado una vez confirmados los datos.

### Datos del Comprobante

### Identificación

-   **Código:** Identificador único de hasta tres dígitos.
-   **Nombre:** Nombre completo del comprobante.
-   **Abreviación:** Versión reducida del nombre, ideal para espacios con restricciones de tamaño.
-   **Tipo:** Establece el comportamiento del comprobante basándose en su Tipo Básico. Una vez grabados los datos, no podrá ser modificado.
-   **Local:** Identifica el local comercial donde será utilizado el comprobante. Una vez grabados los datos, no podrá ser modificado.
-   **Compra de Gastos:** Determina si el comprobante pertenece a una compra de gastos y no a una compra de mercadería.
-   **El recibo de pago es un resguardo:** Al marcar este campo, el recibo admitirá sólo formas de pago del tipo Retención Tributaria.
-   **Comprobante Activo:** Señala si el comprobante está actualmente en uso. Sólo podrán utilizarse los comprobantes activos.

### Comprobante Fiscal Electrónico

-   **Es CFE:** Determina si el comprobante es electrónico, permitiendo designarlo como de Contingencia, Exportación, Nota de Débito y/o Remito Interno.

### Stock e Inventarios

-   **Depósito Origen:** Depósito inicial desde donde la mercadería es enviada.
-   **Depósito Destino:** Identifica el depósito a donde se dirige la mercadería.
-   **Tomar para actualizaciones de costos:** Incluye el comprobante en las herramientas de cálculo automático del costo de los artículos.
-   **Permite salidas de artículos sin stock:** Permite operaciones con artículos que actualmente no tienen stock disponible.

### Emisión

-   **Numerador:** Asigna una Serie y Número secuencial al emitir el comprobante. Válido sólo para comprobantes no electrónicos.
-   **Formato:** Define el diseño de impresión en PDF al emitir el comprobante.

### Otros Datos

-   **IVA:** Establece si los precios unitarios de los artículos son con IVA incluido, sin IVA o exentos.
-   **Forma de Pago:** Sugiere una modalidad de pago predeterminada al registrar un comprobante.
-   **Incluir en libros y asientos:** Incluye el comprobante en la generación de asientos contables y en la emisión de libros auxiliares.
-   **Concepto obligatorio:** Hace obligatorio proporcionar un concepto en los comprobantes de caja y bancos.
-   **Solicitar datos de reparto:** Permite ingresar datos adicionales como fecha de entrega y Número de reparto.
-   **Pendiente de facturación o remisión:** Permite mantener los artículos facturados o remitidos como pendientes.
-   **Incluir en Ficha de Comprobantes:** Determina si el comprobante aparecerá en la ficha de comprobantes por cliente o proveedor.

### Módulo Facturación Profesional

Para maximizar la eficiencia y asegurar el cumplimiento normativo, los comprobantes en este módulo vienen preconfigurados. Los usuarios se benefician de una plantilla estandarizada sin necesidad de crearlos.

Se permite modificar el nombre preestablecido de cada comprobante, pero el tipo básico no es editable. También se puede especificar si los precios en los comprobantes de venta incluyen IVA o no, y definir asientos contables específicos para cada tipo de comprobante.

#### Te puede interesar

-   [Video Configurar Comprobantes](https://vimeo.com/724902672)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)
-   [Configurar Conceptos](https://zetasoftware.info/ayuda/configuracion/caja-y-bancos/conceptos/)
-   [Configurar Artículos](https://zetasoftware.info/ayuda/configuracion/stock/articulos/)
-   [Configurar Depósitos de Stock](https://zetasoftware.info/ayuda/configuracion/stock/depositos-de-stock/)
-   [Configurar Formas de Pago](https://zetasoftware.info/ayuda/configuracion/comprobantes/formas-de-pago/)
-   [Configurar Formatos de Impresión](https://zetasoftware.info/ayuda/configuracion/comprobantes/formatos-de-impresion/)
-   [Configurar Numeradores de Impresión](https://zetasoftware.info/ayuda/configuracion/comprobantes/numeradores-de-impresion/)
-   [Generar Asientos Automáticos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/)
-   [Video Configuración General para Generación de Asientos](https://vimeo.com/704663446)

[Comprobantes - PreviousComprobantes](https://zetasoftware.info/ayuda/configuracion/comprobantes/)[Next - ComprobantesCondiciones de Pago](https://zetasoftware.info/ayuda/configuracion/comprobantes/condiciones-de-pago/)
