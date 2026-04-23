# Números de RUT - ZetaSoftware

# Números de RUT

Los Números de RUT permiten identificar a los terceros (clientes, proveedores, otros) en los asientos contables. Aunque es posible ingresar un RUT directamente en cada asiento sin tenerlo predefinido, mantener una tabla de RUTs ofrece ventajas significativas: autocompletado, consistencia en la razón social, y especialmente la posibilidad de automatizar la generación de asientos desde CFEs recibidos.

## ¿Para qué sirven?

Los Números de RUT cumplen dos funciones principales:

-   **Generación del Anexo 2/181:** el informe fiscal que la DGI requiere incluye el RUT de cada operación. Tener los RUTs configurados garantiza datos consistentes.
-   **Generación automática de asientos desde CFEs:** cuando recibís Comprobantes Fiscales Electrónicos (facturas de proveedores), el sistema puede crear automáticamente el asiento contable si el RUT del emisor tiene configuradas las cuentas correspondientes.

## Datos básicos

### Número de RUT

El identificador fiscal del tercero. Podés usar la lupa junto al campo para consultar automáticamente la base de datos de DGI e importar los datos básicos.

### Razón Social

Nombre oficial del tercero según su registro en DGI. Este dato es obligatorio y aparece en el Anexo 2/181.

## Consulta automática a DGI

Al ingresar un nuevo RUT, podés hacer clic en la lupa para que el sistema consulte la base de datos de la Dirección General Impositiva. Si el RUT existe, se completa automáticamente la Razón Social, evitando errores de tipeo y asegurando que los datos coincidan con los registros oficiales.

## Definición de asientos para CFEs recibidos

Esta es la funcionalidad más potente de la tabla de RUTs. Para cada proveedor, podés configurar qué cuentas contables usar al generar automáticamente asientos desde sus CFEs.

La configuración se realiza expandiendo el RUT (clic en el símbolo “>” al final de cada línea) y definiendo las cuentas para cada combinación de:

### Parámetros de clasificación

| Parámetro | Descripción | Ejemplo |
| --- | --- | --- |
| ISO de la Moneda | Divisa del comprobante | UYU, USD |
| Tipo de CFE | Tipo de comprobante fiscal | e-Factura, e-Ticket, Nota de Crédito |
| Forma de Pago | Condición de la operación | Crédito, Contado |
| Tipo de Asiento | Tipo a asignar al asiento generado | Compras Crédito, Compras Contado |

### Cuentas a configurar

Para cada combinación de parámetros, definís:

-   **Cuenta Debe:** típicamente la cuenta de gasto o activo (ej: Mercaderías, Gastos Generales)
-   **Cuenta Haber:** típicamente la cuenta del proveedor (ej: Proveedores Locales)
-   **Cuentas de IVA:** las cuentas para cada tasa de IVA (22%, 10%, exento, etc.)

### Ejemplo de configuración

Para el proveedor “Distribuidora ABC S.A.” (RUT 123456780019):

| Moneda | Tipo CFE | Forma Pago | Cuenta Debe | Cuenta Haber | IVA 22% |
| --- | --- | --- | --- | --- | --- |
| UYU | e-Factura | Crédito | Mercaderías | Proveedores | IVA Compras |
| UYU | e-Factura | Contado | Mercaderías | Caja | IVA Compras |
| UYU | Nota de Crédito | Crédito | Proveedores | Mercaderías | IVA Compras |

Con esta configuración, cuando recibas una e-Factura a crédito de este proveedor, el sistema genera automáticamente el asiento con las cuentas indicadas.

## Copiar definición desde otro RUT

Cuando muchos proveedores comparten la misma estructura de asientos (ej: todos los proveedores de mercadería usan las mismas cuentas), podés copiar la configuración de un RUT a otro:

1.  Expandí el RUT destino (el que querés configurar)
2.  Seleccioná el RUT origen en el campo correspondiente
3.  Hacé clic en “Copia”

Esto replica toda la definición de asientos, que luego podés ajustar si es necesario.

## Consideraciones sobre monedas

Si recibís CFEs en moneda extranjera, asegurate de que las monedas configuradas en el sistema tengan definidas las cuentas de Pérdidas y Ganancias por diferencia de cambio. Esto es necesario para contabilizar correctamente los redondeos que pueden venir en los CFEs.

## Relación con otras funcionalidades

### Generación de asientos desde CFEs

La herramienta [Generar Asientos desde CFEs Recibidos](https://zetasoftware.info/ayuda/contabilidad/herramientas/generar-asientos-desde-cfes-recibidos/) utiliza esta configuración para crear asientos automáticamente. Sin definición de asientos para el RUT, el proceso no puede ejecutarse para ese proveedor.

### Anexo 2/181

Los asientos que incluyen RUT (ya sean manuales o automáticos) se incorporan al Anexo 2/181 si el [Tipo de Asiento](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/) tiene marcada esa opción.

### Plan de Cuentas

Las cuentas que asignás en la definición de asientos deben existir previamente en el [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/).

## Buenas prácticas

-   **Usá la consulta a DGI:** evita errores en la razón social y garantiza consistencia con los registros oficiales
-   **Configurá los proveedores principales primero:** priorizá aquellos de los que recibís más CFEs
-   **Usá “Copiar definición” para proveedores similares:** ahorra tiempo y reduce errores
-   **Revisá periódicamente:** si cambian las cuentas contables que usás, actualizá las definiciones
-   **Contemplá todas las combinaciones:** un proveedor puede emitir facturas y notas de crédito, en pesos y dólares, crédito y contado. Configurá todas las variantes que apliquen.

## Errores comunes

-   **RUT sin definición de asientos:** el proceso de generación automática falla para ese proveedor
-   **Cuentas de IVA no configuradas:** el asiento se genera sin IVA o con error
-   **Razón social incorrecta:** discrepancias con DGI pueden generar observaciones en fiscalizaciones
-   **Olvidar las notas de crédito:** si solo configurás facturas, las notas de crédito no se procesan automáticamente
-   **No considerar moneda extranjera:** CFEs en USD fallan si no hay configuración para esa moneda

## Orden de configuración recomendado

1.  Configurar el [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/) con todas las cuentas necesarias
2.  Crear los [Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/) para compras
3.  Dar de alta los RUTs de proveedores principales
4.  Configurar la definición de asientos para cada RUT
5.  Probar con algunos CFEs antes de procesar masivamente

#### Te puede interesar

-   [Generar Asientos desde CFEs Recibidos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/generar-asientos-desde-cfes-recibidos/)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Números de RUT - PreviousTipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/)[Next - Números de RUTParámetros Generales de Contabilidad](https://zetasoftware.info/ayuda/configuracion/contabilidad/parametros-generales-de-contabilidad/)
