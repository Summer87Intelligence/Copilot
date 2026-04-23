# Asientos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/contabilidad/asientos/
- URL final: https://zetasoftware.info/ayuda/contabilidad/asientos/

---

## Contenido

# Asientos

El asiento contable es el registro fundamental de la contabilidad. Documenta cada operación económica indicando qué cuentas se afectan, por qué importes, y mantiene siempre el equilibrio entre Debe y Haber según el principio de partida doble.

## ¿Qué es un asiento contable?

Un asiento contable registra una transacción económica descomponiéndola en sus efectos sobre las cuentas de la empresa. Cada asiento tiene:

-   **Fecha:** cuándo ocurrió la operación
-   **Número:** identificador único dentro del [Ejercicio Contable](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/)
-   **Tipo:** clasificación según el [Tipo de Asiento](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/)
-   **Concepto:** descripción de la operación
-   **Líneas:** detalle de cuentas afectadas con sus importes al Debe o Haber

### El principio de partida doble

Todo asiento debe cumplir una regla fundamental: la suma del Debe debe ser igual a la suma del Haber. Este equilibrio garantiza la integridad de la contabilidad. Si intentás guardar un asiento desbalanceado, el sistema no lo permitirá.

### Ejemplo: venta en efectivo

Una venta de $10.000 más IVA ($2.200) cobrada en efectivo genera:

| Cuenta | Debe | Haber |
| --- | --- | --- |
| Caja | $12.200 |  |
| Ventas |  | $10.000 |
| IVA Ventas |  | $2.200 |
| **Total** | **$12.200** | **$12.200** |

El dinero entra (Debe en Caja), el ingreso se reconoce (Haber en Ventas) y la obligación fiscal se registra (Haber en IVA Ventas). El asiento balancea.

## Cómo crear un asiento

### Datos del cabezal

1.  Ingresá la **fecha** de la operación (debe estar dentro del ejercicio activo)
2.  El **número** se asigna automáticamente o podés ingresarlo manualmente
3.  Seleccioná el **tipo de asiento** que corresponda
4.  Escribí un **concepto** claro que identifique la operación
5.  Opcionalmente, completá campos adicionales: moneda, cotización, referencia, local

### Las líneas del asiento

Cada línea representa un movimiento en una cuenta:

1.  Seleccioná la **cuenta** del [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/)
2.  Ingresá el importe en la columna **Debe** o **Haber** según corresponda
3.  Si la cuenta requiere **centro de costos**, asignalo
4.  Agregá líneas hasta completar el asiento

El sistema muestra en todo momento la diferencia entre Debe y Haber. Cuando llegue a cero, el asiento está balanceado y listo para guardar.

## Acciones sobre asientos

### Editar un asiento

Desde la grilla de asientos, hacé clic en el asiento para abrirlo. Podés modificar cualquier campo del cabezal o las líneas. Al guardar, el sistema valida nuevamente el balance.

### Editar líneas individuales

Dentro del asiento, podés editar una línea específica haciendo clic sobre ella. Esto es práctico cuando necesitás corregir una cuenta o un importe puntual.

### Editar todas: edición masiva de líneas

Para asientos con muchas líneas, existe el modo de edición masiva. El botón **Editar todas** está ubicado junto a la opción de selección para eliminar.

Al hacer clic, se abre una grilla completa donde podés:

-   Modificar cuentas de varias líneas sin abrir cada una por separado
-   Cambiar importes (Debe/Haber) directamente en la grilla
-   Eliminar líneas que no correspondan
-   Completar datos adicionales de cada línea

La grilla se abre con **50 líneas vacías disponibles**, lo que permite trabajar cómodamente con asientos extensos sin necesidad de agregar filas manualmente.

**Cómo confirmar los cambios:** podés presionar **Enter** o usar el botón **Confirmar y salir** ubicado arriba a la derecha de la grilla.

**Nota sobre “Nueva fila”:** al pie de la grilla aparece un enlace “Nueva fila” que no tiene efecto. Es una limitación del framework de desarrollo que no puede eliminarse visualmente. Ignoralo y usá las 50 líneas ya disponibles; simplemente dejá en blanco las que no necesites o eliminalas antes de confirmar.

### Eliminar líneas

Podés eliminar líneas de dos formas:

-   **Desde el asiento:** seleccioná las líneas con la opción de selección y confirma la eliminación
-   **Desde “Editar todas”:** en la grilla de edición masiva, borrá directamente las líneas que no correspondan

### Eliminar un asiento completo

Desde la grilla de asientos, seleccioná el asiento y usá la opción de eliminar. También podés usar [Borrar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/borrar-asientos/) para eliminaciones masivas con filtros específicos.

### Duplicar un asiento

Si necesitás crear un asiento similar a uno existente, podés duplicarlo y luego modificar los datos que correspondan. Esto ahorra tiempo en operaciones repetitivas.

## Origen de los asientos

Los asientos pueden llegar a la contabilidad por diferentes vías:

### Asientos manuales

Los que ingresás directamente en esta pantalla. Usados para ajustes, operaciones especiales o cuando no hay automatización disponible.

### Asientos automáticos

Generados por el sistema a partir de otras fuentes:

-   [Desde Comprobantes](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-desde-los-comprobantes/) de Gestión/Facturación
-   [Desde CFEs Recibidos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/generar-asientos-desde-cfes-recibidos/) de proveedores
-   [Diferencias de Cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/), [Resultado](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-resultado/), [Cierre y Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/)

