# Exportar e Importar Artículos con Excel - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/stock/articulos/exportar-e-importar-articulos-con-excel/
- URL final: https://zetasoftware.info/ayuda/configuracion/stock/articulos/exportar-e-importar-articulos-con-excel/

---

## Contenido

# Exportar e Importar Artículos con Excel

La herramienta de Exportar e Importar Artículos es una funcionalidad vital que te permite una gestión eficiente de los datos de los artículos de tu empresa. Te ofrece la posibilidad de exportar un archivo Excel con los datos de tus artículos en un formato preestablecido, lo que te facilita la edición masiva de dichos datos de manera más ágil y flexible. Esta herramienta puede ahorrarte tiempo significativo al permitirte realizar cambios rápidos y eficientes en tus datos de artículos.

## Consideraciones previas

-   **Formato del archivo**: Asegúrate de guardar el archivo en el formato correcto. El [formato de la planilla](https://drive.google.com/drive/folders/1W5AD23IX5aw84kDkajzudN-IfDuv2wwQ?usp=sharing) debe ser XLS o XLSX. Si abres el archivo con otro programa, asegúrate de guardarlo en uno de estos formatos antes de la importación.
-   **Formato de los datos**: Cada dato ingresado debe respetar el formato indicado. Si el formato requerido es texto pero el dato a ingresar es un número, debes preceder el número con una comilla simple (‘), de esta manera Excel reconocerá el número como texto.
-   **Estructura de la planilla**: La planilla no debe ser modificada en su estructura. No debes agregar, eliminar, ocultar o modificar el orden de las columnas ni utilizar filtros. Si haces cambios estructurales en la planilla, la importación generará un error.
-   **Actualización y creación de artículos**: La planilla de importación se puede utilizar tanto para agregar nuevos artículos como para actualizar los existentes. El sistema analiza la planilla línea por línea por código de artículo. Si el código ya existe en los registros de la empresa, el sistema actualizará los datos del artículo. Si el código no existe, el sistema creará un nuevo artículo. Es importante tener en cuenta que el proceso de importación no eliminará artículos, aunque no estén incluidos en la planilla.

## ¿Cómo obtener el archivo de carga?

-   **[Descargar la planilla de ejemplo](https://drive.google.com/drive/folders/1W5AD23IX5aw84kDkajzudN-IfDuv2wwQ?usp=sharing)**: Si estás empezando de cero, puedes [descargar la planilla de ejemplo](https://drive.google.com/drive/folders/1W5AD23IX5aw84kDkajzudN-IfDuv2wwQ?usp=sharing). La planilla de ejemplo tiene varias hojas (Artículos, Precios, Campos, Stock Mínimo), por lo que debes asegurarte de eliminar todas las hojas excepto la de Artículos antes de comenzar a trabajar con ella.
-   **Exportar artículos existentes**: Si ya tienes artículos en el sistema, puedes optar por exportarlos utilizando la opción de **Exportar**. Esto te proporcionará un archivo Excel ya rellenado con tus datos actuales y te permitirá ver claramente qué datos y formatos corresponden a cada celda. Una vez que hayas hecho las modificaciones necesarias en este archivo, podrás importarlo de nuevo al sistema.

**Familiarizarse con los formatos de celda**: Los títulos de cada columna tienen un comentario que detalla el formato del dato a ingresar. Para ver estos comentarios, simplemente coloca el ratón sobre cada encabezado de columna.

## Importar Artículos

1.  Ve a Configuración, selecciona [Artículos](https://zetasoftware.info/ayuda/configuracion/stock/articulos/) y haz clic en **Importar**.
2.  Selecciona el archivo XLS o XLSX que generaste.
3.  En Importar, selecciona Artículos.
4.  Haz clic en Seleccionar archivo para indicar la planilla a utilizar.
5.  Finalmente, haz clic en Confirmar.

Si el proceso de importación genera un error, el sistema te proporcionará un mensaje con el motivo del error. Asegúrate de prestar atención a este mensaje para resolver el problema. Los errores más comunes pueden ser debido a problemas con el formato de los datos, datos que no existen en la empresa, campos obligatorios que no se han llenado, o problemas con el formato de la planilla.

## Importación de datos adicionales

Además de los datos básicos de los artículos, el sistema ZetaSoftware también te permite importar información adicional desde un archivo de Excel. Esta información puede incluir Precios, Campos Adicionales y Stock Mínimo. Aquí te explicamos cómo hacerlo.

### 1\. Precios

Esta hoja te permite importar los precios de los artículos. Asegúrate de que los datos estén organizados en las siguientes columnas:

-   Columna 1: Código de Artículo (Formato Texto)
-   Columna 2: Código de Precio Base (Formato Texto)
-   Columna 3: Código de Moneda (Formato Numérico)
-   Columna 4: Precio (Formato Numérico)
-   Columna 5: Precio con IVA incluido (S/N) (Formato Texto, S para sí, N para no)

### 2\. Campos Adicionales

Los campos adicionales son una herramienta útil para personalizar los datos de tus artículos de acuerdo a las necesidades específicas de tu negocio. Estos pueden incluir detalles como el fabricante, el proveedor, el peso del artículo, etc. Asegúrate de que los datos estén organizados en las siguientes columnas:

-   Columna 1: Código de Artículo (Formato Texto)
-   Columna 2: Código de Campo Adicional (Formato Texto)
-   Columna 3: Valor (Formato Texto)

### 3\. Stock Mínimo

Aquí puedes importar los niveles de stock mínimo para cada artículo. Esto te permite tener un control más preciso de tu inventario y asegurarte de que siempre tengas stock suficiente para cumplir con las demandas de tus clientes. Asegúrate de que los datos estén organizados en las siguientes columnas:

-   Columna 1: Código de Artículo (Formato Texto)
-   Columna 2: Código de Local (Formato Numérico)
-   Columna 3: Stock Mínimo (Formato Numérico)

Como con la hoja de Artículos, debes asegurarte de que el formato de los datos en estas hojas sea el correcto y de que la estructura de las hojas no se modifique.

Recuerda que la importación de estos datos adicionales puede ser una herramienta muy valiosa para la gestión de tu negocio. Te permite mantener tus datos actualizados y precisos, y facilita la gestión de tu inventario y la fijación de precios. Con la atención adecuada a los detalles y el seguimiento de las instrucciones, puedes utilizar esta herramienta para mejorar significativamente la eficiencia y la precisión de tus operaciones.

* * *

[Exportar e Importar Artículos con Excel - PreviousArtículos](https://zetasoftware.info/ayuda/configuracion/stock/articulos/)[Next - Exportar e Importar Artículos con ExcelArtículos en Módulo Facturación Profesional](https://zetasoftware.info/ayuda/configuracion/stock/articulos/articulos-en-modulo-facturacion-profesional/)

---

## Links relacionados

- [Artículos](https://zetasoftware.info/ayuda/configuracion/stock/articulos/)
- [Next - Exportar e Importar Artículos con ExcelArtículos en Módulo Facturación Profesional](https://zetasoftware.info/ayuda/configuracion/stock/articulos/articulos-en-modulo-facturacion-profesional/)

