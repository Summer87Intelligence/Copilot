# Exportar e Importar Contactos con Excel - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/contactos/contactos-clientes-y-proveedores/exportar-e-importar-contactos-con-excel/
- URL final: https://zetasoftware.info/ayuda/configuracion/contactos/contactos-clientes-y-proveedores/exportar-e-importar-contactos-con-excel/

---

## Contenido

# Exportar e Importar Contactos con Excel

En el entorno empresarial actual, gestionar y organizar de manera efectiva los datos de los clientes es fundamental. Una de las herramientas más útiles para realizar esta tarea es la funcionalidad de exportar e importar datos de clientes en una hoja de cálculo de Excel en ZetaSoftware. Este recurso brinda comodidad y flexibilidad, permitiendo a los usuarios manipular los datos de los clientes en un formato familiar y fácil de usar y luego reimportarlos al sistema.

El proceso de importación de datos de clientes le permite gestionar grandes volúmenes de datos de clientes de manera eficiente, ahorrándole tiempo y esfuerzo en la entrada de datos. También es una excelente manera de mantener sus datos de clientes actualizados y precisos. Además, la opción de exportar e importar datos de clientes le permite modificar y revisar los datos en Excel, lo que puede ser más cómodo para muchos usuarios. Este método de trabajo es particularmente útil si tiene una gran cantidad de datos de clientes para gestionar.

## Beneficios de la Exportación e Importación a Excel

-   **Manejo Eficiente de los Datos**: Poder manipular los datos de los clientes en Excel brinda la flexibilidad y familiaridad del software de hojas de cálculo, facilitando la gestión de grandes volúmenes de datos.
-   **Correcciones y Modificaciones Rápidas**: Excel ofrece una variedad de herramientas que facilitan la corrección y modificación de datos de forma masiva, ahorrando tiempo y esfuerzo en comparación con la edición individual de registros.
-   **Filtrado y Clasificación**: La capacidad de Excel para filtrar y clasificar los datos puede ser particularmente útil para identificar patrones, realizar análisis y priorizar información.

Por ejemplo, una empresa podría exportar sus datos de clientes a Excel, clasificarlos por volumen de ventas y luego aplicar un filtro para identificar rápidamente a aquellos clientes que han realizado compras significativas en el último año. Estos clientes podrían ser el foco de una futura campaña de marketing o de esfuerzos de retención de clientes.

## Guía para la Exportación e Importación

### **Exportar**

