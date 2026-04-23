# ¿Cómo configurar y utilizar la Verificación de Correo Electrónico en ZetaSoftware? - ZetaSoftware

# ¿Cómo configurar y utilizar la Verificación de Correo Electrónico en ZetaSoftware?

En ZetaSoftware, entendemos la importancia de proteger la información y los datos sensibles de nuestros usuarios. Es por eso que implementamos una característica de seguridad llamada “Verificación de Email”. Este método de seguridad es una variante de lo que comúnmente se conoce como Doble Autenticación, adaptada a nuestro entorno.

## Introducción

La Verificación de Email es un método de seguridad diseñado para garantizar que la persona que accede a ZetaSoftware es, efectivamente, quien afirma ser. Tradicionalmente, el acceso a sistemas como ZetaSoftware se ha protegido mediante contraseñas. Sin embargo, si alguien logra descifrar o robar la contraseña, la seguridad del usuario se ve comprometida. La Verificación de Email añade una capa adicional de seguridad al requerir no sólo el email y la contraseña en ZetaSoftware, sino también algo que sólo el usuario tiene en su posesión, en este caso el acceso al correo electrónico de dicho email.

La Verificación de Email envía un **código de verificación** (que cambia en cada uno de los envíos) a la dirección de correo electrónico del usuario. Este código es requerido para completar el proceso de inicio de sesión en ZetaSoftware, asegurando así que sólo las personas autorizadas tengan acceso al sistema.

### Ventajas

-   **Seguridad Robusta**: Al requerir un segundo factor de autenticación enviado a su correo electrónico, elevamos considerablemente la barrera de seguridad, haciendo mucho más difícil el acceso no autorizado a ZetaSoftware.
-   **Simplicidad**: A diferencia de otros métodos de Doble Autenticación, en ZetaSoftware no necesita disponer de un dispositivo móvil adicional. Su correo electrónico es suficiente para garantizar un nivel adicional de seguridad.

### Desventajas

-   **Pasos Extra en el Inicio de Sesión**: La inclusión de este código de verificación añade un paso adicional al proceso de inicio de sesión, lo que podría ser percibido como una leve incomodidad para usuarios que buscan un acceso rápido.
-   **Dependencia del Acceso al Email**: Si por alguna razón no puede acceder a su correo electrónico, no podrá completar el proceso de inicio de sesión.

En el contexto de ZetaSoftware, la Verificación de Email se configura como una herramienta poderosa pero sencilla, diseñada para balancear un alto nivel de seguridad con la accesibilidad y facilidad de uso que nuestros usuarios valoran.

## Configuración

La Verificación de Email puede configurarse desde dos áreas distintas dentro de la plataforma de ZetaSoftware. Cada una de estas opciones ofrece cierto grado de flexibilidad y control, según las necesidades tanto del usuario individual como de la empresa. Comenzaremos con la configuración desde el perfil del usuario.

### Configuración desde el Perfil del Usuario

