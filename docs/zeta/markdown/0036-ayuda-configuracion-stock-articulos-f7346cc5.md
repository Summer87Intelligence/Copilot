# Artículos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/stock/articulos/
- URL final: https://zetasoftware.info/ayuda/configuracion/stock/articulos/

---

## Contenido

# Artículos

Los **Artículos** en ZetaSoftware son más que simplemente productos y servicios; son la esencia de tu oferta comercial y el núcleo de diversas operaciones vitales dentro de tu empresa. Ya sea en facturación, compras o gestión de stock, estos elementos juegan un papel crucial y se identifican por un código único para facilitar su seguimiento y gestión eficiente.

### Usos de los Artículos

-   **Facturación:** Al incorporar un artículo a una factura o cualquier otro comprobante, la descripción, el precio y la tasa de IVA correspondiente se generan automáticamente, mejorando la eficiencia y reduciendo la posibilidad de errores.
-   **Gestión de stock:** Los Artículos brindan una visión detallada y precisa de tu inventario. Mediante seguimiento de movimientos de stock, se facilita el control de las existencias y la ubicación de cada artículo.
-   **Análisis de ventas y compras:** Los Artículos son esenciales para llevar un seguimiento detallado de las ventas y compras, lo que permite identificar tendencias, planificar adquisiciones y desarrollar estrategias comerciales efectivas.

### La necesidad de una correcta configuración de los Artículos

Los Artículos son una parte esencial de la gestión de tu empresa. Su correcta configuración y actualización permite optimizar procesos como la facturación, las compras y la gestión de stock, a la vez que facilita el análisis de ventas y compras, ayudándote a tomar decisiones acertadas y a cumplir con las obligaciones fiscales y legales.

Una configuración adecuada de los Artículos en ZetaSoftware es crucial por varias razones:

-   **Precisión de la información:** Ingresar todos los datos relevantes de un artículo (descripción, precio, tasa de IVA, familia, marca, etc.) garantiza la exactitud y la actualización de la información en las facturas y otros comprobantes.
-   **Gestión de stock eficiente:** Mantener un registro detallado de tus Artículos ayuda a optimizar la gestión de inventario, evitando quiebres de stock y mejorando la eficiencia en la reposición de productos.
-   **Toma de decisiones informada:** Un correcto registro de los Artículos proporciona información valiosa que facilita la toma de decisiones en áreas como compras, ventas y promociones.
-   **Cumplimiento fiscal y legal:** Configurar correctamente las tasas de IVA y otros datos fiscales de los Artículos te permite cumplir con las regulaciones fiscales y legales pertinentes a tu empresa.

### Datos a configurar

Cada artículo en ZetaSoftware cuenta con un conjunto de campos que permiten definir con precisión sus características y comportamiento en el sistema.

#### Identificación

-   **Código:** Campo alfanumérico de hasta 20 caracteres que proporciona una identificación única a cada artículo. Por ejemplo, ‘PROD01’ o el código que su proveedor le asignó. También se puede optar por introducir el código de barras en este campo para facilitar el proceso de facturación estándar.
-   **Nombre:** Descripción larga o nombre del artículo. Sirve para detallar el producto o servicio de manera más exhaustiva.
-   **Abreviación:** Nombre corto o versión abreviada del nombre del artículo, útil para referencias rápidas y búsquedas.
-   **Origen:** Código de origen del artículo, generalmente proporcionado por el proveedor.
-   **Barras:** Código de barras del artículo, permitiendo su fácil lectura y seguimiento a través de sistemas de escaneo en la opción Punto de Venta.

#### Agrupación

-   **Categoría:** Código de categoría del artículo, que se define en otra tabla del sistema. Por ejemplo, “Importados”, “Nacionales”, etc.
-   **Familia:** Código para agrupar y organizar los artículos en base a un código único con estructura jerárquica similar al Plan de Cuentas. Por ejemplo, el código ‘1’ podría corresponder a ‘Electrodomésticos’, ‘101’ a ‘Audio’ y ‘10201’ a ‘Con freezer’.
-   **Marca:** Código de la marca del artículo. Útil para empresas que venden productos de varias marcas.
-   **Proveedor:** Código del proveedor principal del artículo.
-   **Concepto:** Código del concepto definido previamente para el artículo. Permite incluir los artículos vendidos y comprados en el reporte de Totales por Concepto.

#### Contabilidad