### Asientos importados

Cargados desde archivos Excel mediante [Importar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/importar-asientos/).

Todos los asientos automáticos e importados pasan primero por la [Bandeja de Entrada](https://zetasoftware.info/ayuda/contabilidad/herramientas/bandeja-de-entrada/) para revisión antes de incorporarse definitivamente.

## Navegación desde el asiento

Los asientos mantienen trazabilidad con su origen. Si un asiento fue generado desde un comprobante de Gestión o Facturación, podés navegar directamente al documento fuente. Esta conexión facilita la auditoría y verificación de datos.

La navegación también funciona en sentido inverso: desde los [informes](https://zetasoftware.info/ayuda/contabilidad/informes/) podés llegar al asiento. Por ejemplo: Balance → [Mayor](https://zetasoftware.info/ayuda/contabilidad/informes/mayores/) → Asiento → Comprobante original.

## Validaciones del sistema

Al guardar un asiento, el sistema verifica:

-   **Balance:** Debe = Haber
-   **Cuentas válidas:** todas deben existir en el [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/) y ser imputables
-   **Fecha válida:** dentro del [Ejercicio Contable](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/) activo
-   **Centro de costos:** asignado en cuentas que lo requieren

Si alguna validación falla, el sistema indica el error y no permite guardar hasta corregirlo.

## Errores comunes

-   **Asiento desbalanceado:** verificá que la suma del Debe iguale la del Haber
-   **Cuenta no encontrada:** el código ingresado no existe en el Plan de Cuentas
-   **Cuenta no imputable:** intentás usar una cuenta padre (título) en lugar de una cuenta de detalle
-   **Fecha fuera de ejercicio:** la fecha no está dentro del rango del ejercicio activo
-   **Centro de costos faltante:** la cuenta exige centro de costos y no lo asignaste
-   **El enlace “Nueva fila” no agrega filas:** es una limitación visual que no puede eliminarse; usá las 50 líneas disponibles en la grilla de edición masiva

## Cuándo usar cada modo de edición

| Situación | Modo recomendado |
| --- | --- |
| Corregir una cuenta o importe puntual | Editar la línea individual |
| Asiento con pocas líneas (menos de 10) | Edición normal línea por línea |
| Asiento con muchas líneas | **Editar todas** (grilla masiva) |
| Reorganizar varias líneas a la vez | **Editar todas** (grilla masiva) |
| Crear asiento extenso desde cero | **Editar todas** (aprovechando las 50 líneas disponibles) |

## Buenas prácticas

-   **Conceptos claros:** escribí descripciones que permitan entender la operación meses después
-   **Un asiento por operación:** no mezcles operaciones diferentes en el mismo asiento
-   **Usá tipos de asiento:** facilitan el filtrado y la generación de [informes auxiliares](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/)
-   **Verificá antes de guardar:** revisá cuentas e importes, especialmente en asientos complejos
-   **Aprovechá “Editar todas” en asientos extensos:** es más eficiente que editar línea por línea

## Relación con otras funcionalidades

-   [Comprobantes Contables](https://zetasoftware.info/ayuda/contabilidad/comprobantes-contables/): interfaz simplificada para usuarios no contadores
-   [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/): define las cuentas disponibles para usar en los asientos
-   [Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/): clasifican los asientos para análisis
-   [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/): verifica la integridad de todos los asientos del ejercicio
-   [Libro Diario](https://zetasoftware.info/ayuda/contabilidad/informes/diarios/): presenta los asientos en orden cronológico
-   [Libro Mayor](https://zetasoftware.info/ayuda/contabilidad/informes/mayores/): muestra los asientos que afectaron cada cuenta

#### Te puede interesar

-   [Video Ingreso de Asientos](https://vimeo.com/596507378)
-   [Ingreso de Comprobantes Contables](https://zetasoftware.info/ayuda/contabilidad/comprobantes-contables/)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Asientos - PreviousContabilidad](https://zetasoftware.info/ayuda/contabilidad/)[Next - AsientosComprobantes Contables](https://zetasoftware.info/ayuda/contabilidad/comprobantes-contables/)

---

## Links relacionados

- [Ejercicio Contable](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/)
- [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/)
- [Tipo de Asiento](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/)
- [Asientos - PreviousContabilidad](https://zetasoftware.info/ayuda/contabilidad/)
- [Comprobantes Contables](https://zetasoftware.info/ayuda/contabilidad/comprobantes-contables/)
- [Cierre y Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/)
- [Diferencias de Cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/)
- [Resultado](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-resultado/)
- [Desde Comprobantes](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-desde-los-comprobantes/)
- [Desde CFEs Recibidos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/generar-asientos-desde-cfes-recibidos/)
- [Bandeja de Entrada](https://zetasoftware.info/ayuda/contabilidad/herramientas/bandeja-de-entrada/)
- [Borrar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/borrar-asientos/)
- [Importar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/importar-asientos/)
- [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/)
- [informes](https://zetasoftware.info/ayuda/contabilidad/informes/)
- [informes auxiliares](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/)
- [Libro Diario](https://zetasoftware.info/ayuda/contabilidad/informes/diarios/)
- [Mayor](https://zetasoftware.info/ayuda/contabilidad/informes/mayores/)
- [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

