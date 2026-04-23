# 10 - Octubre - ZetaSoftware

# 10 – Octubre

Martes 28

### **Gestión PyME »** **Identificación de artículos inactivos en el reporte de Stock Actual (Excel)**

En el reporte de **Stock Actual**, que muestra las existencias de cada artículo por depósito, se incorporó una mejora en la forma de identificar los artículos que están actualmente inactivos. Si bien siempre se incluyeron en el reporte aquellos artículos inactivos que aún tenían stock —para alertar al usuario de que posee unidades disponibles de productos dados de baja—, ahora esa condición se señala explícitamente en el archivo Excel.

A partir de esta versión, en la columna donde se muestra el código del artículo, se añade la etiqueta **\[no activo\]** junto al código cuando el artículo ha sido desactivado. Esto solo aplica a la **exportación en Excel** del reporte, y permite distinguir rápidamente aquellos productos que, pese a estar inactivos, aún figuran con stock, ayudando a tomar decisiones operativas más informadas.

Martes 21

### **Gestión PyME »** **Ventas por Vendedor**

Se mejoró el funcionamiento del reporte “Ventas por Vendedor” para asegurar una lectura completa y precisa del historial de ventas, incluso en casos donde los vendedores ya no están activos. Anteriormente, el listado de vendedores del panel de parámetros solo incluía a aquellos que estaban actualmente marcados como “vendedores” en la configuración. Esto podía generar omisiones en el reporte si un vendedor había sido desmarcado, ya que sus ventas pasadas no se mostraban.

A partir de ahora, el listado incluye **todos los registros** de la tabla de vendedores, sin importar su estado actual. Cada uno se presenta acompañado por una etiqueta entre paréntesis que aclara su rol actual: “vendedor”, “cobrador”, “vendedor y cobrador” o “no activo”. Si se elige un vendedor específico, el reporte mostrará sus ventas sin restricciones. Si se elige la opción “todos”, el sistema evalúa caso por caso:

– Para vendedores activos, se mostrarán sus totales incluso si no tuvieron ventas (con monto cero).

– Para vendedores inactivos o cobradores, solo se incluirán si efectivamente tuvieron ventas en el período consultado. Si no las hubo, no se muestran.

Este cambio permite mantener reportes más precisos y relevantes, evitando la aparición constante de líneas en blanco de personas que ya no forman parte del equipo comercial.

Jueves 09

### **Facturación Profesional »** **Decimales en Cantidades y Precios**

En el módulo de Facturación Profesional se realizaron ajustes y mejoras en el nuevo Asistente de Facturación para permitir un manejo más preciso de los importes. A partir de esta versión, las cantidades y los precios de artículos o servicios pueden ingresarse con hasta **cinco decimales**, brindando mayor exactitud en operaciones que requieren alta precisión. No obstante, el sistema continúa respetando la configuración del usuario al momento de redondear, aplicando **dos decimales** en los totales finales si así está definido en las preferencias de la empresa.

### **Facturación Profesional »** **Edición de líneas en facturas aún no emitidas**

Ahora es posible editar directamente más campos en las facturas ya generadas —pero aún no emitidas— dentro del módulo de Facturación Profesional. Además del concepto y las notas, que ya podían modificarse en cada línea del comprobante, también se habilitó la edición de **precio**, **cantidad** y **descuentos**. Esta mejora permite realizar ajustes rápidos y precisos sobre comprobantes que están en preparación, sin necesidad de rehacer el comprobante completo desde cero.

* * *

[10 – Octubre - Previous09 – Setiembre](https://zetasoftware.info/ayuda/actualizaciones/2025-2/09-setiembre/)[Next - 10 – Octubre11 – Noviembre](https://zetasoftware.info/ayuda/actualizaciones/2025-2/11-noviembre/)
