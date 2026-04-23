# Rechazos y anulaciones de CFEs - ZetaSoftware

# Rechazos y anulaciones de CFEs

Cuando usted emite un comprobante fiscal electrónico (CFE) desde ZetaSoftware, ese comprobante pasa por dos instancias de validación: primero la Dirección General Impositiva (DGI) y luego el receptor (la empresa o persona a la que usted le facturó). Cada una puede rechazar el comprobante, pero las consecuencias y las acciones que usted debe tomar son muy diferentes en cada caso. Este artículo le explica qué significan los rechazos más comunes, cómo distinguirlos y qué hacer en cada situación.

## Conceptos previos

Antes de avanzar, conviene aclarar algunos términos que aparecen en los mensajes de rechazo.

#### CFE (Comprobante Fiscal Electrónico)

Es el documento digital que reemplaza a la factura en papel. Incluye facturas, notas de crédito, notas de débito, e-Resguardos y otros tipos definidos por DGI.

#### Emisor

Es usted o su empresa: quien genera y envía el comprobante.

#### Receptor (Cliente)

Es la empresa o persona que recibe el comprobante. Su sistema puede aceptarlo o rechazarlo de forma independiente a DGI.

* * *

## **La distinción fundamental: rechazo de DGI vs. rechazo del receptor (Cliente)**

Esta es la información más importante de este artículo. Léala con atención.

**Cuando DGI anula un comprobante**, ese comprobante no tiene validez fiscal. No existe como documento tributario. Usted debe anularlo en ZetaSoftware y emitir uno nuevo una vez que haya corregido el problema que causó el rechazo.

**Cuando el receptor rechaza un comprobante**, la situación es diferente. Si DGI ya aceptó ese comprobante, el CFE es fiscalmente válido aunque el receptor lo haya rechazado. El rechazo del receptor puede deberse a una decisión comercial o a una acción automática de su sistema, no es una invalidación tributaria. En estos casos usted debe resolver la situación con su cliente (el receptor). Este puede solicitarle generar un comprobante que anule ese CFE (por ejemplo una Nota de Crédito), o pueden concluir que su sistema rechazó el CFE por error, y en cuyo caso no ser necesaria ninguna acción.

En resumen: un rechazo de DGI significa que el comprobante no es válido y debe anularse y volver a emitirse. Un rechazo del receptor, cuando DGI ya aceptó el comprobante, significa que el comprobante es fiscalmente válido y la resolución depende de la comunicación directa con su cliente.

* * *

## **Rechazos de DGI: causas y soluciones**

A continuación se describen los motivos de rechazo o anulación de DGI que se presentan con mayor frecuencia.

**Su RUT no está habilitado como emisor electrónico**  
Mensaje de rechazo: “En fecha de firma de CFE \[fecha\] el RUC \[número\] no es Emisor”.

Qué significa: DGI todavía no había habilitado a su empresa como emisor electrónico al momento de emitir el comprobante.

Solución: Anule el comprobante, espere la habilitación de DGI y emítalo nuevamente. Si el problema sigue al día siguiente, contacte a soporte.

**Código de sucursal inválido**  
Mensaje de rechazo: “Código de sucursal del comprobante no es valido”.

Qué significa: El código de sucursal del comprobante no coincide con el registrado en DGI.

Solución: Solicite nuevos CAE, actualice la sucursal en ZetaSoftware, anule el comprobante rechazado y emita uno nuevo.

**Tipo de documento incorrecto al facturar a clientes extranjeros**  
Mensaje de rechazo: Rechazo de DGI por inconsistencia entre tipo de documento y país del receptor.

Qué significa: El tipo de documento seleccionado no es compatible con las validaciones de DGI para ese cliente extranjero.

Solución: Anule el comprobante y emítalo nuevamente usando “Otro” como tipo de documento. Si persiste, contacte a soporte.

**Error de formato de fecha en referencias**  
Mensaje de rechazo: Error de validación con una fecha incorrecta, por ejemplo un año imposible como 1205.

Qué significa: Se ingresó una fecha con formato inválido en una referencia del comprobante.

Solución: Corrija la fecha, anule el comprobante rechazado y emita uno nuevo.

**Anulación de DGI sin motivo visible**  
Mensaje de rechazo: Sin detalle o con motivo vacío.

Qué significa: El detalle de la anulación no aparece en el correo.

Solución: Revise el correo original y busque el campo “Detalle”. Si no lo encuentra, contacte a soporte y adjunte el correo original.

* * *

## **Rechazos del receptor: causas y soluciones**

Cuando el receptor rechaza un comprobante que DGI ya aceptó, el comprobante sigue siendo fiscalmente válido.

**Unidad de medida del ítem vacía**  
Mensaje de rechazo: “Unidad de medida del ítem no puede estar vacío” o “UniMed no puede ser vacío”.

Qué significa: El receptor exige la unidad de medida en el comprobante.

Solución: Configure la unidad de medida en la ficha del artículo, la que será considerada para nuevos CFEs. Si DGI aceptó el comprobante, sigue siendo válido.

**Certificado electrónico no válido**  
Mensaje de rechazo: “Certificado electrónico no es válido” o “Error building certification path”.

Qué significa: El sistema del receptor no puede validar correctamente el certificado, aunque DGI haya aceptado el comprobante.

Solución: Indique al receptor que DGI aceptó el comprobante y pídale que revise la configuración de su sistema. Si pasa con varios receptores, contacte a soporte.

**Nota de crédito rechazada por referir a factura previamente rechazada**  
Mensaje de rechazo: Código E58 o mensaje que indica que la nota de crédito refiere a una factura rechazada.

Qué significa: El receptor ya había rechazado la factura original y por eso rechaza también la nota de crédito.

Solución: No debe hacer nada ante DGI. Debe resolverlo directamente con el receptor.

**Rechazo del receptor sin motivo claro**  
Mensaje de rechazo: Mensaje genérico, vacío o sin información útil.

Qué significa: El comprobante fue aceptado por DGI, pero el receptor lo rechazó sin explicar la causa.

Solución: Consulte al receptor el motivo del rechazo. Si le informan un problema técnico y no puede resolverlo, contacte a soporte.

* * *

### **Cuándo contactar a soporte**

Si no entiende el rechazo de DGI.  
Si corrigió el problema y el rechazo se repite.  
Si su RUT sigue sin estar habilitado después de 24 horas.  
Si varios receptores informan el mismo error.  
Si no encuentra dónde hacer la configuración en ZetaSoftware.  
Si el receptor informa un problema técnico que usted no puede resolver.

* * *

### **Resumen rápido de acciones**

**Si DGI anuló el comprobante:** el comprobante no es válido. Identifique el motivo en el correo de notificación, corrija el problema, anule el comprobante en ZetaSoftware y emita uno nuevo.

**Si el receptor rechazó el comprobante (y DGI lo aceptó):** el comprobante es fiscalmente válido. Comuníquese con el receptor para entender el motivo y resolverlo comercialmente.

**Si no entiende el motivo del rechazo:** revise el correo de notificación original completo y busque el campo “Detalle”. Si aun así no puede interpretar el mensaje, contacte a soporte incluyendo ese detalle.

[Rechazos y anulaciones de CFEs - PreviousCFEs](https://zetasoftware.info/ayuda/preguntas-frecuentes/cfes/)[Next - Rechazos y anulaciones de CFEs¿Cómo instalar un Certificado Digital de la DGI?](https://zetasoftware.info/ayuda/preguntas-frecuentes/cfes/como-instalar-un-certificado-digital-de-la-dgi/)
