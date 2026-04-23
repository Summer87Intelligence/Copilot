# Ejercicios Contables - ZetaSoftware

# Ejercicios Contables

El Ejercicio Contable define el período temporal de trabajo de la contabilidad. Determina qué fechas son válidas para registrar asientos contables, qué informes se pueden emitir, y cuándo corresponde ejecutar los procesos de cierre. Un ejercicio mal configurado o seleccionado incorrectamente es causa frecuente de errores operativos.

## ¿Qué es un Ejercicio Contable?

Es el período (generalmente de 12 meses) que abarca un ciclo contable completo: desde la apertura inicial hasta el cierre final. Típicamente coincide con el año fiscal, aunque puede definirse según las necesidades de la empresa.

Cada ejercicio tiene:

-   **Fecha de inicio:** primer día válido para registrar asientos contables
-   **Fecha de fin:** último día válido para registrar asientos contables
-   **Estado:** abierto (permite operaciones) o cerrado (bloqueado)

## Ejercicio activo

En todo momento hay un ejercicio marcado como “activo” o “de trabajo”. Este ejercicio determina:

-   Dónde se registran los nuevos asientos contables
-   Qué período muestran los informes por defecto
-   Sobre qué datos operan las herramientas

Podés cambiar el ejercicio activo en cualquier momento para trabajar con períodos anteriores (si no están cerrados) o para preparar el ejercicio siguiente.

## Crear un nuevo ejercicio

Al iniciar un nuevo año fiscal:

1.  Accedé a Configuración → Ejercicios Contables
2.  Creá el nuevo ejercicio indicando fechas de inicio y fin
3.  El ejercicio se crea en estado “abierto”
4.  Establecelo como ejercicio activo cuando comiences a operar en él

El nuevo ejercicio debe existir antes de generar los [asientos de cierre y apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/), ya que la apertura se registra en el ejercicio siguiente.

## Cerrar un ejercicio

Cerrar un ejercicio lo bloquea para evitar modificaciones. Antes de cerrar:

1.  Verificá que todos los asientos contables estén registrados
2.  Ejecutá [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/)
3.  Generá los [asientos de diferencias de cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/) si corresponde
4.  Generá los [asientos de resultado](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-resultado/)
5.  Generá los [asientos de cierre y apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/)
6.  Emití los [Balances](https://zetasoftware.info/ayuda/contabilidad/informes/balances/) definitivos
7.  Cambiá el estado del ejercicio a “cerrado”

Un ejercicio cerrado puede reabrirse si es necesario hacer correcciones, aunque esto debe hacerse con precaución.

## Trabajar con múltiples ejercicios

Es común tener dos ejercicios abiertos simultáneamente durante el período de transición:

-   El ejercicio anterior (pendiente de cierre definitivo)
-   El ejercicio actual (donde se registran las operaciones corrientes)

Cambiá el ejercicio activo según dónde necesites trabajar. Los [informes](https://zetasoftware.info/ayuda/contabilidad/informes/) siempre respetan el ejercicio seleccionado.

## Errores comunes

-   **Registrar asientos en el ejercicio equivocado:** verificá siempre qué ejercicio está activo antes de operar
-   **Cerrar sin generar apertura:** el nuevo ejercicio quedará sin saldos iniciales
-   **Fechas fuera de rango:** un asiento contable con fecha fuera del ejercicio activo genera error
-   **Olvidar crear el ejercicio nuevo:** no podrás generar la apertura ni registrar operaciones del nuevo período

## Relación con otras funcionalidades

-   [Asientos](https://zetasoftware.info/ayuda/contabilidad/asientos/): Se registran dentro del ejercicio activo
-   [Informes](https://zetasoftware.info/ayuda/contabilidad/informes/): Muestran datos del ejercicio seleccionado
-   [Balances](https://zetasoftware.info/ayuda/contabilidad/informes/balances/): El balance de cierre resume el ejercicio completo
-   [Diarios](https://zetasoftware.info/ayuda/contabilidad/informes/diarios/): El libro diario documenta todas las operaciones del ejercicio
-   [Mayores](https://zetasoftware.info/ayuda/contabilidad/informes/mayores/): Muestran movimientos dentro del rango del ejercicio
-   [Cierre y Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/): Proceso que conecta un ejercicio con el siguiente
-   [Parámetros Generales](https://zetasoftware.info/ayuda/configuracion/contabilidad/parametros-generales-de-contabilidad/): Configuración base que aplica a todos los ejercicios

#### Te puede interesar

-   [Video Ejercicios Contables](https://vimeo.com/596500303)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Ejercicios Contables - PreviousGrupos de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/grupos-de-cuentas/)[Next - Ejercicios ContablesAuxiliares](https://zetasoftware.info/ayuda/configuracion/contabilidad/auxiliares/)
