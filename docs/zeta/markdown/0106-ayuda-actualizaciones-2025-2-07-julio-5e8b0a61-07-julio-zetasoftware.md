# 07 - Julio - ZetaSoftware

# 07 – Julio

Jueves 24

### **Gestión »** **Fecha de Endosado basada en documento origen**

A partir de esta versión, al endosar un cheque, voucher o documento en cartera, el sistema registra como **fecha de endoso** la **fecha del documento origen al que se vincula el endoso** (por ejemplo, una compra contado o un recibo de pago a proveedores).

Hasta ahora, el sistema utilizaba la fecha del día en que se realizaba el endoso, lo que en muchos casos no reflejaba la realidad operativa y podía generar diferencias en el seguimiento contable. Con esta mejora, el cambio de estado del documento —de cartera a endosado— se alinea con la fecha efectiva del comprobante asociado, asegurando mayor coherencia entre la operación registrada y su impacto financiero.

Esta modificación mejora la trazabilidad y la consistencia en los reportes de tesorería y contabilidad.

Lunes 21

### **Facturación »** **Sugerencia inteligente de comprobante al agregar facturas**

El sistema sugiere automáticamente el último tipo de comprobante utilizado al agregar una nueva factura. A partir de esta versión, se mejoró este comportamiento en los casos en que el último comprobante corresponde a una devolución (Nota de Crédito, Devolución Contado y sus equivalentes en contingencia). En esas situaciones, el sistema ya no sugiere una nueva devolución, sino el comprobante de venta correspondiente (por ejemplo, Venta Crédito o Venta Contado). Esta lógica permite inferir con mayor precisión el tipo de venta más habitual del usuario, evitando sugerencias incorrectas basadas en situaciones puntuales como devoluciones.

### **Gestión »** **Validación de clientes o proveedores activos al remitir o facturar desde comprobantes abiertos**

Cuando se remiten o facturan artículos pendientes desde una factura ya abierta (es decir, no desde la herramienta específica de remisión o facturación), el sistema ahora valida si el cliente o proveedor vinculado al comprobante pendiente está activo. En caso de estar inactivo, se muestra un mensaje de advertencia y no se permite continuar con la operación. Para avanzar, es necesario reactivar previamente a la persona o entidad involucrada. Esta validación previene errores y asegura que todas las operaciones se realicen sobre datos vigentes y habilitados.

### **Gestión »** **Corrección al duplicar débitos o créditos bancarios**

Se corrigió un comportamiento al duplicar comprobantes de tipo Débito Bancario o Crédito Bancario. Anteriormente, el sistema copiaba también el identificador del asiento contable original, lo cual podía generar inconsistencias. A partir de esta versión, al crear un comprobante duplicado, el campo correspondiente al ID del asiento queda vacío, como corresponde, permitiendo que el nuevo asiento se genere correctamente de forma independiente.

Miércoles 16

### **Finanzas Personales »** **Visualización de cuentas inactivas**

Se realizó una mejora en los formularios de ingresos, egresos, transferencias y ajustes de saldo dentro del módulo de Finanzas Personales. Hasta ahora, el sistema solo mostraba cuentas activas al momento de cargar un movimiento. Esto funcionaba bien para evitar que el usuario seleccionara cuentas que ya no utiliza, pero generaba un problema al editar movimientos anteriores: si una cuenta había sido desactivada, ya no aparecía en el formulario, lo que podía generar confusión o impedir la modificación.

A partir de ahora, el sistema actúa de la siguiente manera:

-   Al crear un nuevo movimiento, solo se muestran las cuentas activas.
-   Al editar un movimiento existente, la cuenta utilizada se muestra aunque esté desactivada, y se indica con la leyenda “\[inactiva\]” al lado del nombre.

Esto permite seguir editando movimientos históricos sin perder información, al tiempo que se mantiene limpio y actualizado el listado de cuentas disponibles para nuevos registros.

Las cuentas se pueden activar o desactivar desde el menú Configuración → Cuentas.

Martes 15

### **Gestión »** **Actualización de Incoterms: de DAT a DPU**

