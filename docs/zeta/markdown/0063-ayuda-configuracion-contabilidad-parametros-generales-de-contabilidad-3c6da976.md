# Parámetros Generales de Contabilidad - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/contabilidad/parametros-generales-de-contabilidad/
- URL final: https://zetasoftware.info/ayuda/configuracion/contabilidad/parametros-generales-de-contabilidad/

---

## Contenido

# Parámetros Generales de Contabilidad

Los Parámetros Generales definen las reglas fundamentales del módulo contable. Esta configuración establece qué funcionalidades estarán disponibles, cómo se organizan los capítulos del Plan de Cuentas, y qué controles aplicará el sistema sobre los asientos.

Es la primera pantalla que debés configurar antes de comenzar a trabajar con la contabilidad, ya que las decisiones tomadas aquí afectan todo el funcionamiento posterior.

## Capítulos del Plan de Cuentas

Definí los códigos que identifican cada capítulo principal de tu [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/). La configuración estándar es:

| Código | Capítulo | Naturaleza |
| --- | --- | --- |
| 1 | Activo | Saldo deudor |
| 2 | Pasivo | Saldo acreedor |
| 3 | Capital / Patrimonio | Saldo acreedor |
| 4 | Ganancias / Ingresos | Saldo acreedor |
| 5 | Pérdidas / Gastos | Saldo deudor |
| 6 | Cuentas de Orden Activo | Contingentes |
| 7 | Cuentas de Orden Pasivo | Contingentes |

Podés personalizar estos códigos según las necesidades de la empresa, pero una vez que comenzás a registrar asientos, modificarlos puede generar inconsistencias.

### Cuentas de Orden

Las Cuentas de Orden (capítulos 6 y 7) registran valores que la empresa controla pero que no forman parte de su patrimonio: bienes en custodia, garantías otorgadas o recibidas, contratos pendientes. Se utilizan para fines informativos y de control interno.

## Trabar Modificaciones

Este parámetro establece una fecha límite antes de la cual no se pueden modificar ni eliminar asientos. Es un control de integridad fundamental:

-   Los asientos con fecha anterior a la fecha de bloqueo quedan protegidos
-   Podés agregar asientos nuevos con fecha posterior
-   Si necesitás corregir un período ya bloqueado, debés actualizar primero esta fecha

**Uso típico:** a medida que cerrás meses o trimestres, movés esta fecha para proteger los períodos ya conciliados y auditados.

## Empresa Cotizaciones

Permite centralizar el ingreso de cotizaciones de monedas extranjeras en una sola empresa. Esto es especialmente útil para estudios contables que administran múltiples empresas:

-   Ingresás las cotizaciones una sola vez en la empresa designada
-   Todas las demás empresas toman las cotizaciones de ahí
-   Evita duplicar trabajo y garantiza consistencia entre empresas

Si dejás este campo vacío, cada empresa maneja sus propias cotizaciones.

## Opciones de informes

### Incluir Nº de página en informes

Agrega numeración de páginas al pie de cada informe. Recomendado para informes formales y presentaciones a terceros.

### Incluir fecha en informes

Agrega la fecha de emisión al pie de cada informe. Útil para identificar cuándo se generó el reporte.

## Funcionalidades opcionales

### Usa Literal Tributario y genera DGI 2/181

Activa el campo “Literal Tributario” en las cuentas del [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/) y habilita la generación del Anexo 2/181 para la DGI.

Si tu empresa debe presentar este anexo fiscal, activá esta opción antes de configurar el Plan de Cuentas para poder asignar los literales correspondientes a cada cuenta.

### Trabaja con Monedas Extranjeras

Habilita el manejo multimoneda en la contabilidad:

-   Permite definir cuentas en diferentes monedas
-   Habilita el ingreso de cotizaciones
-   Activa el cálculo automático de diferencias de cambio
-   Permite generar informes en moneda local y extranjera

Si la empresa opera exclusivamente en moneda local, podés dejar esta opción desactivada para simplificar la operativa.

### Trabaja con Centros de Costo y Referencias

Habilita dos dimensiones adicionales de análisis en los asientos:

-   **Centros de Costo:** permiten asignar cada movimiento a un área, proyecto, sucursal o cualquier segmento de análisis definido por la empresa
-   **Referencias:** campo libre para vincular el asiento con documentación externa (número de factura, orden de compra, etc.)

Si activás esta opción, en el [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/) podrás indicar para cada cuenta si el Centro de Costos es opcional, obligatorio o no aplica.

## Impacto de cada parámetro

| Parámetro | Si está activado | Si está desactivado |
| --- | --- | --- |
| Literal Tributario / DGI 2/181 | Campo visible en Plan de Cuentas, genera Anexo 2/181 | Campo oculto, anexo no disponible |
| Monedas Extranjeras | Cuentas multimoneda, cotizaciones, diferencias de cambio | Solo moneda local, sin cotizaciones |
| Centros de Costo | Campo en asientos, filtros en informes, análisis por centro | Sin segmentación por centros |

## Orden de configuración recomendado

Los Parámetros Generales deben configurarse primero, antes que cualquier otra configuración contable:

1.  **Parámetros Generales** (esta pantalla) – definí capítulos y funcionalidades
2.  [Grupos de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/grupos-de-cuentas/) – si vas a usarlos
3.  [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/) – estructura completa
4.  [Auxiliares](https://zetasoftware.info/ayuda/configuracion/contabilidad/auxiliares/) – categorías de asientos
5.  [Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/) – clasificación operativa
6.  [Ejercicios Contables](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/) – períodos de trabajo
7.  [Números de RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/) – terceros y definiciones de asientos

## Buenas prácticas

-   **Definí todo antes de comenzar a operar:** cambiar parámetros después de registrar asientos puede generar inconsistencias
-   **Activá solo lo que necesitás:** funcionalidades desactivadas simplifican la operativa diaria
-   **Actualizá “Trabar Modificaciones” regularmente:** protegé períodos cerrados a medida que avanzás
-   **Documentá tus decisiones:** si elegís una configuración no estándar, dejá registro del motivo
-   **Consultá con tu contador:** algunas decisiones (literales tributarios, estructura de capítulos) tienen implicancias fiscales

## Errores comunes

-   **Activar Literal Tributario después de crear el Plan:** debés volver a editar cada cuenta para asignar el literal
-   **No activar Monedas Extranjeras cuando se necesita:** luego no podés crear cuentas en otras monedas sin reconfigurar
-   **Olvidar actualizar “Trabar Modificaciones”:** permite modificaciones accidentales en períodos ya cerrados
-   **Cambiar códigos de capítulo con asientos cargados:** puede corromper la estructura del Plan de Cuentas

#### Te puede interesar

-   [Video Parámetros de la Contabilidad](https://vimeo.com/596500316)

[Parámetros Generales de Contabilidad - PreviousNúmeros de RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/)[Next - Parámetros Generales de ContabilidadEmpresa](https://zetasoftware.info/ayuda/configuracion/empresa/)

---

## Links relacionados

- [Auxiliares](https://zetasoftware.info/ayuda/configuracion/contabilidad/auxiliares/)
- [Ejercicios Contables](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/)
- [Grupos de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/grupos-de-cuentas/)
- [Números de RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/)
- [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/)
- [Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/)
- [Next - Parámetros Generales de ContabilidadEmpresa](https://zetasoftware.info/ayuda/configuracion/empresa/)

