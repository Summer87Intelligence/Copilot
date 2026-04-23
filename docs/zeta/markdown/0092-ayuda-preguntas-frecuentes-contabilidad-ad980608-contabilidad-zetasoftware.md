# Contabilidad - ZetaSoftware

# Contabilidad

Esta página reúne las dudas más comunes sobre el módulo de Contabilidad de ZetaSoftware. Está pensada tanto para quienes recién comienzan como para contadores que necesitan entender cómo funciona el sistema en profundidad.

## Conceptos generales

### ¿Cómo funciona la contabilidad en ZetaSoftware?

El módulo de Contabilidad sigue el principio de partida doble: cada operación se registra como un [asiento contable](https://zetasoftware.info/ayuda/contabilidad/asientos/) que afecta al menos dos cuentas, manteniendo siempre el equilibrio entre Debe y Haber. Los asientos pueden ingresarse manualmente, generarse automáticamente desde los módulos de Gestión o Facturación, o importarse desde archivos externos. Toda la información se organiza por [Ejercicios Contables](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/) y se presenta a través de [informes](https://zetasoftware.info/ayuda/contabilidad/informes/) estándar.

### ¿Qué necesito configurar antes de empezar a operar?

Antes de registrar el primer asiento, debés tener configurado:

-   [Parámetros Generales](https://zetasoftware.info/ayuda/configuracion/contabilidad/parametros-generales-de-contabilidad/): define el comportamiento base del módulo (capítulos, monedas, centros de costo)
-   [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/): la estructura de cuentas de tu empresa
-   [Ejercicio Contable](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/): el período donde se registrarán los asientos

Opcionalmente, podés configurar [Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/), [Auxiliares](https://zetasoftware.info/ayuda/configuracion/contabilidad/auxiliares/) y [Grupos de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/grupos-de-cuentas/) para organizar mejor la información.

### ¿Qué diferencia hay entre un asiento contable y un comprobante contable?

Ambos registran la misma información, pero con diferente interfaz:

-   **[Asiento contable](https://zetasoftware.info/ayuda/contabilidad/asientos/):** interfaz técnica que muestra todas las líneas con Debe y Haber. Es la forma tradicional de trabajo del contador.
-   **[Comprobante contable](https://zetasoftware.info/ayuda/contabilidad/comprobantes-contables/):** interfaz simplificada que oculta la mecánica de partida doble. Pensada para que usuarios no contadores puedan registrar operaciones sin conocer la técnica contable.

Internamente, ambos generan el mismo registro. La elección depende de quién ingresa la información y su nivel de conocimiento contable.

### ¿Qué relación tiene la contabilidad con los otros módulos de ZetaSoftware?

Los módulos de Gestión PyME y Facturación Profesional pueden generar asientos contables automáticamente a partir de sus comprobantes (facturas, recibos, etc.). Esto elimina la doble digitación y garantiza que la contabilidad refleje las operaciones reales. La generación se controla desde [Asientos desde los Comprobantes](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-desde-los-comprobantes/). También podés contabilizar automáticamente las facturas de proveedores recibidas electrónicamente mediante [Asientos desde CFEs Recibidos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/generar-asientos-desde-cfes-recibidos/).

## Configuración

### ¿Qué es el Plan de Cuentas y cómo debo armarlo?

El [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/) es la estructura jerárquica que organiza todas las cuentas de tu empresa. Define dónde se registra cada tipo de operación: activos, pasivos, patrimonio, ingresos y gastos. Un plan bien diseñado facilita el análisis posterior; un plan mal armado genera confusión y dificulta los informes. Tomáte el tiempo necesario para definirlo correctamente antes de comenzar a operar. Si ya usás un plan en otro sistema, podés replicar la misma estructura.

### ¿Qué son los Ejercicios Contables y por qué son importantes?

El [Ejercicio Contable](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/) delimita un período de trabajo, generalmente un año fiscal. Determina qué fechas son válidas para registrar asientos, qué datos muestran los informes, y cuándo corresponde ejecutar el cierre. Siempre hay un ejercicio “activo” que es donde se registran las operaciones corrientes. Muchos errores operativos se originan en tener seleccionado el ejercicio equivocado.

### ¿Puedo modificar el Plan de Cuentas después de haber registrado asientos?

Sí, con precauciones:

-   **Agregar cuentas:** siempre es posible, sin restricciones
-   **Modificar nombres:** podés hacerlo sin afectar los asientos existentes
-   **Eliminar cuentas:** solo si no tienen movimientos registrados
-   **Cambiar códigos:** no es recomendable; si necesitás reorganizar, usá [Sustituir Cuentas](https://zetasoftware.info/ayuda/contabilidad/herramientas/sustituir-cuentas/) para migrar los movimientos

### ¿Qué pasa si me equivoqué en una configuración inicial?

Depende de qué configuraste mal y si ya registraste operaciones:

-   **Parámetros Generales:** la mayoría pueden modificarse en cualquier momento
-   **Ejercicio Contable:** podés ajustar las fechas si no afecta asientos ya registrados
-   **Cuentas con movimientos:** no podés eliminarlas, pero podés usar [Sustituir Cuentas](https://zetasoftware.info/ayuda/contabilidad/herramientas/sustituir-cuentas/) para trasladar los movimientos a otra cuenta

En general, los errores de configuración tienen solución. Lo importante es detectarlos temprano, antes de acumular muchas operaciones.

### ¿Qué son los Tipos de Asientos y los Auxiliares?

Son formas de clasificar los asientos para facilitar el análisis:

-   **[Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/):** clasifican cada asiento según su naturaleza (ventas, compras, ajustes, etc.)
-   **[Auxiliares](https://zetasoftware.info/ayuda/configuracion/contabilidad/auxiliares/):** agrupan tipos de asientos relacionados para generar informes consolidados

Esta estructura permite generar [Libros Auxiliares](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/) segmentados (libro de ventas, libro de compras, etc.).

### ¿Para qué sirven los Grupos de Cuentas?

Los [Grupos de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/grupos-de-cuentas/) permiten agrupar cuentas de diferentes capítulos bajo un criterio común. Por ejemplo, podés crear un grupo “IVA” que incluya tanto el IVA Compras (activo) como el IVA Ventas (pasivo). Esto facilita análisis específicos sin estar limitado por la estructura jerárquica del plan de cuentas.

## Operación diaria

### ¿Cuándo tengo que cargar asientos manualmente?

Depende de cómo uses ZetaSoftware:

-   **Si usás Gestión/Facturación con asientos automáticos:** solo para ajustes, correcciones o situaciones no cubiertas por los automatismos
-   **Si solo usás Contabilidad:** para todas las operaciones

Operaciones típicas que requieren asientos manuales: ajustes contables, provisiones, amortizaciones, reclasificaciones, y cualquier situación particular no contemplada en los automatismos.

### ¿Qué validaciones hace el sistema al registrar un asiento?

Al guardar un asiento, el sistema verifica:

-   Que el Debe sea igual al Haber (equilibrio de partida doble)
-   Que las cuentas utilizadas existan en el [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/)
-   Que las cuentas sean imputables (no sean cuentas padre)
-   Que la fecha esté dentro del [Ejercicio Contable](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/) activo
-   Que el centro de costos esté asignado si la cuenta lo requiere

Si alguna validación falla, el sistema no permite guardar el asiento hasta corregir el error.

### ¿Puedo modificar o eliminar asientos ya registrados?

Sí, mientras el [Ejercicio Contable](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/) esté abierto:

-   **Modificar:** podés editar cualquier campo del asiento
-   **Eliminar:** podés borrar asientos individuales desde la grilla, o usar [Borrar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/borrar-asientos/) para eliminaciones masivas

Una vez cerrado el ejercicio, los asientos quedan bloqueados. Para modificarlos, primero debés reabrir el ejercicio.

### ¿Cómo se relacionan los comprobantes de Gestión/Facturación con los asientos contables?

Cada comprobante (factura de venta, recibo de cobro, etc.) puede generar un asiento contable automáticamente. La configuración define qué cuentas usar para cada tipo de comprobante. Cuando generás asientos desde comprobantes, el sistema mantiene el vínculo: desde el asiento podés navegar al comprobante original, lo que facilita la trazabilidad y auditoría.

### ¿Qué es la Bandeja de Entrada?

La [Bandeja de Entrada](https://zetasoftware.info/ayuda/contabilidad/herramientas/bandeja-de-entrada/) es un área de revisión donde llegan los asientos generados automáticamente o importados. Permite validarlos y corregirlos antes de que afecten la contabilidad definitiva. Es una medida de control: nada entra a los libros sin tu aprobación explícita.

## Informes

### ¿Qué diferencia hay entre Balance, Mayor y Diario?

Son tres vistas de la misma información, cada una con un propósito diferente:

-   **[Balance](https://zetasoftware.info/ayuda/contabilidad/informes/balances/):** muestra los saldos finales de cada cuenta. Responde “¿cuánto tengo/debo?” Es la foto de la situación patrimonial a una fecha.
-   **[Mayor](https://zetasoftware.info/ayuda/contabilidad/informes/mayores/):** muestra todos los movimientos de una cuenta específica. Responde “¿cómo se formó este saldo?” Es el detalle que explica cada cifra del balance.
-   **[Diario](https://zetasoftware.info/ayuda/contabilidad/informes/diarios/):** muestra todos los asientos en orden cronológico. Responde “¿qué pasó y cuándo?” Es el registro histórico de todas las operaciones.

Balance → Mayor → Asiento es el flujo natural de navegación: partís del resultado, profundizás en el detalle, llegás al documento fuente.

### ¿Por qué mi Balance no cuadra?

Un balance que no cuadra (Activo ≠ Pasivo + Patrimonio) indica que hay asientos desbalanceados. Esto puede ocurrir por:

-   Asientos importados con errores
-   Problemas en la generación automática
-   Datos migrados incorrectamente

Ejecutá [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/) para detectar y corregir estos errores. El sistema identificará los asientos problemáticos.

### ¿Por qué un informe muestra datos diferentes a los que esperaba?

Las causas más comunes son:

-   **Ejercicio incorrecto:** verificá que el ejercicio activo sea el que querés consultar
-   **Filtros aplicados:** revisá que no haya filtros de fecha, moneda o centro de costos que excluyan datos
-   **Asientos en Bandeja:** los asientos pendientes en la [Bandeja de Entrada](https://zetasoftware.info/ayuda/contabilidad/herramientas/bandeja-de-entrada/) no aparecen en los informes hasta que se importan
-   **Diferencias de cambio:** si operás en múltiples monedas, verificá que se hayan generado los [asientos de diferencias de cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/)

### ¿Qué informes debo revisar mensualmente?

Para un control mensual básico:

1.  **[Balance](https://zetasoftware.info/ayuda/contabilidad/informes/balances/):** verificá que los saldos sean razonables y que cuadre
2.  **[Libros Auxiliares](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/):** conciliá el libro de ventas con los CFEs emitidos, y el de compras con los recibidos
3.  **[Mayores](https://zetasoftware.info/ayuda/contabilidad/informes/mayores/) de cuentas clave:** bancos (conciliar con extracto), IVA, cuentas a cobrar y pagar

Ejecutá [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/) antes de emitir informes definitivos.

### ¿Cómo exporto información para análisis externo?

Todos los informes pueden exportarse a PDF y Excel. Para los saldos del balance, además existe la [Exportación Personalizada a Excel](https://zetasoftware.info/ayuda/contabilidad/informes/balances/exportacion-de-saldos-del-balance-a-excel/) que permite volcar los saldos en plantillas predefinidas con tu propio formato.

## Automatismos y herramientas

### ¿Qué son los asientos automáticos y cuándo se usan?

Los [asientos automáticos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/) son asientos que el sistema genera a partir de otra información:

-   **[Desde Comprobantes](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-desde-los-comprobantes/):** contabiliza las operaciones de Gestión/Facturación
-   **[Desde CFEs Recibidos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/generar-asientos-desde-cfes-recibidos/):** contabiliza las facturas de proveedores
-   **[Diferencias de Cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/):** ajusta saldos por variación de cotizaciones
-   **Resultado** y **[Cierre/Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/)**: para el cierre de ejercicio

Los asientos generados pasan primero por la [Bandeja de Entrada](https://zetasoftware.info/ayuda/contabilidad/herramientas/bandeja-de-entrada/) para tu revisión antes de incorporarse a la contabilidad.

### ¿Qué hacen las herramientas y qué NO hacen?

Las [Herramientas](https://zetasoftware.info/ayuda/contabilidad/herramientas/) operan sobre información existente: la transforman, validan, corrigen o transfieren. No crean contabilidad nueva por sí mismas. Si la información de origen tiene errores (configuración incorrecta, datos mal cargados), los asientos generados también los tendrán. La calidad del resultado depende de la calidad de la configuración y los datos de entrada.

### ¿Cómo funciona el cierre de ejercicio?

El cierre es un proceso de pasos que se ejecutan en orden para asegurar: consistencia de asientos, valuación correcta por moneda, determinación del resultado y apertura del nuevo ejercicio.

1.  **Validar Asientos** (obligatorio, antes de cualquier otro paso)  
    Ruta: Contabilidad > Herramientas > [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/)
    
    -   Verifica consistencia y detecta errores (desbalanceados, cuentas inexistentes, fechas fuera del ejercicio)
    -   Corrige automáticamente ciertos datos cuando es posible (por ejemplo, usuario o local faltante)
    -   Elimina asientos sin líneas
    
    Los errores no corregibles deben resolverse manualmente antes de continuar.
    
2.  **Verificar Cotizaciones** (si trabajás con monedas extranjeras)  
    Ruta: Configuración > Empresa > Monedas y Cotizaciones  
    Ayuda: [Monedas y Cotizaciones](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/)
    
    -   Que cada mes tenga cotización registrada
    -   Que todas las monedas usadas estén actualizadas
    -   Que no existan períodos sin tipo de cambio definido
    
    Las cotizaciones pueden cargarse manualmente o importarse.
    
3.  **Generar Asientos de Diferencia de Cambio** (para cada moneda que corresponda)  
    Ruta: Contabilidad > Herramientas > Asientos Automáticos > [Asientos de Diferencia de Cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/)
    
    -   **Qué ajusta:** saldos contables según la variación del tipo de cambio.
    -   **Tipos:**
        -   **Tipo Moneda Nacional:** ajusta saldos de cuentas en moneda extranjera para presentación en moneda funcional.
        -   **Tipo Moneda Extranjera:** ajusta saldos en moneda nacional para emitir balances en la moneda extranjera seleccionada.
    -   **Parámetros:** Fecha (hasta dónde calcular), Cotización a aplicar, Concepto del asiento, y opción de recalcular eliminando diferencias anteriores.
    -   **Identificación:** los asientos generados quedan marcados porque el campo “Cotización” se graba con valor negativo (–1, –2, –3 según la moneda).
    -   **Requisitos:** cotizaciones cargadas, cuentas marcadas para aplicar diferencia de cambio en el Plan de Cuentas, y cuentas definidas para Diferencia de Cambio Ganada y Perdida.
    
    Este paso debe ejecutarse para todas las monedas existentes antes del balance definitivo.
    
4.  **Verificar el Balance**  
    Ruta: Contabilidad > Informes > [Balances](https://zetasoftware.info/ayuda/contabilidad/informes/balances/)
    
    -   Que el balance cierre en todas las monedas
    -   Que no existan cuentas de orden con saldo
    -   Que fechas y filtros sean correctos
    -   Que los ajustes por diferencia de cambio estén aplicados
    
    Si aparecen diferencias, revisá mayores y asientos generados.
    
5.  **Crear el Nuevo Ejercicio Contable** (antes de cierre/apertura)  
    Ruta: Contabilidad > Configuración > [Ejercicios Contables](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/)
    
    -   Ingresar fechas de inicio y fin, y guardar
    -   Seleccionarlo como **Ejercicio de Trabajo**
    
    Solo el ejercicio definido como Ejercicio de Trabajo permite registrar y modificar asientos.
    
6.  **Generar Asientos de Resultado** (para cada moneda y local que aplique)  
    Ruta: Contabilidad > Herramientas > Asientos Automáticos > [Asientos de Resultado](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-resultado/)
    
    -   Cancela cuentas de Pérdidas
    -   Cancela cuentas de Ganancias
    -   Traslada el saldo a la cuenta Resultado del Ejercicio
    
    Después de este paso, las cuentas de resultado deberían quedar en cero (para el rango correcto de fechas y con el asiento incluido).
    
7.  **Generar Asientos de Cierre y Apertura** (último paso)  
    Ruta: Contabilidad > Herramientas > Asientos Automáticos > [Asientos de Cierre y Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/)
    
    -   Genera el asiento de cierre del ejercicio actual
    -   Genera el asiento de apertura en el nuevo ejercicio
    -   Traslada saldos finales como saldos iniciales del ejercicio siguiente
    
    El asiento de apertura queda registrado como el primer asiento del nuevo ejercicio.
    

### ¿Qué hago si generé asientos automáticos duplicados?

Usá [Borrar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/borrar-asientos/) filtrando por origen (CFEs Recibidos, Comprobantes, etc.) y período. Primero listá sin eliminar para verificar qué se borrará, luego ejecutá la eliminación. Después, volvé a generar los asientos una sola vez.

### ¿Cómo genero el Anexo DGI 2/181?

La herramienta [Generar Anexo DGI 2/181](https://zetasoftware.info/ayuda/contabilidad/herramientas/generar-anexo-dgi/) crea el archivo requerido por la DGI. Requiere que hayas habilitado “Usa Literal Tributario” en [Parámetros Generales](https://zetasoftware.info/ayuda/configuracion/contabilidad/parametros-generales-de-contabilidad/) y que los asientos tengan los literales correctamente asignados. Consultá con tu contador para determinar los literales apropiados según la normativa vigente.

## Errores comunes y cómo resolverlos

### Registré asientos en el ejercicio equivocado, ¿cómo lo corrijo?

Si el ejercicio correcto está abierto, podés:

1.  [Exportar](https://zetasoftware.info/ayuda/contabilidad/herramientas/exportar-asientos/) los asientos del ejercicio incorrecto
2.  Cambiar al ejercicio correcto
3.  [Importar](https://zetasoftware.info/ayuda/contabilidad/herramientas/importar-asientos/) los asientos
4.  [Borrar](https://zetasoftware.info/ayuda/contabilidad/herramientas/borrar-asientos/) los asientos del ejercicio incorrecto

Si el ejercicio destino está cerrado, primero debés reabrirlo.

### El sistema no me deja guardar un asiento, ¿por qué?

Las causas más frecuentes:

-   **Desbalanceado:** el Debe no es igual al Haber
-   **Cuenta inexistente:** usaste un código que no está en el [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/)
-   **Cuenta no imputable:** la cuenta es un título (padre) que no admite movimientos
-   **Fecha fuera de ejercicio:** la fecha está fuera del rango del [Ejercicio Contable](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/) activo
-   **Centro de costos faltante:** la cuenta requiere centro de costos y no lo asignaste

El sistema indica el motivo del error. Corregí lo indicado y volvé a guardar.

### Generé asientos desde CFEs pero algunos quedaron sin contabilizar, ¿por qué?

Probablemente falte la configuración de [Números de RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/) para esos proveedores. Cuando ejecutás [Verificar](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/generar-asientos-desde-cfes-recibidos/), el sistema crea los RUT faltantes, pero debés definir qué cuentas usar para cada uno antes de generar los asientos.

### Mi balance muestra saldos en cuentas de resultado después del cierre, ¿es normal?

No. Después de ejecutar los [Asientos de Resultado](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-resultado/), las cuentas de ganancias y pérdidas deberían quedar en cero. Si muestran saldo, verificá:

-   Que el asiento de resultado se haya generado correctamente
-   Que estés incluyendo ese asiento en el rango de fechas del balance
-   Que no haya asientos posteriores al de resultado que afecten esas cuentas

### ¿Cómo evito problemas al cerrar el ejercicio?

Seguí estas recomendaciones:

-   Ejecutá [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/) y corregí todos los errores antes de comenzar el cierre
-   Verificá que las cotizaciones de cierre estén cargadas si operás en múltiples monedas
-   Creá el nuevo ejercicio antes de generar cierre y apertura
-   Ejecutá el cierre para cada moneda si trabajás con varias
-   Verificá el balance después de cada paso para confirmar que todo está correcto

## Buenas prácticas

### ¿Cómo organizo mi trabajo mensual?

Un flujo de trabajo recomendado:

1.  **Generación:** ejecutá los asientos automáticos desde comprobantes y CFEs
2.  **Revisión:** revisá y aprobá los asientos en la [Bandeja de Entrada](https://zetasoftware.info/ayuda/contabilidad/herramientas/bandeja-de-entrada/)
3.  **Ajustes:** registrá asientos manuales que correspondan (ajustes, provisiones)
4.  **Validación:** ejecutá [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/)
5.  **Control:** revisá el [Balance](https://zetasoftware.info/ayuda/contabilidad/informes/balances/) y conciliá cuentas clave

### ¿Qué respaldo debo mantener?

Considerá:

-   [Exportar](https://zetasoftware.info/ayuda/contabilidad/herramientas/exportar-asientos/) los asientos periódicamente
-   Guardar PDF de los balances e informes principales de cada cierre mensual
-   Antes de cambios masivos (sustitución de cuentas, borrado), exportar los datos que se modificarán

### ¿Cuándo debo consultar con un contador?

ZetaSoftware es una herramienta; las decisiones contables requieren criterio profesional. Consultá especialmente para:

-   Diseño del [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/)
-   Tratamiento de operaciones complejas
-   Asignación de literales tributarios para el [Anexo DGI](https://zetasoftware.info/ayuda/contabilidad/herramientas/generar-anexo-dgi/)
-   Proceso de cierre de ejercicio
-   Cualquier duda sobre el tratamiento correcto de una operación

[Contabilidad - PreviousConfiguración y emisión de e-Resguardos](https://zetasoftware.info/ayuda/preguntas-frecuentes/facturacion-profesional/configuracion-y-emision-de-e-resguardos/)[Next - ContabilidadProceso de Cierre de Ejercicio Contable](https://zetasoftware.info/ayuda/preguntas-frecuentes/contabilidad/proceso-de-cierre-de-ejercicio-contable/)