En cumplimiento con la normativa internacional vigente, el código Incoterm **DAT** (_Delivered at Terminal_) ha sido reemplazado oficialmente por **DPU** (_Delivered at Place Unloaded_).

Los **Incoterms** (International Commercial Terms) son reglas internacionales que definen con claridad las responsabilidades entre el vendedor y el comprador en una operación de comercio exterior: quién asume los costos, riesgos, transporte y seguros en cada etapa del envío.

#### **¿Qué cambia con esta actualización?**

**Mayor flexibilidad geográfica**

El nuevo término **DPU** permite que la entrega se realice en cualquier lugar acordado entre las partes, no únicamente en una “terminal” como exigía el anterior **DAT**. Esto ofrece mayor adaptabilidad a distintos escenarios logísticos.

**Diferencia clave con DAP**

Aunque **DPU** y **DAP** (_Delivered at Place_) pueden parecer similares, existe una diferencia operativa fundamental:

-   En **DAP**, el vendedor entrega la mercadería en el lugar convenido, pero **no está obligado a descargarla**.
    
-   En **DPU**, en cambio, el vendedor **sí debe hacerse cargo de la descarga** en destino.
    

Esto implica una obligación adicional y debe ser tenida en cuenta al pactar condiciones de entrega.

**Nuevo orden en Incoterms® 2020**

En la versión actualizada de los Incoterms, **DPU** se ubica a continuación de **DAP**, reflejando justamente ese nivel extra de responsabilidad asumida por el vendedor: entrega más descarga.

Lunes 14

### **General » Duplicar movimientos bancarios**

En la grilla de **Movimientos Bancarios**, ahora se incorpora la opción de **duplicar** registros, disponible para comprobantes de tipo **crédito** o **débito bancario**. Esta funcionalidad está pensada para facilitar la carga de movimientos recurrentes o similares.

La opción _Duplicar_ aparece directamente en la línea correspondiente de la grilla, y solo estará habilitada cuando se cumplan las siguientes condiciones:

-   El tipo de comprobante sea **Crédito bancario** o **Débito bancario**.
-   La **fecha de trabado** del sistema esté vacía o sea anterior a la fecha actual.

Al seleccionar la opción, el sistema crea un nuevo movimiento bancario con los mismos datos que el comprobante original, pero actualiza la **fecha al día de hoy**. Esta acción no afecta el comprobante original.

Luego de duplicar, el nuevo movimiento se abre automáticamente en pantalla para que el usuario pueda revisar, completar o modificar cualquier campo si lo desea. Esto permite ajustar fácilmente conceptos como el importe, el detalle o el número de referencia antes de grabar el nuevo registro.

Esta función está diseñada para simplificar tareas operativas habituales, como registrar transferencias periódicas, depósitos recurrentes o débitos repetitivos, evitando la necesidad de volver a cargar todos los datos desde cero.

Viernes 04

### **General » Cambios en el formato Excel**

A partir de esta versión, todos los reportes y herramientas de ZetaSoftware que generan archivos de datos en Excel pasarán a utilizar el formato **XLSX**, en lugar del tradicional **XLS**. Esta mejora responde a una necesidad concreta: el formato XLS tiene un límite técnico de 65.536 filas por hoja, lo cual resultaba insuficiente para usuarios que trabajan con grandes volúmenes de datos, como listados con más de 100.000 registros. El nuevo formato XLSX permite más de un millón de filas por hoja, mejora la compatibilidad con versiones modernas de Excel y ofrece un mejor rendimiento general. Originalmente, se mantenía el formato XLS por razones de compatibilidad con versiones antiguas del software, pero entendemos que hoy ese argumento ya no aplica. Este cambio busca asegurar mayor escalabilidad y confiabilidad en la exportación de información para todos los usuarios.

* * *

[07 – Julio - Previous06 – Junio](https://zetasoftware.info/ayuda/actualizaciones/2025-2/06-junio/)[Next - 07 – Julio08 – Agosto](https://zetasoftware.info/ayuda/actualizaciones/2025-2/08-agosto/)
