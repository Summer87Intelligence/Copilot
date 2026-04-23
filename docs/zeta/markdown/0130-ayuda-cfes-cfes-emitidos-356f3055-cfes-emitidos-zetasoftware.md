# CFEs Emitidos - ZetaSoftware

# CFEs Emitidos

Un CFE emitido se refiere a un “Comprobante Fiscal Electrónico” que una empresa emite como prueba de una transacción comercial. Este tipo de comprobante reemplaza a las facturas en papel y se genera de forma digital. Los CFE emitidos son documentos legales y fiscales que se utilizan para registrar y respaldar las ventas de bienes y servicios.

### Control de estado para los CFE emitidos

La responsabilidad primordial de un emisor electrónico es el monitoreo constante del estado de los Comprobantes Fiscales Electrónicos (CFE) que se han emitido. Es decir, se debe identificar el estado específico de cada documento emitido, según las validaciones efectuadas inicialmente por ZetaSoftware y posteriormente por la DGI (Dirección General Impositiva).

Al emitir un CFE, ZetaSoftware realiza una serie de validaciones para confirmar que el comprobante satisfaga los requisitos legales de emisión. Si el CFE falla en una o más validaciones, ZetaSoftware impedirá la emisión e indicará en pantalla las razones del rechazo. En tal caso, es mandatorio llevar a cabo las correcciones necesarias y emitir el CFE de nuevo.

-   **CFE emitido**: Este es el estado deseado e indica que el CFE cumple con todas las condiciones requeridas. ZetaSoftware generará su representación impresa al ser emitido.
-   **CFE no emitido**: Este estado se asigna cuando ZetaSoftware detecta algún error en los datos del comprobante, como pueden ser datos del cliente, detalles de los artículos, errores en la moneda, entre otros. Las correcciones apropiadas deben ser realizadas antes de reintentar la emisión.

Una vez que se superan estas validaciones iniciales, el CFE se firma electrónicamente y se envía tanto a la DGI como al receptor. La DGI luego valida tanto la estructura del archivo digital como su contenido y proporciona una respuesta correspondiente. Los posibles estados en esta etapa son:

-   **CFE Aceptado**: Este es el estado óptimo, que indica que todas las validaciones han sido exitosas.
-   **CFE Rechazado**: Se asigna este estado cuando la DGI detecta errores básicos en el comprobante. Las correcciones necesarias deben ser aplicadas y el CFE debe ser reemitido.
-   **CFE Anulado**: Este estado se asigna cuando, tras una validación básica exitosa, la DGI encuentra inconsistencias en el archivo. En tal caso, el CFE no puede ser corregido y debe ser anulado en ZetaSoftware para ser emitido de nuevo.
-   **CFE en Espera de Reemisión**: Se asigna cuando ZetaSoftware detecta algún error que requiere corrección antes de que el CFE pueda ser reemitido.
-   **CFE en Estudio**: Este estado se asigna cuando se detecta un error vinculado con la empresa, que impide la correcta emisión y firma del CFE, como un CAE o certificado digital vencido o inexistente.

* * *

#### Te puede interesar

-   [Preguntas Frecuentes sobre los CFEs](https://zetasoftware.info/ayuda/preguntas-frecuentes/cfes/)

[CFEs Emitidos - PreviousIntroducción General](https://zetasoftware.info/ayuda/cfes/introduccion-general-a-la-facturacion-electronica/)[Next - CFEs EmitidosCFEs Recibidos](https://zetasoftware.info/ayuda/cfes/cfes-recibidos/)
