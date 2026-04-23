# Grupos de Cuentas - ZetaSoftware

# Grupos de Cuentas

Los Grupos de Cuentas son una clasificación adicional que permite agrupar cuentas contables según criterios personalizados, independientemente del capítulo al que pertenezcan en el [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/).

## ¿Por qué existen los Grupos de Cuentas?

El Plan de Cuentas organiza las cuentas en una jerarquía rígida: Activo, Pasivo, Capital, Ganancias, Pérdidas. Esta estructura es perfecta para generar estados financieros, pero no siempre refleja cómo necesitás analizar la información.

Por ejemplo, las cuentas de IVA están dispersas en el Plan:

-   IVA Compras → Activo
-   IVA Ventas → Pasivo
-   IVA a Pagar → Pasivo

Si querés ver todas las cuentas relacionadas con IVA en un solo lugar, necesitás una clasificación transversal. Eso es exactamente lo que proporcionan los Grupos de Cuentas.

## Diferencia entre cuenta contable y grupo de cuentas

| Concepto | Cuenta contable | Grupo de cuentas |
| --- | --- | --- |
| Función | Registra movimientos (Debe/Haber) | Clasifica cuentas para análisis |
| Jerarquía | Pertenece a un capítulo fijo (Activo, Pasivo, etc.) | Agrupa cuentas de cualquier capítulo |
| En asientos | Se imputa directamente | No se imputa, solo organiza |
| En informes | Muestra saldos y movimientos | Permite filtrar y agrupar |

## Datos a configurar

### Código

Identificador único del grupo. Puede ser numérico o alfanumérico según tu preferencia de organización.

### Nombre

Descripción del grupo que aparecerá en los informes y filtros. Elegí nombres claros que identifiquen la temática común de las cuentas agrupadas.

## Ejemplos de grupos típicos

| Código | Nombre | Cuentas que incluye | Utilidad práctica |
| --- | --- | --- | --- |
| 01 | Caja y Bancos | Caja Pesos, Caja Dólares, Banco X Cta Cte, Banco Y Caja Ahorro | Ver disponibilidades totales sin importar moneda o institución |
| 02 | Deudores Comerciales | Deudores por Ventas, Documentos a Cobrar, Cheques Diferidos Recibidos | Analizar el total de créditos otorgados a clientes |
| 03 | Proveedores | Proveedores Locales, Proveedores del Exterior, Documentos a Pagar | Controlar el total de deudas comerciales |
| 04 | Cuentas de IVA | IVA Compras, IVA Ventas, IVA a Pagar, IVA Retenido | Gestionar la posición fiscal de IVA en un solo vistazo |
| 05 | Retenciones | IRPF Retenido, IVA Retenido, Aportes Retenidos | Controlar obligaciones de retención pendientes |
| 06 | Costos de Personal | Sueldos, Cargas Sociales, Aguinaldo, Licencia, Salario Vacacional | Analizar el costo total de la nómina |
| 07 | Gastos de Estructura | Alquileres, Servicios Públicos, Seguros, Mantenimiento | Evaluar costos fijos de operación |

## Cómo se gestionan los grupos

### Crear un grupo

Desde la pantalla de Grupos de Cuentas, utilizá el botón Agregar. Ingresá el código y nombre del nuevo grupo.

### Editar un grupo

Seleccioná el grupo en la grilla y modificá sus datos. Los cambios de nombre se reflejan automáticamente en todos los informes.

### Eliminar un grupo

Podés eliminar un grupo siempre que no tenga cuentas asignadas. Si el grupo tiene cuentas vinculadas, primero debés reasignarlas a otro grupo o dejarlas sin grupo desde el [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/).

## Asignación de cuentas a grupos

La asignación se realiza cuenta por cuenta desde el [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/). Cada cuenta tiene un campo “Grupo” donde seleccionás a qué grupo pertenece.

Una cuenta puede pertenecer a un solo grupo (o a ninguno). Si necesitás que una cuenta aparezca en múltiples análisis, considerá usar filtros combinados en los informes en lugar de duplicar grupos.

## Uso en informes

Los Grupos de Cuentas agregan una dimensión de análisis a los informes contables:

### Balances

En los [Balances](https://zetasoftware.info/ayuda/contabilidad/informes/balances/) podés filtrar por grupo para ver únicamente las cuentas de un tema específico, o agrupar la presentación por grupos en lugar de por capítulos.

### Mayores

Los [Mayores](https://zetasoftware.info/ayuda/contabilidad/informes/mayores/) permiten filtrar por grupo para obtener el detalle de movimientos de todas las cuentas relacionadas con una temática.

### Auxiliares

En los [Auxiliares](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/), los grupos facilitan la selección de cuentas cuando necesitás emitir libros de un conjunto específico.

### Análisis

Las herramientas de [Análisis](https://zetasoftware.info/ayuda/contabilidad/informes/analisis/) aprovechan los grupos para generar reportes comparativos y de evolución por temática contable.

## Buenas prácticas

-   **Definí los grupos antes de crear el Plan de Cuentas:** así podés asignar cada cuenta a su grupo desde el inicio
-   **Usá nombres descriptivos:** “Cuentas de IVA” es más claro que “Grupo 04”
-   **No crees grupos redundantes:** si el Plan de Cuentas ya agrupa naturalmente ciertas cuentas (ej: todas las de Disponibilidades bajo 111), no necesitás un grupo adicional
-   **Pensá en los informes que necesitás:** creá grupos que respondan preguntas de gestión concretas

## Relación con otras configuraciones

Los Grupos de Cuentas se definen aquí, pero se utilizan en:

-   [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/) → para asignar cada cuenta a un grupo
-   [Balances](https://zetasoftware.info/ayuda/contabilidad/informes/balances/), [Mayores](https://zetasoftware.info/ayuda/contabilidad/informes/mayores/), [Auxiliares](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/) y [Análisis](https://zetasoftware.info/ayuda/contabilidad/informes/analisis/) → como criterio de filtro y agrupación

#### Te puede interesar

-   [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Grupos de Cuentas - PreviousPlan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/)[Next - Grupos de CuentasEjercicios Contables](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/)
