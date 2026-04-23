# Importar Descuentos de Clientes - ZetaSoftware

# Importar Descuentos de Clientes

La herramienta “Importar Descuentos de Clientes” es una característica muy útil que facilita la incorporación de los descuentos que se le otorgan a los clientes en función de varios factores como los artículos que compran, entre otros.

Primero que nada, la importación se realiza desde un archivo Excel que contiene los datos necesarios, organizados en columnas específicas. Cada una de estas columnas tiene un propósito y formato específicos. Asegúrate de que tu archivo Excel está correctamente estructurado de la siguiente manera:

1.  **Columna 1 (Código Cliente):** Este debe ser un campo de texto que contenga el código único del cliente. Importante, este cliente debe existir previamente en la base de datos de la empresa y no debe tener un descuento ya asignado. Es un dato **obligatorio**.
2.  **Columna 2 (Familia de Artículos):** Este campo debe ser un texto que contenga el código de la familia de artículos. Este código también debe existir en la tabla correspondiente de la base de datos.
3.  **Columna 3 (Categoría de Artículos):** Este campo debe ser de texto y contener el código de la categoría del artículo. Este código debe estar registrado en la tabla correspondiente de la base de datos.
4.  **Columna 4 (Marca):** Este campo debe ser de texto y contener el código de la marca. Asegúrate de que este código esté en la tabla correspondiente de la base de datos.
5.  **Columna 5 (Unidad):** Este campo debe ser de texto y contener el código de la unidad. Este código debe estar presente en la tabla correspondiente de la base de datos.
6.  **Columna 6 (Proveedor del Artículo):** Este campo también debe ser de texto y debe contener el código del proveedor del artículo. Este código debe estar registrado en la tabla correspondiente de la base de datos.
7.  **Columna 7 (% Descuento 1):** Este campo debe ser numérico y contener el porcentaje de descuento 1. Este número debe estar entre 0 y 100. Es un dato **obligatorio**.
8.  **Columna 8 (% Descuento 2):** Este campo debe ser numérico y contener el porcentaje de descuento 2. Este número debe estar entre 0 y 100.
9.  **Columna 9 (% Descuento 3):** Este campo debe ser numérico y contener el porcentaje de descuento 3. Este número debe estar entre 0 y 100.

Una vez que hayas preparado y cargado tu archivo Excel, el proceso de importación comenzará. Si todos los datos son correctos y cumplen con los requisitos, la herramienta generará un nuevo “Tipo de Descuento”, con el nombre del Cliente, que contendrá los datos y rangos aplicables para que se aplique el descuento.

Si el cliente ya tiene descuentos (supongamos para el ejemplo que sea el cliente 1234), se mostrará el mensaje _El cliente 1234 ya tiene descuentos. Debe eliminar dichos descuentos para poder asignarle nuevos._

* * *

#### Te puede interesar

-   [Tipos de Descuentos](https://zetasoftware.info/ayuda/configuracion/contactos/tipos-de-descuentos/)

[Importar Descuentos de Clientes - PreviousTipos de Descuentos](https://zetasoftware.info/ayuda/configuracion/contactos/tipos-de-descuentos/)[Next - Importar Descuentos de ClientesZonas](https://zetasoftware.info/ayuda/configuracion/contactos/zonas/)