Si usted es un usuario de ZetaSoftware y desea fortalecer la seguridad de su cuenta, tiene la opción de habilitar la Verificación de Email desde su perfil. Para hacerlo, acceda a la sección de [Modificar Datos y Preferencias](https://zetasoftware.info/ayuda/configuracion/usuario-zetasoftware/modificar-datos-y-preferencias/) en su perfil de usuario. Aquí encontrará una casilla de verificación etiquetada como “Verificar Email al iniciar sesión”.

Al marcar esta casilla, habrá habilitado una capa adicional de seguridad en su cuenta. A partir de ese momento, cada vez que inicie sesión en ZetaSoftware, se le enviará un código numérico a su dirección de correo electrónico registrado. Este código será requerido para completar su proceso de inicio de sesión.

Esta opción es especialmente útil si usted, como usuario, desea tener un control más estricto sobre el acceso a su cuenta, independientemente de las políticas de seguridad que las empresas dentro de ZetaSoftware puedan tener.

### Configuración desde la Identificación de la Empresa

Además de la configuración individual que cada usuario puede realizar desde su perfil, ZetaSoftware ofrece la posibilidad de establecer políticas de seguridad a nivel de empresa. Los administradores del sistema tienen la facultad de exigir la Verificación de Email para todos los usuarios que acceden a la empresa dentro de la plataforma.

Para activar esta opción, los administradores deben dirigirse a la sección [Configuración » Identificación de la Empresa](https://zetasoftware.info/ayuda/configuracion/empresa/identificacion-de-la-empresa/) en el panel principal del módulo. Una vez allí, encontrarán una casilla de verificación titulada “Requerir Verificación de Email para todos los usuarios”. Al marcar esta casilla se activará la política de seguridad para todos los usuarios que acceden a esa empresa específica.

Esta opción tiene dos posibles escenarios:

1.  Si un usuario ya ha activado la opción de “Verificación de Email al Iniciar Sesión” desde su perfil personal, podrá acceder a la empresa sin necesidad de realizar pasos adicionales, dado que ya habrá validado su dirección de correo electrónico en el inicio de sesión.
2.  Si un usuario no ha activado la opción desde su perfil, al intentar acceder a la empresa, el sistema le enviará automáticamente un código de verificación a su dirección de correo electrónico. Este código será necesario para completar el acceso a la empresa en cuestión.

Esta política de seguridad permite a la empresa garantizar que todos los usuarios que acceden a su información y recursos en ZetaSoftware han validado su identidad mediante la Verificación de Email. Es una forma efectiva de elevar el nivel general de seguridad de la empresa, sin sacrificar la eficiencia o accesibilidad para los usuarios.

## Ventajas y Limitaciones de la Verificación de Email

### Ventajas

La implementación de la Verificación de Email en ZetaSoftware representa un esfuerzo consciente para fortalecer la seguridad sin comprometer la facilidad de uso. Ofrece un delicado equilibrio entre seguridad robusta y comodidad para el usuario. El control completo recae en manos del usuario y de la empresa, permitiendo a ambos decidir cómo y cuándo activar esta capa adicional de seguridad. Esto asegura que sólo los usuarios que han validado sus credenciales tengan acceso a los recursos y datos empresariales.

### Limitaciones

Es fundamental tener en cuenta que cuando una empresa decide activar la opción de “Requerir Verificación de Correo Electrónico para Todos los Usuarios”, esta decisión es de alcance general para todos los usuarios que acceden a la empresa dentro de la plataforma. No existe, en la configuración actual, una forma de excluir usuarios individuales de este requisito. En otras palabras, se trata de una política de seguridad “todo o nada” a nivel de empresa.

## Detalles adicionales sobre el envío del Código de Verificación

Los correos electrónicos que contienen el código de verificación serán enviados desde la dirección [no\_responder@zetasoftware.com](mailto:no_responder@zetasoftware.com). Estos correos son generados y enviados a través del servicio Amazon Simple Email Service ([SES](https://aws.amazon.com/es/ses/)), lo que significa que no quedarán registrados en la bandeja de salida de ninguna cuenta de correo electrónico asociada a ZetaSoftware.

Si no recibe el correo electrónico de verificación al instante, le recomendamos revisar su carpeta de Spam o Correos no deseados, ya que podría haber sido clasificado erróneamente por su proveedor de correo electrónico.

Es crucial entender que estos correos electrónicos son automáticos y no deben ser respondidos. Las respuestas a estos correos no serán recibidas ni atendidas, ya que la dirección de correo electrónico desde la cual se envían no está habilitada para recibir mensajes.

El asunto del correo electrónico seguirá el siguiente formato: “**\[ZetaSoftware\] Verificación de Email — Código XXXXXX**“, donde “XXXXXX” representa el código de verificación que varía en cada envío. Este diseño específico en el asunto tiene como objetivo evitar que las cuentas de Gmail agrupen estos correos electrónicos como una conversación, manteniéndolos separados para una mejor organización.

En el cuerpo del correo electrónico, también encontrará el código de verificación que se requiere para completar el inicio de sesión. Una vez que haya ingresado este código y haya completado con éxito el proceso de verificación, le sugerimos eliminar el correo electrónico para mantener un mayor nivel de seguridad.

* * *

#### Te puede interesar

-   [Modificar Datos y Preferencias](https://zetasoftware.info/ayuda/configuracion/usuario-zetasoftware/modificar-datos-y-preferencias/)
-   [Identificación de la Empresa](https://zetasoftware.info/ayuda/configuracion/empresa/identificacion-de-la-empresa/)

[¿Cómo configurar y utilizar la Verificación de Correo Electrónico en ZetaSoftware? - Previous¿Qué información descargar antes de dar de baja la empresa?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/que-informacion-descargar-antes-de-dar-de-baja-la-empresa/)[Next - ¿Cómo configurar y utilizar la Verificación de Correo Electrónico en ZetaSoftware?¿Qué información es necesaria para recibir una Propuesta Comercial de ZetaSoftware?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/informacion-necesaria-para-elaborar-una-propuesta-comercial/)
