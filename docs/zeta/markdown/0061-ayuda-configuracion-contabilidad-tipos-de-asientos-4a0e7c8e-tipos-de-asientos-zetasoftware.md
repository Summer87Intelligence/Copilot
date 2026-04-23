# Tipos de Asientos - ZetaSoftware

# Tipos de Asientos

Los Tipos de Asientos clasifican las operaciones contables según su naturaleza o propósito. Cada asiento que registrás en el sistema tiene un tipo asignado, lo que permite segmentar la información, generar informes específicos y automatizar comportamientos en la emisión de libros.

## ¿Para qué sirven?

Sin tipos de asiento, todos los registros contables serían indistinguibles. Los tipos permiten:

-   **Identificar la naturaleza** de cada operación (venta, compra, cobro, pago, ajuste)
-   **Filtrar informes** por tipo de operación
-   **Agrupar en Auxiliares** para consolidar operaciones relacionadas
-   **Configurar comportamientos** específicos para informes fiscales (Anexo 2/181, columna de IVA)
-   **Sugerir conceptos** automáticamente al crear asientos

## Relación con Auxiliares

Cada Tipo de Asiento pertenece a un [Auxiliar](https://zetasoftware.info/ayuda/configuracion/contabilidad/auxiliares/). Esta vinculación permite que al emitir un Libro Auxiliar (ej: Ventas), el sistema incluya automáticamente todos los asientos de los tipos asociados.

Por ejemplo, el Auxiliar “Ventas” puede contener los tipos:

-   Ventas Crédito
-   Ventas Contado
-   Notas de Crédito Emitidas
-   Devoluciones de Venta

## Datos a configurar

### Código

Identificador alfanumérico único. Ejemplos: VC (Venta Crédito), VE (Venta Contado), CC (Compra Crédito), PAG (Pagos).

### Nombre

Descripción del tipo que aparece en informes y al seleccionar el tipo en el ingreso de asientos.

### Concepto

Texto sugerido que se autocompleta en el campo “Concepto” del asiento al seleccionar este tipo. Por ejemplo, para el tipo “Ventas Crédito” podría ser “Factura de Venta”. El usuario puede modificarlo en cada asiento.

### Auxiliar

Seleccioná el [Auxiliar](https://zetasoftware.info/ayuda/configuracion/contabilidad/auxiliares/) al que pertenece este tipo. Esto determina en qué Libro Auxiliar aparecerán los asientos de este tipo.

### Columna del IVA

Indica si el IVA de los asientos de este tipo va al Debe o al Haber en la emisión de Libros Auxiliares y el Anexo 2/181. Configuración importante para que los informes fiscales reflejen correctamente la posición de IVA.

### Anexo DGI 2/181

Marca si los asientos de este tipo deben incluirse en la generación del Anexo 2/181 para la DGI. Típicamente se activa para tipos de Ventas y Compras.

### Importes negativos en Auxiliares

Indica que los importes de este tipo se muestren en negativo en los Libros Auxiliares. Útil para tipos que representan operaciones que reducen el total (ej: Devoluciones, Notas de Crédito).

### Resumir en emisión de Diarios

Si está marcado, todos los asientos del mismo tipo y fecha se muestran como un único asiento resumido en la emisión de [Diarios](https://zetasoftware.info/ayuda/contabilidad/informes/diarios/). Útil para tipos con muchas operaciones diarias (ej: ventas minoristas).

## Tipos predefinidos del sistema

ZetaSoftware incluye cuatro tipos de asiento reservados que no pueden eliminarse ni modificarse. Se utilizan para procesos automáticos:

| Código | Nombre | Uso |
| --- | --- | --- |
| A | Apertura del Ejercicio | Asientos automáticos de apertura generados por [Cierre y Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/) |
| Y | Resultados del Ejercicio | Asiento que traslada el resultado a patrimonio |
| Z | Cierre del Ejercicio | Asientos automáticos de cierre que cancelan saldos |
| X | Diferencias de Cambio | Asientos automáticos generados por el cálculo de diferencias de cambio |

Estos tipos garantizan que los procesos automáticos funcionen correctamente y que los asientos generados sean identificables.

## Ejemplos de tipos personalizados

| Código | Nombre | Auxiliar | Concepto sugerido | Negativo |
| --- | --- | --- | --- | --- |
| VC | Ventas Crédito | Ventas | Factura de Venta | No |
| VE | Ventas Contado | Ventas | Boleta de Venta | No |
| NC | Notas de Crédito Emitidas | Ventas | Nota de Crédito | Sí |
| CC | Compras Crédito | Compras | Factura de Compra | No |
| COB | Cobros | Caja | Cobranza | No |
| PAG | Pagos | Caja | Pago a Proveedor | No |
| AJU | Ajustes | Diversos | Ajuste Contable | No |

## Uso en el flujo de trabajo

### Al ingresar asientos

Cuando creás un [asiento](https://zetasoftware.info/ayuda/contabilidad/asientos/), seleccionás el Tipo de Asiento correspondiente. El sistema autocompleta el concepto sugerido y asocia el asiento al Auxiliar configurado.

### En informes

Los [Diarios](https://zetasoftware.info/ayuda/contabilidad/informes/diarios/) pueden filtrarse o resumirse por tipo. Los [Libros Auxiliares](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/) agrupan automáticamente los asientos según el Auxiliar de cada tipo.

### En procesos fiscales

El Anexo 2/181 incluye únicamente los asientos cuyos tipos tengan marcada esa opción, con la columna de IVA configurada correctamente.

## Cómo se gestionan

### Crear un tipo

Usá el botón Agregar. Completá código, nombre, auxiliar y las opciones de comportamiento.

### Editar un tipo

Modificá los datos del tipo. Los cambios afectan la visualización en informes pero no alteran los asientos ya registrados.

### Eliminar un tipo

Solo podés eliminar tipos que no tengan asientos asociados. Los tipos predefinidos (A, Y, Z, X) no pueden eliminarse.

## Orden de configuración

Configurá en este orden:

1.  [Auxiliares](https://zetasoftware.info/ayuda/configuracion/contabilidad/auxiliares/) (categorías amplias)
2.  Tipos de Asientos (esta pantalla)
3.  Comenzar a registrar [asientos](https://zetasoftware.info/ayuda/contabilidad/asientos/)

## Buenas prácticas

-   **Creá tipos específicos:** “Ventas Crédito” y “Ventas Contado” por separado permiten mejor análisis que un único tipo “Ventas”
-   **Usá conceptos descriptivos:** el concepto sugerido ahorra tiempo y estandariza la documentación
-   **Configurá correctamente el IVA:** errores en la columna de IVA generan problemas en el Anexo 2/181
-   **Marcá negativos donde corresponda:** Notas de Crédito y Devoluciones deben mostrarse en negativo para que los totales de auxiliares sean correctos
-   **No abuses del resumen en Diarios:** usalo solo para tipos con alto volumen donde el detalle individual no aporta valor

## Errores comunes

-   **No vincular al Auxiliar correcto:** el asiento no aparece en el Libro Auxiliar esperado
-   **Olvidar marcar Anexo 2/181:** ventas o compras quedan fuera del informe fiscal
-   **Columna de IVA invertida:** el IVA aparece en la columna incorrecta del anexo
-   **Usar tipos predefinidos para operaciones normales:** los tipos A, Y, Z, X son solo para procesos automáticos

#### Te puede interesar

-   [Video Tipos de Asientos](https://vimeo.com/596500324)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Tipos de Asientos - PreviousAuxiliares](https://zetasoftware.info/ayuda/configuracion/contabilidad/auxiliares/)[Next - Tipos de AsientosNúmeros de RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/)
