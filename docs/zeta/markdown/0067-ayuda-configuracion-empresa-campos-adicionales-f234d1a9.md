# Campos Adicionales - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/empresa/campos-adicionales/
- URL final: https://zetasoftware.info/ayuda/configuracion/empresa/campos-adicionales/

---

## Contenido

# Campos Adicionales

Los **campos adicionales** ofrecen una manera de enriquecer y personalizar los datos asociados a artículos, clientes, proveedores o comprobantes en ZetaSoftware. Proporcionan flexibilidad para adaptar el sistema a las necesidades específicas de tu empresa, permitiendo añadir información que no está incluida en los campos estándar.

### Descripción de los datos

-   **Código:** Un identificador alfanumérico único para el campo adicional. Existen algunos códigos reservados para campos específicos.
-   **Nombre:** Texto descriptivo del campo. Se recomienda que sea representativo del propósito o uso del campo.
-   **Aplicación:** Define a qué entidad está asociado este campo adicional: clientes, artículos o comprobantes.

### Campos Adicionales Reservados

Existen algunos campos adicionales que ya están codificados y reservados en ZetaSoftware. Estos campos cumplen funciones específicas relacionadas con la generación y emisión de comprobantes, y se utilizan para responder a requerimientos particulares de normativa fiscal, entidades estatales, bancarias, asociaciones comerciales, entre otros.

Al crear un campo reservado, el nombre y tipo se asignan automáticamente y no pueden ser modificados. En la grilla se distinguirán visualmente por tener fondo gris.

#### Listado de campos reservados:

-   **EFC:** ID de compras para UTE, OSE, BROU y supermercados.
-   **INI:** Fecha de inicio de obra o servicio para entidades estatales.
-   **FIN:** Fecha de finalización de obra o servicio para entidades estatales.
-   **PCT:** Por cuenta de terceros. Para emisión de CFE en nombre de terceros.
-   **ZFT:** Emitir como e-Ticket. Aplicable a facturación a UTE para empresas de transporte.
-   **ZFA:** Norma del tratamiento de exportación.
-   **ZFC:** Registro de usuario de Zonas Francas.
-   **IAC:** Expediente o ID de compra requerido por BROU.
-   **MVE:** Modalidad de venta.
-   **ZND:** Nota de débito.
-   **ZGC:** Generar código del cliente automáticamente.
-   **ZGA:** Generar código del artículo automáticamente.

### Información Adicional para UTE, OSE, BROU y Supermercados

Algunas entidades estatales como UTE y OSE, junto con organizaciones comerciales como la Asociación de Supermercados del Uruguay y otras empresas, exigen que sus proveedores incluyan ciertos datos específicos en los CFEs.

-   **Configuración para UTE / OSE:** Antes de emitir los comprobantes, accede a Notas y selecciona los campos correspondientes: EFC, INI y FIN. Ingresa allí los valores requeridos.
-   **UTE – Facturación en formato e-Ticket:** Crea el cliente UTE con su RUT, genera el comprobante y antes de emitirlo, selecciona la opción ‘Emitir como e-Ticket’ desde la sección de Notas.
-   **BROU – Informar el ID de compras:** Agrega los campos EFC e IAC en Campos Adicionales. En cada comprobante, indica el número de expediente o ID de compra en las Notas antes de emitir.
-   **SUPERMERCADOS – Informar el ID de compras:** Sigue el mismo procedimiento que para BROU, utilizando los campos EFC e IAC.

En todos los casos, estos datos serán enviados como parte del archivo XML del comprobante y también se reflejarán en su versión impresa.

[Campos Adicionales - PreviousPermisos de Acceso](https://zetasoftware.info/ayuda/configuracion/empresa/permisos-de-acceso/)[Next - Campos AdicionalesCentros de Costos](https://zetasoftware.info/ayuda/configuracion/empresa/centros-de-costo/)

---

## Links relacionados

- [Next - Campos AdicionalesCentros de Costos](https://zetasoftware.info/ayuda/configuracion/empresa/centros-de-costo/)
- [Campos Adicionales - PreviousPermisos de Acceso](https://zetasoftware.info/ayuda/configuracion/empresa/permisos-de-acceso/)

