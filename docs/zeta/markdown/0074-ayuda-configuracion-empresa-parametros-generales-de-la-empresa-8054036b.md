# Parámetros Generales - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/empresa/parametros-generales-de-la-empresa/
- URL final: https://zetasoftware.info/ayuda/configuracion/empresa/parametros-generales-de-la-empresa/

---

## Contenido

# Parámetros Generales

ZetaSoftware proporciona una configuración de parámetros generales que permite adaptar el software a las particularidades de cada empresa. Esta configuración se divide en tres secciones: Información General, Oportunidades y Contratos, y POS.

Los Parámetros Generales de la Empresa brindan una configuración detallada y flexible, permitiendo a las empresas personalizar ZetaSoftware de acuerdo con sus necesidades y operaciones particulares. Esta configuración puede ser especialmente útil para manejar de manera eficiente aspectos como la cotización de monedas extranjeras, la administración de lotes de artículos, el manejo de notas en comprobantes, y la gestión de Oportunidades de Venta y Contratos.

## Información General

-   **País**: Este campo permite definir el país en el que se encuentra ubicada la empresa.
-   **Empresa Cotizaciones**: Con esta configuración, puedes determinar si el sistema obtiene las cotizaciones de monedas extranjeras de la misma empresa o de otra. Esta opción puede ser particularmente útil en un conglomerado de empresas o en un estudio contable con varias empresas clientes, ya que al ingresar las cotizaciones en una sola empresa, el resto de las empresas pueden obtener automáticamente estas cotizaciones, evitando la necesidad de ingresarlas de forma individual.
-   **Trabaja con Centros de Costo y Referencias**: Activando esta opción, el sistema solicitará, aunque no de manera obligatoria, códigos de centros de costos y referencias en los asientos y cabezales de comprobantes.
-   **Trabaja con Lotes de Artículo**s: Si se activa esta opción, se le indica al sistema que ciertos artículos pueden configurarse para ser administrados en lotes con fechas de vencimiento. Estos datos serán solicitados cada vez que se facturen estos artículos.
-   **Incluir Cheques en Cartera en Tope de Crédito de Clientes**: Al marcar esta opción, el sistema incluirá los cheques en cartera al calcular el saldo de los clientes para comparar con el límite de crédito establecido.
-   **Trabaja con más de 2 decimales en cantidad y/o precio**: Esta opción permite que ZetaSoftware muestre los montos las cantidades de las facturas con hasta cinco decimales.
-   **Ventas con IVA diferente**: Si se activa esta opción, cada línea de venta solicitará el código de IVA del artículo, permitiendo modificar el sugerido por el mismo. Este parámetro es útil en aquellos casos donde la tasa de IVA de venta de un artículo dependa de la naturaleza de la venta.
-   **Mensaje General**: Este es un texto que aparecerá en la impresión de los comprobantes si se establece en la configuración de la Adenda que aparezca.
-   **Renglones en Notas de Comprobantes**: Este campo permite seleccionar desde una lista que se cargará con los [Campos Adicionales](https://zetasoftware.info/ayuda/configuracion/empresa/campos-adicionales/), proporcionando una guía para el usuario cuando se redacten las Notas de los Comprobantes.

## Oportunidades y Contratos

-   **Numerador Contrato**: Este campo permite establecer el Numerador que se utilizará para asignar automáticamente una serie y número a cada contrato.
-   **Trabado Oportunidades**: Esta opción previene la modificación o eliminación de las Oportunidades de Venta con fecha anterior a la especificada.
-   **Título PDF**: Este campo permite personalizar el título que se muestra al imprimir la propuesta de una Oportunidad de Venta en formato PDF.
-   **Condiciones Comerciales**: El texto ingresado en este campo se imprimirá con las propuestas de las Oportunidades de Venta.
-   **IVA en precios**: Esta opción permite indicar si los precios de los artículos en cada Oportunidad incluyen IVA, no lo incluyen, o están exentos.
-   **Condición de Pago**: Esta opción sugerirá la condición de pago especificada en cada nueva Oportunidad de Venta.
-   **Sugerir usuario como propietario**: Si se marca esta opción, el sistema sugerirá al usuario logueado como propietario de cada nueva Oportunidad de Venta.

## Procesadores de Tarjetas

En la sección de “Procesadores de Tarjetas” deben ingresar los datos de conexión del procesador que estén utilizando. Algunos procesadores solo requieren un “Código”, mientras que otros necesitan tanto un “Código” como un “Hash”. Por lo tanto, el campo “Hash” puede quedar vacío si el procesador no proporciona esa información.

El campo **Tipo Devolución de Impuesto** se solicita para aquellos procesadores que devuelven esta información. Las empresas **GetNet** y **NewAgeData** no requieren esta información, ya que ellas devuelven el Tipo de Devolución de Impuesto adjudicado al POS que realiza la transacción. Para otros procesadores, será necesario especificarlo.

Es posible indicar el Tipo de Devolución de Impuesto a nivel de:

-   **Parámetros Generales**: Se establece un Tipo de Devolución de Impuesto que se aplicará a todas las transacciones realizadas con ese procesador.
-   **Terminal POS**: Se asigna un Tipo de Devolución de Impuesto específico para una Terminal POS particular.
-   **Pantalla de Cobro**: Se selecciona un Tipo de Devolución de Impuesto para una transacción específica en el momento del cobro.

* * *

[Parámetros Generales - PreviousParámetros del Local](https://zetasoftware.info/ayuda/configuracion/empresa/parametros-del-local/)[Next - Parámetros GeneralesReferencias](https://zetasoftware.info/ayuda/configuracion/empresa/referencias/)

---

## Links relacionados

- [Campos Adicionales](https://zetasoftware.info/ayuda/configuracion/empresa/campos-adicionales/)
- [Parámetros Generales - PreviousParámetros del Local](https://zetasoftware.info/ayuda/configuracion/empresa/parametros-del-local/)
- [Next - Parámetros GeneralesReferencias](https://zetasoftware.info/ayuda/configuracion/empresa/referencias/)