-   **IVA:** Tasa de IVA que se aplica al artículo. Fundamental para calcular correctamente los impuestos en las facturas.
-   **Percepción:** Código de percepción, necesario cuando el artículo representa una percepción y no mercadería en sí. Se utiliza para informar datos al módulo de CFEs.
-   **Compras/Ventas/Producción:** Códigos contables que representan al artículo en el Plan de Cuentas para generar asientos automáticos. Si se utilizan cuentas genéricas como “Mercadería de reventa”, no es necesario especificarlas en cada artículo.

#### Stock e Inventarios

-   **Contabilizar stock de este artículo:** Indica si se desea llevar un registro del stock actual del artículo y gestionar su inventario.
-   **Unidad Principal/Secundaria:** Unidades de medida del artículo. Por ejemplo, si se vende queso, la unidad principal podría ser “horma” y la secundaria “kilo”.
-   **Cantidad x Unidad:** Cantidad de unidades que contiene cada empaque del artículo. Se usa al facturar artículos con dos unidades como factor de multiplicación.
-   **Trabaja con doble cantidad:** Se marca cuando se necesita registrar dos cantidades en las operaciones de venta y compra del artículo.
-   **Trabaja con Lotes y Vencimientos:** Al activar esta opción, cada transacción requerirá indicar el código de lote y, si es relevante, la fecha de vencimiento.
-   **Incluir en Listas de Precios:** Al marcar esta casilla, el artículo se incluirá en el reporte de lista de precios.

#### Precios y Costo

-   **Costo:** Precio de costo del artículo. Puede actualizarse automáticamente mediante las herramientas de actualizar costos.
-   **Moneda:** Moneda en la que se expresa el precio de costo.
-   **% Utilidad:** Porcentaje de utilidad a aplicar al momento de calcular los Precios de Venta.
-   **Fecha:** Fecha de la última modificación del precio de costo.
-   **Precios Base:** Precios Base del artículo que serán usados por los Precios de Venta para calcular el precio al cliente.

#### Otros datos

-   **Campos Adicionales:** Datos informativos adicionales del artículo no contemplados en el formulario.
-   **Similares:** Artículos similares al actual, útil cuando no hay stock del artículo que se consulta.
-   **Stock Mínimo:** Stock mínimo deseado por local, útil para el reporte Stock Mínimo o alertas al facturar.
-   **Componentes:** Artículos que componen el artículo actual, útil para comprobantes de Armados y Desarmados.
-   **Textos:** Texto predefinido que se muestra al facturar el artículo. Estos datos pueden mostrarse en el CFE emitido.
-   **Notas:** Notas adicionales sobre el artículo.
-   **Alta o Modificación:** Fecha de la última interacción del usuario con el artículo. Se actualiza cada vez que se presiona ‘Confirmar’.

#### Foto

-   **URL para uso de la API:** Dirección desde donde se puede tomar la imagen del artículo. Pensado para integradores de software y sitios de e-commerce.
-   **Archivo para Lista de Precios y Consultas:** Archivo con la imagen del artículo que se muestra en la Lista de Precios en formato catálogo o al consultar los datos del artículo.

### Te puede interesar

-   -   [Video Configurar Artículos](https://vimeo.com/704663224)
    -   [Video Configurar Precios de Venta](https://vimeo.com/704663278)
    -   [Video Registrar Items (números de serie)](https://vimeo.com/729764707)
    -   [Video Configurar Lotes y Vencimientos](https://vimeo.com/704663255)
    -   [Exportar e Importar Artículos con Excel](/ayuda/configuracion/stock/exportar-e-importar-articulos-con-excel/)

[Artículos - PreviousStock](https://zetasoftware.info/ayuda/configuracion/stock/)[Next - ArtículosExportar e Importar Artículos con Excel](https://zetasoftware.info/ayuda/configuracion/stock/articulos/exportar-e-importar-articulos-con-excel/)

---

## Links relacionados

- [Artículos - PreviousStock](https://zetasoftware.info/ayuda/configuracion/stock/)
- [Next - ArtículosExportar e Importar Artículos con Excel](https://zetasoftware.info/ayuda/configuracion/stock/articulos/exportar-e-importar-articulos-con-excel/)
- [Exportar e Importar Artículos con Excel](https://zetasoftware.info/ayuda/configuracion/stock/exportar-e-importar-articulos-con-excel/)

