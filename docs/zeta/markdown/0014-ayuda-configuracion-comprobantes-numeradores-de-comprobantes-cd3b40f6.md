# Numeradores de Comprobantes - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/comprobantes/numeradores-de-comprobantes/
- URL final: https://zetasoftware.info/ayuda/configuracion/comprobantes/numeradores-de-comprobantes/

---

## Contenido

# Numeradores de Comprobantes

Los **Numeradores de Comprobantes** son fundamentales para mantener un registro ordenado y sistemático de los comprobantes que se emiten. Su propósito es asignar de manera automática una Serie y un Número correlativo a cada comprobante que no sea un Comprobante Fiscal Electrónico (CFE).

Los Numeradores de Comprobantes se asignan a aquellos comprobantes que no son CFEs, brindando una lógica específica para determinar el número que se asignará al documento una vez que se registre o emita.

Los CFEs cuentan con su propio sistema de numeración a través de los **Códigos de Autorización de Emisión (CAE)**.

Si los comprobantes tienen Formato de impresión asociado, el número se asignará al momento de emitir el comprobante. Para aquellos comprobantes sin formato de impresión, el número se asigna al grabarlo.

### Campos que configuran un Numerador de Comprobante

-   **Código:** Identificador alfanumérico de hasta tres caracteres para el numerador.
-   **Nombre:** Descripción detallada del numerador, como por ejemplo “Recibos de cobranza”.
-   **Serie:** La serie a asignar al comprobante que se registre o emita, puede ser cualquier identificador alfanumérico, como por ejemplo, la letra “A”.
-   **Último Número:** Es el número asignado al último comprobante emitido. Cada vez que se registre o emita un nuevo comprobante, este número se incrementará en 1 de forma automática.
-   **Local:** Este campo es opcional y sirve para especificar si el numerador se puede asignar a los comprobantes de un local específico, o a todos los locales.

### Te puede interesar

-   [Configurar Comprobantes](/ayuda/configuracion/comprobantes/comprobantes/)
-   [Numeradores de Impresión](/ayuda/configuracion/comprobantes/numeradores-de-impresion/)

[Numeradores de Comprobantes - PreviousFormatos de Impresión](https://zetasoftware.info/ayuda/configuracion/comprobantes/formatos-de-impresion/)[Next - Numeradores de ComprobantesDatos Adicionales en Facturación](https://zetasoftware.info/ayuda/configuracion/comprobantes/parametros-generales-de-facturacion/)

---

## Links relacionados

- [Configurar Comprobantes](https://zetasoftware.info/ayuda/configuracion/comprobantes/comprobantes/)
- [Numeradores de Comprobantes - PreviousFormatos de Impresión](https://zetasoftware.info/ayuda/configuracion/comprobantes/formatos-de-impresion/)
- [Numeradores de Impresión](https://zetasoftware.info/ayuda/configuracion/comprobantes/numeradores-de-impresion/)
- [Next - Numeradores de ComprobantesDatos Adicionales en Facturación](https://zetasoftware.info/ayuda/configuracion/comprobantes/parametros-generales-de-facturacion/)

