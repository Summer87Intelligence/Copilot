# Reportes Diarios - ZetaSoftware

# Reportes Diarios

El Reporte Diario es un conjunto estructurado de información que cada emisor electrónico de Comprobantes Fiscales Electrónicos (CFEs) debe enviar a la Dirección General Impositiva (DGI). Este reporte incluye una serie de datos pertinentes a la actividad comercial diaria, que abarca desde la emisión de CFEs hasta documentos de contingencia. El objetivo es consolidar toda la actividad fiscal en un solo archivo que comprenda las transacciones realizadas entre las 00:00:00 y las 23:59:59 horas de cada día. Es obligatorio emitir un reporte diario por cada día calendario, incluso si no se han realizado operaciones comerciales en dicho período.

### ¿A partir de qué fecha debe enviarse el Reporte Diario?

El Reporte Diario debe ser enviado a partir de la fecha en que la Resolución de la DGI le autoriza como emisor electrónico. Esto suele ser a partir del primer día del mes siguiente al que fue emitida dicha resolución. Esto es obligatorio incluso si la empresa aún no ha iniciado sus operaciones electrónicas.

### ¿Cuándo debe enviarse el Reporte Diario?

El Reporte Diario debe ser remitido a la DGI dentro de las primeras 18 horas del día hábil inmediatamente posterior al día del que se reporta. Esto es una norma invariable y aplica incluso cuando no se han registrado operaciones en el día anterior.

### ¿El envío del Reporte Diario es automático?

ZetaSoftware ha automatizado el proceso de generación y envío del Reporte Diario, haciéndolo más eficiente y menos propenso a errores humanos. Sin embargo, esto no elimina la responsabilidad de la empresa de confirmar que cada Reporte Diario se haya enviado efectivamente y de corregir cualquier discrepancia que pudiera surgir. Si la DGI rechaza un Reporte Diario, es imperativo que la empresa identifique la razón del rechazo y efectúe las correcciones necesarias para su posterior reenvío.

En términos generales, el Reporte Diario es una herramienta esencial para el cumplimiento de las responsabilidades fiscales de los emisores electrónicos. Facilita la auditoría y el seguimiento, tanto para la empresa como para la DGI, garantizando que todas las transacciones estén debidamente registradas y sean transparentes. Es por ello que se le debe dar la seriedad y rigurosidad que el proceso amerita.

### ¿Cómo controlar los Reportes Diarios?

Al igual que con los Comprobantes Fiscales Electrónicos (CFE), el control del estado de los Reportes Diarios es otra responsabilidad que recae sobre el emisor electrónico. Estos Reportes Diarios incorporan todos los CFE que han sido firmados electrónicamente hasta las 00:00 horas de un día determinado. Dado que un CFE podría ser emitido en una fecha y firmado en otra distinta, un Reporte Diario puede contener comprobantes tanto del día en cuestión como de fechas anteriores.

Cuando la DGI (Dirección General Impositiva) recibe el Reporte Diario, efectúa una validación primaria que abarca la verificación de los datos de la empresa y la validez del certificado digital, entre otros aspectos.

-   **Reporte Rechazado**: Este estado implica que el reporte no ha pasado la validación primaria de la DGI debido a errores detectados. En tal caso, es imprescindible determinar la causa del rechazo y ponerse en contacto con el equipo de Soporte Técnico de ZetaSoftware.
-   **Reporte Recibido**: Este estado se asigna cuando el reporte ha superado la validación primaria de la DGI y se encuentra a la espera de una validación final.

Para los Reportes Diarios que pasan la validación primaria, la DGI efectúa una segunda revisión en la que se examina la cantidad de CFE incluidos, su numeración y los montos declarados.

-   **Reporte Procesado**: Este es el estado deseado, asignado cuando el reporte ha superado todas las etapas de validación sin inconsistencias.
-   **Reporte Gestionado**: Este estado se asigna cuando el reporte, aunque ha pasado la validación primaria, contiene inconsistencias que impiden su aprobación. Generalmente, esto se debe a discrepancias en la numeración o en el tipo de CFE informado en el reporte respecto a los CFE que fueron firmados y enviados anteriormente. En este escenario, es crucial determinar el motivo y comunicarse con el equipo de Soporte Técnico de ZetaSoftware.
-   **Reporte Reliquidado**: Este estado se aplica cuando se recibe un nuevo reporte con la misma “Fecha de Resumen” y “secuencia + 1” que un reporte previamente recibido. En tal caso, el reporte anterior se reliquida. Si el nuevo archivo pasa todas las validaciones, se le asignará el estado de “Reporte Recibido”, mientras que el estado del reporte anterior cambia a “Reporte Reliquidado”.

* * *

#### Te puede interesar

-   [Preguntas Frecuentes sobre los CFEs](https://zetasoftware.info/ayuda/preguntas-frecuentes/cfes/)

[Reportes Diarios - PreviousCFEs Recibidos](https://zetasoftware.info/ayuda/cfes/cfes-recibidos/)[Next - Reportes DiariosAnular CFEs](https://zetasoftware.info/ayuda/cfes/anular-cfes/)