1.  Dirígete a “Configuración”, selecciona [Contactos, Clientes y Proveedores](https://zetasoftware.info/ayuda/configuracion/contactos/contactos-clientes-y-proveedores/), luego pulsa el botón **Clientes** o **Proveedores** para ver la grilla con los datos de los mismos.
2.  Selecciona el botón Exportar si quieres [descargar el archivo XLS](https://drive.google.com/drive/folders/1j9cZefd40FGwZV1rheOrCDQajJI4Hdav?usp=sharing) con todos los datos que has filtrado, pudiendo utilizar esta planilla para ingresar o modificar los datos que deseas importar.
3.  Si quieres descargar el archivo Excel sin datos, para poder completar con los datos de los **Clientes**, [haz clic aquí](https://drive.google.com/drive/folders/1j9cZefd40FGwZV1rheOrCDQajJI4Hdav?usp=sharing).
4.  Si quieres descargar el archivo Excel sin datos, para poder completar con los datos de los **Proveedores**, [haz clic aquí](https://docs.google.com/spreadsheets/d/1cQO5o1S44UAL66Fk3uct6VHfJDfq3yHETXLOvZBxdmU/edit?usp=sharing).

### **Importar**

1.  Una vez que haya terminado de modificar la hoja de cálculo, asegúrate de que contenga solo la hoja “Clientes” o “Proveedores”, según lo que hayas seleccionado. Si contiene otras hojas, como “Campos”, elimínelas.
2.  Guarda la hoja de cálculo en formato XLS o XLSX. Si la abriste con otro programa, al guardarla, asegúrate de hacerlo en uno de estos formatos.
3.  Ahora puedes reimportar la hoja de cálculo al sistema.

Es importante que verifique que los datos se hayan importado correctamente antes de proceder a utilizarlos en el sistema. En caso de problemas, puede volver a importar los datos después de haber corregido los errores en la planilla Excel. También puede optar por actualizar la planilla de datos de clientes en cualquier momento, ya que los cambios se reflejarán automáticamente en el sistema después de la importación.

## Formato de Celdas en Excel

Asegúrate de seguir el formato correcto para cada celda en la hoja de cálculo. A continuación, te proporcionamos una guía detallada para cada campo. Recuerda que algunos campos son obligatorios, mientras que otros son opcionales.

Es fundamental entender que la hoja de cálculo no debe ser modificada en cuanto a su estructura original. Además, los países, zonas, grupos, giros y demás códigos pertenecientes a otras tablas, deben haberse creado previamente en la empresa.

### Datos por columna para los Clientes

1.  **Código:** Identificador único obligatorio, no debe estar previamente creado. Si importa un cliente con un código existente, los datos importados sustituirán los ya existentes. Debe ser precedido por una comilla simple si es numérico (ej. ‘12547).
2.  **Nombre:** Descripción obligatoria del cliente a importar. Para empresas, corresponde al nombre de fantasía.
3.  **Razón Social:** Obligatorio. Corresponde a la razón social de una empresa. Si el cliente es un individuo, use el mismo dato que el Nombre.
4.  **RUT:** Número de 12 dígitos correspondiente al RUT de una empresa. Dejar en blanco si no está disponible. Precedido por una comilla simple (ej. ‘211320220119).
5.  **Documento:** Número correspondiente a la cédula de identidad. Si se informa este campo, el RUT debe dejarse en blanco.
6.  **País:** Obligatorio. Código del [país](https://zetasoftware.info/ayuda/configuracion/empresa/paises/) del cliente.
7.  **Departamento:** Obligatorio. Código del [Departamento](https://zetasoftware.info/ayuda/configuracion/empresa/paises/) del país del cliente.
8.  **Localidad:** Obligatorio. Ciudad o localidad del cliente. Campo de texto libre.
9.  **Dirección:** Obligatorio. Dirección de la localidad del cliente. Campo de texto libre.
10.  **Código Postal:** Numérico, no obligatorio y no debe contener caracteres alfabéticos.
11.  **Zona:** Código de la [Zona](https://zetasoftware.info/ayuda/configuracion/contactos/zonas/) del cliente.
12.  **Teléfono:** Obligatorio. Teléfono principal del cliente.
13.  **Celular:** Obligatorio si no se proporciona un número de teléfono. Teléfono secundario del cliente.
14.  **Fax:** Número de fax del cliente. No obligatorio.
15.  **Email Principal:** Dirección de correo electrónico principal del cliente.
16.  **Email Secundario:** Dirección de correo electrónico secundaria del cliente.
17.  **Web:** Sitio web del cliente, si tiene uno.
18.  **Grupo:** Código del [Grupo](https://zetasoftware.info/ayuda/configuracion/contactos/grupos/).
19.  **Giro:** Código del [Giro](https://zetasoftware.info/ayuda/configuracion/contactos/giros-comerciales/).
20.  **Origen:** Código del [Origen](https://zetasoftware.info/ayuda/configuracion/contactos/origenes/).
21.  **Propietario:** Código del [usuario de la empresa](https://zetasoftware.info/ayuda/configuracion/empresa/roles-de-usuarios/) que es el propietario del cliente. No obligatorio.
22.  **Activo:** S para un cliente activo o para activar uno existente, N para un cliente inactivo o para desactivar uno existente.
23.  **Local:** Obligatorio. Indicar 1 si la empresa tiene un solo [local](https://zetasoftware.info/ayuda/cfes/configuracion/locales/).
24.  **Categoría:** Código de una [categoría](https://zetasoftware.info/ayuda/configuracion/contactos/categorias-de-clientes/) a asignar al cliente.
25.  **Condición de Pago:** Código de la [condición de pago](https://zetasoftware.info/ayuda/configuracion/comprobantes/condiciones-de-pago/).
26.  **Precio:** Código del [precio de venta](https://zetasoftware.info/ayuda/configuracion/stock/precios-de-venta/). Puede ser cero.
27.  **Descuento 1:** Porcentaje de descuento que se asignará automáticamente al cliente.
28.  **Descuento 2:** Porcentaje de descuento que se asignará automáticamente al cliente. Si el 1 está vacío este no será tomado en cuenta.
29.  **Descuento 3:** Porcentaje de descuento que se asignará automáticamente al cliente. Si el 1 o el 2 están vacíos este no será tomado en cuenta.
30.  **Vendedor:** Código de [vendedor/cobrador](https://zetasoftware.info/ayuda/configuracion/empresa/vendedores/) asignado al cliente.
31.  **Moneda Tope:** Obligatorio. Código de la [moneda](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/) con un tope de ventas para el cliente específico.
32.  **Tope Crédito:** Importe asignado como tope de crédito. Puede ser cero.
33.  **Tope Días:** Cantidad máxima de días que se puede otorgar como condición de pago. Puede ser cero.
34.  **Cuenta:** [Rubro contable](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/) para generar asientos automáticos de ventas. Debe existir en el plan de cuentas de la empresa.
35.  **Texto Predefinido:** Código de [Texto Predefinido](https://zetasoftware.info/ayuda/configuracion/empresa/textos-predefinidos/) que se puede asignar a cada cliente.
36.  **IVA Exento:** S si el cliente es exento de IVA, N si no es exento de IVA.
37.  **Email Administración:** Correo para el envío automático de comprobantes fiscales electrónicos emitidos a nombre del cliente. Si hay varias direcciones, se deben separar con punto y coma.
38.  **Código de Descuento**: Identificador numérico del [código de Descuento](https://zetasoftware.info/ayuda/configuracion/contactos/tipos-de-descuentos/) que se le aplica al cliente.
39.  **Notas CFE**: Texto para la emisión de los CFEs.
40.  **Notas**: Texto para las notas del contacto.

### Datos por columna para los Proveedores

1.  **Código:** Identificador único obligatorio, no debe estar previamente creado. Si importa un proveedor con un código existente, los datos importados sustituirán los ya existentes. Debe ser precedido por una comilla simple si es numérico (ej. ‘12547).
2.  **Nombre:** Descripción obligatoria del proveedor a importar. Para empresas, corresponde al nombre de fantasía.
3.  **Razón Social:** Obligatorio. Corresponde a la razón social de una empresa. Si el proveedor es un individuo, use el mismo dato que el Nombre.
4.  **RUT:** Número de 12 dígitos correspondiente al RUT de una empresa. Dejar en blanco si no está disponible. Precedido por una comilla simple (ej. ‘211320220119).
5.  **Documento:** Número correspondiente a la cédula de identidad. Si se informa este campo, el RUT debe dejarse en blanco.
6.  **País:** Obligatorio. Código del [país](https://zetasoftware.info/ayuda/configuracion/empresa/paises/) del proveedor.
7.  **Departamento:** Obligatorio. Código del [Departamento](https://zetasoftware.info/ayuda/configuracion/empresa/paises/) del país del proveedor.
8.  **Localidad:** Obligatorio. Ciudad o localidad del proveedor. Campo de texto libre.
9.  **Dirección:** Obligatorio. Dirección de la localidad del proveedor. Campo de texto libre.
10.  **Código Postal:** Numérico, no obligatorio y no debe contener caracteres alfabéticos.
11.  **Zona:** Código de la [Zona](https://zetasoftware.info/ayuda/configuracion/contactos/zonas/) del proveedor.
12.  **Teléfono:** Obligatorio. Teléfono principal del proveedor.
13.  **Celular:** Obligatorio si no se proporciona un número de teléfono.
14.  **Fax:** Número de fax del proveedor. No obligatorio.
15.  **Email Principal:** Dirección de correo electrónico principal del proveedor.
16.  **Email Secundario:** Dirección de correo electrónico secundaria del proveedor.
17.  **Web:** Sitio web del proveedor, si tiene uno.
18.  **Grupo:** Código del [Grupo](https://zetasoftware.info/ayuda/configuracion/contactos/grupos/).
19.  **Giro:** Código del [Giro](https://zetasoftware.info/ayuda/configuracion/contactos/giros-comerciales/).
20.  **Origen:** Código del [Origen](https://zetasoftware.info/ayuda/configuracion/contactos/origenes/).
21.  **Propietario:** Código del [usuario de la empresa](https://zetasoftware.info/ayuda/configuracion/empresa/roles-de-usuarios/) que es el propietario del proveedor. No obligatorio.
22.  **Activo:** S para un proveedor activo o para activar uno existente, N para un proveedor activo o para desactivar uno existente.
23.  **Local:** Obligatorio. Indicar 1 si la empresa tiene un solo [local](https://zetasoftware.info/ayuda/cfes/configuracion/locales/).
24.  **Categoría:** Código de una [categoría](https://zetasoftware.info/ayuda/configuracion/contactos/categorias-de-proveedores/) a asignar al proveedor.
25.  **Condición de Pago:** Código de la [condición de pago](https://zetasoftware.info/ayuda/configuracion/comprobantes/condiciones-de-pago/).
26.  **Descuento 1:** Porcentaje de descuento que se asignará automáticamente al proveedor.
27.  **Descuento 2:** Porcentaje de descuento que se asignará automáticamente al proveedor. Si el 1 está vacío este no será tomado en cuenta.
28.  **Descuento 3:** Porcentaje de descuento que se asignará automáticamente al proveedor. Si el 1 o el 2 están vacíos este no será tomado en cuenta.
29.  **Cuenta:** [Rubro contable](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/) para generar asientos automáticos de compras. Debe existir en el [plan de cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/) de la empresa.
30.  **Texto Predefinido:** Código de [Texto Predefinido](https://zetasoftware.info/ayuda/configuracion/empresa/textos-predefinidos/) que se puede asignar a cada proveedor.
31.  **IVA:** S si el proveedor factura con IVA incluido; M si el proveedor factura con IVA incluido pero puede modificarse al ingresar el comprobante; N si factura sin IVA incluido; O si factura sin IVA incluido pero puede modificarse al ingresar el comprobante; E si factura exento de IVA.

### Importación de Campos Adicionales (para Clientes y Proveedores)

Además de los datos principales de los clientes y proveedores que se pueden importar desde Excel, ZetaSoftware permite la importación de [campos adicionales](https://zetasoftware.info/ayuda/configuracion/empresa/campos-adicionales/) desde una segunda hoja del mismo archivo. En el panel de entrada de datos, puedes seleccionar la hoja que deseas importar del archivo, ya sea la Hoja 1 (con los datos básicos de los clientes o proveedores) o la **Hoja 2 (Campos)**, que contiene los datos para estos campos adicionales.

La segunda hoja o “Campos” tiene un formato específico de tres columnas, detallado a continuación:

1.  **Código:** Este es un dato alfanumérico obligatorio que se corresponde con el identificador único del Contacto, sin importar que sea cliente y/o proveedor. Durante el proceso de importación, el sistema validará que este código exista en la base de datos de la empresa.
2.  **Código del campo adicional:** Este es otro dato alfanumérico que corresponde a la identificación del [campo adicional](https://zetasoftware.info/ayuda/configuracion/empresa/campos-adicionales/). Este código también es validado por el sistema durante la importación para asegurar que corresponde a un campo adicional válido.
3.  **Valor:** Este es el dato que se almacenará en el campo adicional del cliente o proveedor. Este debe ser un dato alfanumérico.

Con esta funcionalidad, ZetaSoftware proporciona flexibilidad y capacidad de personalización para adaptar el sistema a las necesidades específicas de cada empresa, permitiendo almacenar y manejar datos adicionales que pueden ser relevantes para las operaciones comerciales y administrativas.

* * *

[Exportar e Importar Contactos con Excel - PreviousContactos, Clientes y Proveedores](https://zetasoftware.info/ayuda/configuracion/contactos/contactos-clientes-y-proveedores/)[Next - Exportar e Importar Contactos con ExcelAnotaciones del Contacto](https://zetasoftware.info/ayuda/configuracion/contactos/contactos-clientes-y-proveedores/historial-del-contacto/)

---

## Links relacionados

- [local](https://zetasoftware.info/ayuda/cfes/configuracion/locales/)
- [condición de pago](https://zetasoftware.info/ayuda/configuracion/comprobantes/condiciones-de-pago/)
- [Rubro contable](https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/)
- [categoría](https://zetasoftware.info/ayuda/configuracion/contactos/categorias-de-clientes/)
- [categoría](https://zetasoftware.info/ayuda/configuracion/contactos/categorias-de-proveedores/)
- [Contactos, Clientes y Proveedores](https://zetasoftware.info/ayuda/configuracion/contactos/contactos-clientes-y-proveedores/)
- [Next - Exportar e Importar Contactos con ExcelAnotaciones del Contacto](https://zetasoftware.info/ayuda/configuracion/contactos/contactos-clientes-y-proveedores/historial-del-contacto/)
- [Giro](https://zetasoftware.info/ayuda/configuracion/contactos/giros-comerciales/)
- [Grupo](https://zetasoftware.info/ayuda/configuracion/contactos/grupos/)
- [Origen](https://zetasoftware.info/ayuda/configuracion/contactos/origenes/)
- [código de Descuento](https://zetasoftware.info/ayuda/configuracion/contactos/tipos-de-descuentos/)
- [Zona](https://zetasoftware.info/ayuda/configuracion/contactos/zonas/)
- [campos adicionales](https://zetasoftware.info/ayuda/configuracion/empresa/campos-adicionales/)
- [moneda](https://zetasoftware.info/ayuda/configuracion/empresa/monedas/)
- [país](https://zetasoftware.info/ayuda/configuracion/empresa/paises/)
- [usuario de la empresa](https://zetasoftware.info/ayuda/configuracion/empresa/roles-de-usuarios/)
- [Texto Predefinido](https://zetasoftware.info/ayuda/configuracion/empresa/textos-predefinidos/)
- [vendedor/cobrador](https://zetasoftware.info/ayuda/configuracion/empresa/vendedores/)
- [precio de venta](https://zetasoftware.info/ayuda/configuracion/stock/precios-de-venta/)

