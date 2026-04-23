# Tipos de CFE - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/cfes/tipos-de-cfe/
- URL final: https://zetasoftware.info/ayuda/configuracion/cfes/tipos-de-cfe/

---

## Contenido

# Tipos de CFE

La Dirección General Impositiva (DGI) de Uruguay establece los tipos y la codificación específica para cada CFE. En ZetaSoftware, todos los tipos de CFE existentes ya están creados por defecto. Sin embargo, sólo se deben configurar aquellos para los que la empresa se postuló y certificó, dejando fuera los que no se postularon.

### Datos a configurar

Los Tipos de CFEs ya vienen predefinidos en ZetaSoftware. Cada tipo de CFE en la plataforma tiene un código numérico de hasta tres dígitos, un nombre y una etapa (testing, homologación, producción). Por defecto, la etapa queda siempre en “Producción”, pero puede ser modificada.

### Cálculo automático

Es importante destacar que ZetaSoftware calcula automáticamente el Tipo de CFE al emitir las facturas. Esto significa que el usuario no tiene que indicar a qué Tipo de CFE pertenece el comprobante que está emitiendo, ya que ZetaSoftware realiza este proceso automáticamente. Esta función agiliza el proceso de facturación y minimiza la posibilidad de errores en la entrada de datos.

### Códigos de tipos de CFE

A continuación, se muestran algunos ejemplos de códigos para los diferentes tipos de CFE, tal como se indican en la web de la DGI:

-   **e-Ticket (101)** / e-Ticket Contingencia (201)
-   **Nota de Crédito de e-Ticket (102)** / Nota de Crédito de e-Ticket Contingencia (202)
-   **e-Factura (111)** / e-Factura Contingencia (211)
-   **Nota de Crédito de e-Factura (112)** / Nota de Crédito de e-Factura Contingencia (212)
-   **e-Factura Exportación (121)** / e-Factura Exportación Contingencia (221)
-   **Nota de Crédito de e-Factura Exportación (122)** / Nota de Crédito de e-Factura Exportación Contingencia (222)
-   **e-Remito (181)** / e-Remito Contingencia (281)
-   **e-Resguardo (182)** / e-Resguardo Contingencia (282)

Es fundamental tener en cuenta que los códigos correctos deben ser utilizados para cada tipo de CFE para garantizar que se cumplan las regulaciones fiscales correspondientes y para que se puedan procesar eficazmente en la plataforma ZetaSoftware.

### Borrar CFEs

ZetaSoftware ofrece una función especial para aquellos Tipos de CFE que se encuentren en estado de Homologación o Testing. En estos casos, la plataforma presentará una opción en el menú de cada renglón de la grilla llamada “Borrar CFEs”, solo habilitada para usuarios del tipo Administrador o Supervisor.

La opción “Borrar CFEs” permite eliminar de manera definitiva de la base de datos de la empresa aquellos comprobantes electrónicos que hayan sido emitidos y que correspondan con el tipo de CFE seleccionado. Es importante mencionar que esta acción es irreversible y se debe utilizar con precaución.

Esta herramienta resulta especialmente útil para las empresas que necesitan realizar pruebas de emisión de CFEs en modo de Testing o Homologación. De esta manera, una vez que se pasan a la etapa de Producción, pueden eliminar todos aquellos comprobantes de prueba que se generaron durante las etapas de prueba.

[Tipos de CFE - PreviousCFEs](https://zetasoftware.info/ayuda/configuracion/cfes/)[Next - Tipos de CFEParámetros y Preferencias de CFEs](https://zetasoftware.info/ayuda/configuracion/cfes/parametros-y-preferencias-de-cfes/)

---

## Links relacionados

- [Tipos de CFE - PreviousCFEs](https://zetasoftware.info/ayuda/configuracion/cfes/)
- [Next - Tipos de CFEParámetros y Preferencias de CFEs](https://zetasoftware.info/ayuda/configuracion/cfes/parametros-y-preferencias-de-cfes/)

