# Depósitos de Stock - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/stock/depositos-de-stock/
- URL final: https://zetasoftware.info/ayuda/configuracion/stock/depositos-de-stock/

---

## Contenido

# Depósitos de Stock

Los **Depósitos de Stock** representan espacios designados, físicos o virtuales, en los que se almacena la mercadería de la empresa. Esta característica es vital para mantener un control exhaustivo sobre el inventario y para facilitar la gestión de las transacciones de mercancías.

### Definición General

Cada depósito se identifica a través de un conjunto de datos:

-   **Código:** Número único para su identificación.
-   **Nombre:** Nombre descriptivo del depósito.
-   **Abreviatura:** Versión corta del nombre.
-   **Local:** Asociación a un local comercial.
-   **Contabiliza stock:** Indica si el sistema lo considerará al calcular el inventario y el stock actual de la empresa.

Por ejemplo, podríamos tener un depósito con el código 1 llamado ‘Depósito Central’, abreviado como ‘DC’, y asociado al local ‘Casa Central’.

### Uso en Comprobantes

Los depósitos tienen un papel fundamental en la gestión de los comprobantes de la empresa. Cada comprobante requiere la indicación de hasta dos depósitos:

-   **Origen:** Señala de dónde sale la mercadería.
-   **Destino:** Identifica hacia dónde se dirige la misma.

Por ejemplo, si estamos transfiriendo mercadería desde el ‘Depósito Central’ hasta un ‘Depósito Secundario’, el ‘Depósito Central’ sería nuestro depósito de origen y el ‘Depósito Secundario’ sería nuestro depósito de destino.

La configuración de Comprobantes ofrece una opción para predefinir qué depósitos se utilizan con un comprobante específico. Al registrar un comprobante, estos depósitos sugeridos aparecerán automáticamente en el cabezal de las facturas. Si el usuario tiene los permisos necesarios, puede cambiar los depósitos sugeridos por otros.

Aunque todas las líneas de una factura registran los depósitos de origen y destino indicados en el cabezal, se pueden modificar estos para cada línea en particular, asignando otros depósitos. Por ejemplo, en una venta de múltiples artículos, podríamos tener algunos productos saliendo del ‘Depósito Central’ y otros del ‘Depósito Secundario’.

### Depósitos Virtuales

Los Depósitos de Stock no solo representan espacios físicos de almacenamiento sino que también pueden ser ‘virtuales’, funcionando como representaciones de diferentes “estados” o condiciones de la mercadería. Estos depósitos virtuales añaden una capa adicional de flexibilidad y control al sistema de gestión de inventario.

Un depósito virtual se puede concebir como un estado temporal de un artículo. Por ejemplo, podríamos tener depósitos virtuales llamados “Artículos pendientes de facturar” y “Artículos pendientes de remitir”. En lugar de representar un lugar físico, estos depósitos indican una fase específica en el flujo de operaciones de la mercadería.

Para trabajar con estos depósitos virtuales, debes configurar los comprobantes respectivos que muevan los artículos de un depósito a otro. Por ejemplo:

-   Un comprobante que transfiera los artículos vendidos desde el ‘Depósito Central’ al depósito ‘Artículos pendientes de facturar’ hasta que se genere la factura.
-   Otro comprobante que mueva los artículos de ‘Artículos pendientes de facturar’ a ‘Artículos pendientes de remitir’ hasta que se efectúe la entrega.
-   Un último comprobante que lo mueva fuera del depósito virtual, indicando que ha completado su ciclo de venta.

Los Depósitos de Stock en ZetaSoftware, tanto físicos como virtuales, proporcionan un alto grado de adaptabilidad en la gestión del inventario. Este sistema detallado de control y personalización del origen, destino y “estado” de la mercadería en cada transacción permite un seguimiento meticuloso del flujo de mercancías.

[Depósitos de Stock - PreviousCategorías de Artículos](https://zetasoftware.info/ayuda/configuracion/stock/categorias-de-articulos/)[Next - Depósitos de StockFamilias de Artículos](https://zetasoftware.info/ayuda/configuracion/stock/familias-de-articulos/)

---

## Links relacionados

- [Depósitos de Stock - PreviousCategorías de Artículos](https://zetasoftware.info/ayuda/configuracion/stock/categorias-de-articulos/)
- [Next - Depósitos de StockFamilias de Artículos](https://zetasoftware.info/ayuda/configuracion/stock/familias-de-articulos/)

