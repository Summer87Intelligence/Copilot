# 11 - Noviembre - ZetaSoftware

# 11 – Noviembre

Lunes 17

### **Contabilidad »** **Importación de asientos con notas desde Excel**

Se incorporó una mejora en la herramienta de importación de asientos desde Excel, que ahora permite incluir también las **notas generales** de cada asiento.

Para ello, se añadió una nueva columna al final del archivo, llamada **Notas**, donde el usuario puede escribir el texto correspondiente a cada asiento. Al igual que ocurre con los campos de tipo de asiento o número de asiento, el contenido de la columna **Notas debe repetirse en todas las líneas que pertenezcan a un mismo asiento**. Esto asegura que, durante la importación, el sistema pueda vincular correctamente esa nota con el asiento completo.

Una vez importado el archivo, las notas se podrán visualizar en la **bandeja de entrada**, junto a los demás datos del asiento, lo que facilita su revisión antes de confirmar la grabación definitiva.  
Esta mejora permite incorporar información contextual valiosa directamente desde la planilla, optimizando el proceso de carga contable masiva.

Viernes 14

### **Contabilidad »** **Visualización de notas de asiento en grillas y reportes**

Se incorporó la posibilidad de visualizar las **notas generales de los asientos contables** en distintos puntos del sistema. En las **grillas de asientos** —tanto estándar como detalladas— ahora se puede agregar una **columna opcional** que muestra las notas del asiento. Esta columna no aparece preseleccionada por defecto, pero el usuario puede activarla si desea trabajar con esa información directamente desde la grilla.

Por otro lado, en los reportes de **Libros Auxiliares** y **Mayores de Cuenta**, cuando se exportan en formato Excel, se incluye automáticamente una nueva **columna final** con las notas del asiento, en caso de existir. Esto permite contar con mayor contexto al analizar los movimientos contables fuera del sistema.

Además, al ingresar a un asiento y pulsar el botón **Listar**, que genera el reporte PDF del asiento individual, ahora también se incluye al final del documento un **renglón con la nota general**. Esta mejora facilita la trazabilidad y documentación de los asientos en cualquier formato de visualización.

Miércoles 12

### **Gestión »** **Bloqueo de facturas duplicadas por proveedor, comprobante, serie y número**

Se incorporó una validación estricta en el módulo de Gestión que **impide grabar facturas de proveedores duplicadas**. A partir de esta versión, al ingresar o modificar una factura de compra, o al duplicar una factura existente, el sistema verifica que no exista ya una factura registrada para el mismo proveedor, con el mismo tipo de comprobante, serie y número. Si ya existe, **no se permite continuar con el guardado**.

Antes se mostraba solo un mensaje de advertencia, pero ahora la validación es obligatoria. En caso de que el usuario necesite ingresar una factura similar por alguna razón puntual, podrá hacerlo modificando la serie (por ejemplo, usar “A1” en lugar de “A”), lo que permite resolver la situación sin comprometer la integridad del registro contable. Esta mejora busca evitar errores y mantener consistencia en el historial de compras.

Martes 11

### **General »** **Validación al agregar países en Configuración**

Al agregar un nuevo país desde el combo de selección en la Configuración del sistema, ahora se valida que el **código ISO** del país no esté ya asignado a otro registro existente. Esta mejora evita duplicaciones o asignaciones incorrectas de códigos ISO, algo que podía ocurrir al crear países manualmente con datos erróneos. Con esta validación, se refuerza la integridad del catálogo de países y se previenen errores que pueden afectar reportes, validaciones fiscales o integraciones externas.

### **Gestión »** **Aviso al duplicar facturas de Proveedores.** 

Al duplicar una factura de proveedor, si la **serie y número ingresados ya existen** para ese proveedor y tipo de comprobante, el sistema ahora muestra un **mensaje de advertencia al usuario** indicando la posible duplicación. Sin embargo, se permite continuar con la operación si el usuario decide confirmar.

Esta mejora busca alertar sobre posibles errores de carga sin bloquear automáticamente la duplicación, brindando mayor control sin restringir la flexibilidad operativa.

Sábado 4

### **Contabilidad »** **Personalización de columnas al ingresar asientos**

Se incorporó una mejora en la carga de asientos contables: ahora el sistema **oculta automáticamente las columnas opcionales** que no son utilizadas por la empresa, según la configuración definida en los **parámetros del módulo de Contabilidad**.

Por ejemplo, si en la configuración se indica que no se trabaja con **centros de costos**, **referencias**, **número de literal**, dichos campos ya no se mostrarán al momento de ingresar las líneas del asiento. Del mismo modo, si la empresa cuenta con un solo local definido, el sistema asume automáticamente ese valor y **no solicita el dato de local** en cada línea.

Esta mejora simplifica la pantalla de ingreso de asientos, reduce errores y agiliza el trabajo contable, mostrando solo los campos realmente necesarios.

Martes 4

### **Gestión PyME »** **Validación de facturas duplicadas de proveedores**

Se incorporó una validación al usar la opción de **duplicar una factura de proveedor** en el módulo de Gestión. A partir de ahora, cuando el usuario ingresa la **serie y número** del nuevo comprobante, el sistema verifica si ya existe otro comprobante grabado para ese mismo proveedor, con el **mismo código  de comprobante** y el **mismo número**.

Si se detecta una coincidencia, la duplicación no se permite, evitando así el registro de comprobantes duplicados de un mismo proveedor. Esta mejora ayuda a mantener la integridad de los datos y a prevenir errores de carga contable.

* * *

[11 – Noviembre - Previous10 – Octubre](https://zetasoftware.info/ayuda/actualizaciones/2025-2/10-octubre/)[Next - 11 – Noviembre2026](https://zetasoftware.info/ayuda/actualizaciones/2026-2/)
