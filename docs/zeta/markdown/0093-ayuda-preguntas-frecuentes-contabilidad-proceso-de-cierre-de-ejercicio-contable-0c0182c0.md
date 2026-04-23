# Proceso de Cierre de Ejercicio Contable - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/preguntas-frecuentes/contabilidad/proceso-de-cierre-de-ejercicio-contable/
- URL final: https://zetasoftware.info/ayuda/preguntas-frecuentes/contabilidad/proceso-de-cierre-de-ejercicio-contable/

---

## Contenido

# Proceso de Cierre de Ejercicio Contable

El cierre de ejercicio contable comprende una serie de pasos que deben ejecutarse en orden para garantizar la correcta generación de resultados y la apertura del nuevo ejercicio.

A continuación se detalla el procedimiento recomendado.

## 1\. Validar Asientos

Antes de comenzar el proceso de cierre, es obligatorio validar todos los asientos del ejercicio.

**Ruta:**  
Contabilidad > Herramientas > [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/)

**Ayuda:** [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/)

La herramienta:

-   Verifica la consistencia de los asientos.
-   Detecta errores como asientos desbalanceados, cuentas inexistentes o fechas fuera del ejercicio.
-   Corrige automáticamente ciertos datos (por ejemplo, asignación de usuario o local si faltan).
-   Elimina asientos sin líneas.

Los errores que no pueden corregirse automáticamente deben solucionarse manualmente antes de continuar.

## 2\. Verificar Cotizaciones

Si la empresa opera con monedas extranjeras, debe verificarse que estén cargadas todas las cotizaciones correspondientes al ejercicio a cerrar.

**Ruta:**  
Configuración > Empresa > Monedas y Cotizaciones

**Ayuda:** [Monedas y Cotizaciones](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/)

Se debe comprobar que:

-   Cada mes tenga cotización registrada.
-   Todas las monedas utilizadas estén actualizadas.
-   No existan períodos sin tipo de cambio definido.

Las cotizaciones pueden cargarse manualmente o importarse.

## 3\. Generar Asientos de Diferencia de Cambio

Este proceso ajusta los saldos contables de acuerdo con la variación del tipo de cambio.

**Ruta:**  
Contabilidad > Herramientas > Asientos Automáticos > Asientos de Diferencia de Cambio

**Ayuda:** [Asientos de Diferencia de Cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/)

La herramienta genera automáticamente los asientos necesarios para:

-   Ajustar el saldo en Moneda Nacional de cuentas en Moneda Extranjera.
-   Ajustar el saldo en Moneda Extranjera de cuentas en Moneda Nacional.

### Tipo de Diferencia

-   **Tipo Moneda Nacional:** Ajusta saldos expresados en moneda extranjera para su correcta presentación en moneda funcional.
-   **Tipo Moneda Extranjera:** Ajusta saldos en moneda nacional para emitir balances en la moneda extranjera seleccionada.

### Parámetros solicitados

-   **Fecha:** Fecha hasta la cual se calcularán los saldos.
-   **Cotización:** Tipo de cambio a aplicar.
-   **Concepto:** Texto descriptivo del asiento.
-   **Eliminar diferencias anteriores:** Permite recalcular eliminando ajustes previos de la misma fecha.

Los asientos generados se identifican porque el campo “Cotización” queda grabado con valor negativo (–1, –2, –3 según la moneda).

### Requisitos previos

-   Cotizaciones cargadas.
-   Cuentas marcadas para aplicar diferencia de cambio en el Plan de Cuentas.
-   Cuentas definidas para Diferencia de Cambio Ganada y Perdida.

Este proceso debe ejecutarse para todas las monedas existentes antes de generar el balance definitivo.

## 4\. Verificar el Balance

Luego de generar la diferencia de cambio, debe verificarse que el balance cierre correctamente.

**Ruta:**  
Contabilidad > Informes > Balances

**Ayuda:** [Balances](https://zetasoftware.info/ayuda/contabilidad/informes/balances/)

Se recomienda verificar:

-   Que el balance cierre en todas las monedas.
-   Que no existan cuentas de orden con saldo.
-   Que las fechas y filtros del informe sean correctos.
-   Que los ajustes por diferencia de cambio estén aplicados.

Si existen diferencias, deberán revisarse los mayores y los asientos generados.

## 5\. Crear el Nuevo Ejercicio Contable

Antes de generar los asientos de cierre y apertura, debe existir el ejercicio siguiente.

**Ruta:**  
Contabilidad > Configuración > Ejercicios Contables

**Ayuda:** [Ejercicios Contables](http://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/)

Para crear el nuevo ejercicio:

-   Ingresar fechas de inicio y fin.
-   Guardar el ejercicio.
-   Seleccionarlo como Ejercicio de Trabajo.

Solo el ejercicio definido como Ejercicio de Trabajo permitirá registrar y modificar asientos.

## 6\. Generar Asientos de Resultado

Este proceso cancela las cuentas de ingresos y egresos y determina el resultado del ejercicio.

**Ruta:**  
Contabilidad > Herramientas > Asientos Automáticos > Asientos de Asientos de Resultado

**Ayuda:** [Asientos de Resultado](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-resultado/)

La herramienta genera automáticamente:

-   Un asiento que cancela las cuentas de Pérdidas.
-   Un asiento que cancela las cuentas de Ganancias.
-   Un asiento que traslada el saldo a la cuenta Resultado del Ejercicio.

Debe ejecutarse para todas las monedas y locales definidos.

## 7\. Generar Asientos de Cierre y Apertura

Este es el último paso del proceso.

**Ruta:**  
Contabilidad > Herramientas > Asientos Automáticos > Asientos de Cierre y Apertura

**Ayuda:** [Asientos de Cierre y Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/)

La herramienta:

-   Genera el asiento de cierre del ejercicio actual.
-   Genera el asiento de apertura en el nuevo ejercicio.
-   Traslada los saldos finales como saldos iniciales del ejercicio siguiente.

El asiento de apertura queda registrado como el primer asiento del nuevo ejercicio.

## Orden Recomendado del Proceso

1.  Validar asientos
2.  Verificar cotizaciones
3.  Generar diferencias de cambio
4.  Verificar balance
5.  Crear nuevo ejercicio
6.  Generar asientos de resultado
7.  Generar asientos de cierre y apertura

* * *

[Proceso de Cierre de Ejercicio Contable - PreviousContabilidad](https://zetasoftware.info/ayuda/preguntas-frecuentes/contabilidad/)[Next - Proceso de Cierre de Ejercicio Contable¿Cómo gestionar las empresas de mi Plan Estudio?](https://zetasoftware.info/ayuda/preguntas-frecuentes/contabilidad/como-gestionar-las-empresas-de-mi-plan-estudio/)

---

## Links relacionados

- [Monedas y Cotizaciones](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/)
- [Asientos de Cierre y Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/)
- [Asientos de Diferencia de Cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/)
- [Asientos de Resultado](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-resultado/)
- [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/)
- [Balances](https://zetasoftware.info/ayuda/contabilidad/informes/balances/)
- [Proceso de Cierre de Ejercicio Contable - PreviousContabilidad](https://zetasoftware.info/ayuda/preguntas-frecuentes/contabilidad/)
- [Next - Proceso de Cierre de Ejercicio Contable¿Cómo gestionar las empresas de mi Plan Estudio?](https://zetasoftware.info/ayuda/preguntas-frecuentes/contabilidad/como-gestionar-las-empresas-de-mi-plan-estudio/)

