# Monedas y Cotizaciones - ZetaSoftware

# Monedas y Cotizaciones

En ZetaSoftware, tienes la posibilidad de crear todas las monedas que requieras para la operativa de tu empresa. La plataforma siempre designa la moneda con código 1 como la moneda nacional, por ejemplo, los Pesos Uruguayos (UYU). Todas las monedas con códigos superiores a 1 se tratarán como monedas extranjeras, lo que permitirá ingresar las cotizaciones diarias, con respecto a la moneda 1, para cada una de ellas.

## Descripción de los Campos

-   **Código**: Campo numérico de hasta 2 dígitos para identificar la moneda. La moneda con código 1 siempre será la moneda nacional.
-   **Nombre**: Para introducir el nombre de la moneda, por ejemplo, “Dólar Estadounidense” o “Euro”.
-   **Símbolo**: Aquí puedes ingresar el símbolo que prefieras para la moneda. Se sugiere utilizar el código ISO, por ejemplo, “USD” para el Dólar Estadounidense o “EUR” para el Euro.
-   **ISO**: Campo para el código ISO de la moneda, como “UYU” para los Pesos Uruguayos, “USD” para el Dólar Estadounidense, “EUR” para el Euro, entre otros.
-   **Cotización Máxima/Mínima**: Definen un rango de valores para el tipo de cambio. Útil para asignar un tipo de cambio especial en el comprobante que difiere del configurado para la moneda, manteniendo un control sobre el rango de cambio aceptado.
-   **Redondeo**: Se utiliza para configurar el redondeo del importe total de las facturas y devoluciones de venta en esta moneda.
-   **Cuenta Pérdidas/Ganancias**: Se utiliza para designar la cuenta que se usará para la generación automática de asientos por diferencias de cambio.
-   **Porcentaje**: Se usa en el reporte de Interés Mensual. Permite calcular los atrasos de los clientes, aplicando un porcentaje al monto adeudado.

## Manejo de Cotizaciones

Para acceder a las cotizaciones de una moneda, debes navegar a la grilla que muestra todas las monedas. Las monedas extranjeras (con código mayor a 1) tendrán en cada fila de la grilla, en el menú, la opción “Cotizaciones”. Al seleccionar esta opción, se abrirá una pantalla que solicitará el mes y el año de las cotizaciones y la acción a ejecutar. La acción Editar mostrará una grilla con cada día del mes seleccionado, lo que te permitirá ingresar la cotización diaria de la moneda.

Además, para facilitar esta tarea, ZetaSoftware permite obtener las cotizaciones de manera automática desde el Banco Central del Uruguay. Esta funcionalidad ahorra tiempo y minimiza el riesgo de errores en el ingreso de las cotizaciones.

También se podrán importar las cotizaciones desde un archivo Excel. Para importar cotizaciones de monedas extranjeras desde Excel en ZetaSoftware, el archivo debe tener dos columnas con títulos en la primera fila: “Fechas” y “Cotización”. La primera columna debe estar en formato texto y contener las fechas en el formato DD/MM/AAAA, y la segunda columna debe ser numérica con las cotizaciones correspondientes a cada fecha. Los datos deben ingresarse a partir de la fila 2 y no necesitan estar en orden cronológico ni pertenecer al mismo mes o año, permitiendo ingresar cotizaciones de un año completo. La lectura de datos se detiene cuando se encuentra una celda vacía en la columna de fechas.

* * *

#### Te puede interesar

-   [Video Monedas y Cotizaciones](https://vimeo.com/596500357)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Monedas y Cotizaciones - PreviousCajas](https://zetasoftware.info/ayuda/configuracion/empresa/cajas/)[Next - Monedas y CotizacionesPaíses y Departamentos](https://zetasoftware.info/ayuda/configuracion/empresa/paises/)
