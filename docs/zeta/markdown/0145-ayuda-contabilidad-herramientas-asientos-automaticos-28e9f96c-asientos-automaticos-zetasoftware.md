# Asientos Automáticos - ZetaSoftware

# Asientos Automáticos

Los Asientos Automáticos se generan a partir de otras fuentes de información: comprobantes de Gestión/Facturación, CFEs recibidos de proveedores, o cálculos del sistema como diferencias de cambio y cierres de ejercicio. Eliminan la carga de registrar manualmente operaciones repetitivas y garantizan consistencia entre los módulos.

## Tipos de asientos automáticos

### [Generar Asientos desde CFEs Recibidos](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/generar-asientos-desde-cfes-recibidos/)

Contabiliza automáticamente las facturas electrónicas que recibís de tus proveedores. El sistema lee los CFEs, identifica al proveedor por su RUT, y aplica la configuración de cuentas definida en [Números de RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/).

### [Asientos desde los Comprobantes](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-desde-los-comprobantes/)

Genera asientos desde los comprobantes registrados en los módulos de Gestión PyME o Facturación Profesional: facturas de venta, recibos de cobro, facturas de compra, órdenes de pago, y otros. Cada tipo de comprobante tiene su configuración de cuentas contables.

### [Asientos de Diferencias de Cambio](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-diferencias-de-cambio/)

Calcula y registra las diferencias de cambio generadas por la variación en las cotizaciones de moneda extranjera. Ajusta las cuentas en moneda extranjera para reflejar su valor actual, generando ganancias o pérdidas por tipo de cambio.

### [Asientos de Resultado](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-resultado/)

Al cerrar un período, este asiento traslada el resultado del ejercicio (ganancia o pérdida) a la cuenta de patrimonio correspondiente. Es el paso previo al cierre definitivo del ejercicio.

### [Asientos de Cierre y Apertura](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-de-cierre-y-apertura/)

Genera los asientos necesarios para cerrar un ejercicio fiscal y abrir el siguiente. El cierre lleva a cero las cuentas patrimoniales; la apertura las restablece en el nuevo ejercicio con los saldos finales del anterior.

## Flujo de trabajo

Los asientos automáticos siguen un proceso de dos etapas:

1.  **Generación:** El sistema crea los asientos según la configuración establecida
2.  **Revisión:** Los asientos pasan a la [Bandeja de Entrada](https://zetasoftware.info/ayuda/contabilidad/herramientas/bandeja-de-entrada/) donde podés revisarlos, ajustarlos si es necesario, y aprobarlos para que se incorporen definitivamente

Este proceso en dos etapas permite verificar que la generación automática sea correcta antes de afectar la contabilidad.

## Requisitos previos

Para que los asientos automáticos funcionen correctamente, debés configurar:

-   [Plan de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/): Las cuentas que usarán los asientos deben existir
-   [Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/): Clasifican los asientos generados
-   [Números de RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/): Para asientos desde CFEs, define qué cuentas usar para cada proveedor
-   Configuración de cuentas por tipo de comprobante: Para asientos desde comprobantes de Gestión/Facturación

## Ventajas de la automatización

-   **Consistencia:** Las mismas operaciones siempre generan los mismos asientos
-   **Ahorro de tiempo:** No hay que registrar manualmente cada factura o recibo
-   **Trazabilidad:** Cada asiento automático mantiene vínculo con su documento origen
-   **Reducción de errores:** Elimina errores de tipeo o de aplicación incorrecta de cuentas

## Relación con otras funcionalidades

-   [Bandeja de Entrada](https://zetasoftware.info/ayuda/contabilidad/herramientas/bandeja-de-entrada/): Donde se revisan los asientos antes de incorporarlos
-   [Validar Asientos](https://zetasoftware.info/ayuda/contabilidad/herramientas/validar-asientos/): Verifica que los asientos generados sean consistentes
-   [Asientos](https://zetasoftware.info/ayuda/contabilidad/asientos/): Donde se visualizan los asientos ya incorporados

[Asientos Automáticos - PreviousHerramientas](https://zetasoftware.info/ayuda/contabilidad/herramientas/)[Next - Asientos AutomáticosAsientos desde los Comprobantes](https://zetasoftware.info/ayuda/contabilidad/herramientas/asientos-automaticos/asientos-desde-los-comprobantes/)
