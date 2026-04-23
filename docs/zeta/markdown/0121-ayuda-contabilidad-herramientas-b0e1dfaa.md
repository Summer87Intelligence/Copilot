# Herramientas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/contabilidad/herramientas/
- URL final: https://zetasoftware.info/ayuda/contabilidad/herramientas/

---

## Contenido

# Herramientas

Las Herramientas del módulo de Contabilidad automatizan procesos, validan datos y facilitan el mantenimiento de la información contable. Permiten generar asientos automáticamente, detectar errores, importar y exportar información, y cumplir con requerimientos fiscales.

## Qué son las herramientas

Las herramientas son funciones de soporte que operan sobre la contabilidad existente. Su propósito es:

-   **Automatizar:** generar asientos desde otras fuentes (comprobantes, CFEs, cálculos)
-   **Validar:** detectar inconsistencias y errores en los asientos registrados
-   **Corregir:** sustituir cuentas, eliminar asientos erróneos
-   **Transferir:** importar y exportar asientos entre sistemas o empresas
-   **Cumplir:** generar archivos requeridos por organismos fiscales

## Qué NO son las herramientas

Las herramientas no crean contabilidad nueva por sí mismas. Transforman, validan o transfieren información que ya existe en alguna forma (comprobantes registrados, CFEs recibidos, archivos externos). Si la información de origen tiene errores, los asientos generados también los tendrán.

## Origen de los errores más comunes

La mayoría de los problemas operativos no se originan en las herramientas, sino en:

-   **Configuración incorrecta:** cuentas mal asignadas en [Números de RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/), tipos de asientos sin configurar, literales tributarios faltantes
-   **Ejercicio mal definido:** fechas incorrectas, ejercicio cerrado cuando debería estar abierto, o ejercicio equivocado seleccionado como activo
-   **Plan de Cuentas inconsistente:** cuentas faltantes, códigos duplicados, o estructura que no refleja la operativa real

Antes de buscar el error en una herramienta, verificá que la configuración base sea correcta. Un diagnóstico temprano ahorra tiempo y evita correcciones masivas posteriores.

## Generación automática de asientos

Estas herramientas crean asientos contables a partir de otras fuentes de información:

-   [Asientos Automáticos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/): Índice de todas las herramientas de generación automática
-   [Generar Asientos desde CFEs Recibidos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/generar-asientos-desde-cfes-recibidos/): Contabiliza las facturas de proveedores recibidas electrónicamente
-   [Asientos desde los Comprobantes](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-desde-los-comprobantes/): Genera asientos desde facturas, recibos y otros comprobantes de Gestión/Facturación
-   [Asientos de Diferencias de Cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/): Calcula y registra diferencias por variación de tipo de cambio
-   [Asientos de Resultado](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-resultado/): Genera el asiento que traslada el resultado del ejercicio al patrimonio
-   [Asientos de Cierre y Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/): Genera los asientos para cerrar un ejercicio y abrir el siguiente

## Validación y mantenimiento

Herramientas para verificar y corregir la información contable:

-   [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/): Detecta y corrige inconsistencias en los asientos registrados
-   [Sustituir Cuentas](https://zetasoftware.info/ayuda/contabilidad/herramientas/sustituir-cuentas/): Reemplaza una cuenta por otra en múltiples asientos
-   [Borrar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/borrar-asientos/): Elimina asientos de forma controlada según criterios específicos

## Importación y exportación

Herramientas para intercambiar información con otros sistemas:

-   [Exportar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/exportar-asientos/): Genera archivos Excel con los asientos del ejercicio
-   [Importar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/importar-asientos/): Carga asientos desde archivos Excel
-   [Bandeja de Entrada](https://zetasoftware.info/ayuda/contabilidad/herramientas/bandeja-de-entrada/): Revisa asientos importados o generados automáticamente antes de incorporarlos

## Cumplimiento fiscal

-   [Generar Anexo DGI 2/181](https://zetasoftware.info/ayuda/contabilidad/herramientas/generar-anexo-dgi/): Prepara el archivo requerido por la DGI de Uruguay

## Flujo de trabajo típico

Un ciclo contable mensual típico utiliza estas herramientas en secuencia:

1.  **Generación:** [Asientos desde Comprobantes](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-desde-los-comprobantes/) y [desde CFEs Recibidos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/generar-asientos-desde-cfes-recibidos/)
2.  **Revisión:** [Bandeja de Entrada](https://zetasoftware.info/ayuda/contabilidad/herramientas/bandeja-de-entrada/) para aprobar o ajustar
3.  **Validación:** [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/) para detectar errores
4.  **Ajustes:** [Diferencias de Cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/) si operás en múltiples monedas
5.  **Cumplimiento:** [Anexo DGI 2/181](https://zetasoftware.info/ayuda/contabilidad/herramientas/generar-anexo-dgi/) para presentaciones fiscales

Al cierre del ejercicio se agregan: [Asientos de Resultado](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-resultado/) y [Cierre y Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/).

[Herramientas - PreviousAnálisis](https://zetasoftware.info/ayuda/contabilidad/informes/analisis/)[Next - HerramientasAsientos Automáticos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/)

---

## Links relacionados

- [Números de RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/)
- [Asientos Automáticos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/)
- [Asientos de Cierre y Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/)
- [Asientos de Diferencias de Cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/)
- [Asientos de Resultado](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-resultado/)
- [Asientos desde los Comprobantes](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-desde-los-comprobantes/)
- [Generar Asientos desde CFEs Recibidos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/generar-asientos-desde-cfes-recibidos/)
- [Bandeja de Entrada](https://zetasoftware.info/ayuda/contabilidad/herramientas/bandeja-de-entrada/)
- [Borrar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/borrar-asientos/)
- [Exportar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/exportar-asientos/)
- [Generar Anexo DGI 2/181](https://zetasoftware.info/ayuda/contabilidad/herramientas/generar-anexo-dgi/)
- [Importar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/importar-asientos/)
- [Sustituir Cuentas](https://zetasoftware.info/ayuda/contabilidad/herramientas/sustituir-cuentas/)
- [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/)
- [Herramientas - PreviousAnálisis](https://zetasoftware.info/ayuda/contabilidad/informes/analisis/)

