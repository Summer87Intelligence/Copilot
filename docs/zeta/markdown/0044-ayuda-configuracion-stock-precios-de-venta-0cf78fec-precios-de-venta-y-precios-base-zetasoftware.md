# Precios de Venta y Precios Base - ZetaSoftware

# Precios de Venta y Precios Base

ZetaSoftware ha diseñado un sistema de precios versátil y efectivo que puede adaptarse a una gran variedad de escenarios comerciales. Ya sea que tu negocio opere con un solo precio de venta por artículo, varios precios de venta, precios basados en costos y márgenes de utilidad, o precios derivados de otros precios, el sistema puede manejarlo. Esta flexibilidad se logra a través de dos componentes clave: los Precios Base y los Precios de Venta.

## Precios de Venta

Comenzaremos explicando los Precios de Venta, ya que estos son los que se solicitan al ingresar facturas de venta. Pero antes de hacerlo, necesitamos entender qué son los Precios Base y cómo se conectan con los Precios de Venta.

Los Precios Base son los importes fundamentales que se utilizan como punto de partida para el cálculo de los Precios de Venta. Estos precios base incluyen el costo del artículo, entre otros posibles valores. Estos valores sirven como “base” para aplicar un porcentaje adicional configurado en los precios de venta.

Los Precios de Venta, por otro lado, son los precios que se aplicarán directamente en las facturas de venta. Son calculados en base a los Precios Base, aplicándoles un porcentaje adicional especificado por el usuario. En otras palabras, un precio de venta se deriva de un precio base más un porcentaje adicional, que puede ser tanto positivo como negativo.

Vamos a desglosar los campos de la tabla de Precios de Venta:

-   **Código**: Este es un dato numérico que identifica al precio de venta.
-   **Nombre**: Es la descripción del precio de venta. Podría ser “Precio Venta Público” o “Precio Venta Distribuidor”, por ejemplo.
-   **Abreviación**: Este es un nombre corto para el precio de venta, útil cuando el espacio es limitado.
-   **Porcentaje**: Es el porcentaje adicional que se aplicará a un determinado precio base. Este porcentaje puede ser tanto positivo como negativo.
-   **Sobre**: Aquí se especifica cuál Precio Base se utilizará para aplicar el porcentaje adicional.
-   **Sumar % de utilidad del artículo**: Si se marca esta opción, al Precio Base también se le sumará el porcentaje de utilidad definido en la sección Precios de la tabla [Artículos](https://zetasoftware.info/ayuda/configuracion/stock/articulos/).
-   **Vigente hasta**: Este campo permite establecer una fecha límite para la vigencia y utilización del precio de venta.

**Para ilustrar cómo funciona, tomemos el siguiente ejemplo**:

Supongamos que tienes un artículo cuyo precio base (costo) es de $100 y tienes definido un precio de venta con un código 1, nombre “Precio Venta Público”, abreviación “PVP”, y un porcentaje de 20%. El campo “Sobre” está establecido en “Costo”, lo que significa que el porcentaje se aplicará sobre el costo del artículo. Si has marcado la opción “Sumar % de utilidad del artículo”, digamos con un valor de 5%, esto también se sumará al costo antes de aplicar el porcentaje. Finalmente, si la fecha en “Vigente hasta” es posterior a la fecha actual, este precio de venta se puede utilizar en las facturas.

De esta manera, el Precio de Venta se calculará así: (Costo + % de utilidad) + 20% sobre este valor. En este caso, (100 + 5%) + 20% = $126.

Así, ZetaSoftware ofrece un sistema flexible y eficiente para manejar los precios de los artículos, teniendo en cuenta las diferentes necesidades y escenarios que puede enfrentar una empresa. Esto permite una gestión eficaz y personalizada de los precios de venta, con la posibilidad de aplicar diferentes porcentajes a los precios base y adaptar los precios de venta a las circunstancias específicas de tu negocio.

## Precios Base

Los Precios Base son un componente esencial del sistema de precios de ZetaSoftware y existen para permitir una mayor flexibilidad y eficiencia en la configuración de precios. Es una tabla simple que solo requiere un código y un nombre. Pero para entender por qué se incorporaron, vale la pena considerar qué pasaría si no estuviesen presentes.

En muchos sistemas, cada artículo tiene solo un precio, a menudo referido como el precio de venta. Si ZetaSoftware operara de esta manera, estaríamos limitados a un único precio de venta por artículo. Aunque esto podría ser adecuado para algunos negocios, otros necesitan una mayor flexibilidad para manejar diferentes estrategias de precios.

Algunos sistemas abordan esta necesidad permitiendo múltiples precios de venta por artículo. Sin embargo, ZetaSoftware lleva este concepto un paso más allá, reconociendo que muchos precios de venta son en realidad porcentajes aplicados a un precio base. En otras palabras, un precio de venta es a menudo un Precio Base ajustado en un cierto porcentaje para reflejar diversas condiciones de venta o grupos de clientes.

Tomemos un ejemplo común: una empresa puede tener un Precio de Lista al Público, y luego otros precios de venta que son un porcentaje más alto o más bajo que este. En este caso, el Precio de Lista al Público se ingresa como un Precio Base. Luego, otros precios de venta se definen aplicando un porcentaje a este Precio Base.

Por ejemplo, podríamos tener un Precio de Lista Distribuidor que es el Precio Base menos un 10%. Otro precio podría ser el Precio Distribuidor Exclusivo, que es el Precio Base menos un 20%. O incluso un Precio para Familia, que se calcula aplicando un porcentaje al costo del artículo. De esta manera, podemos crear una variedad de precios de venta, todos basados en un Precio Base común.

Esta estructura simple pero potente permite a ZetaSoftware manejar una variedad de estrategias de precios. Con solo dos tablas (Precios Base y Precios de Venta), y la capacidad de definir múltiples precios de venta que se calculan a partir de los Precios Base, puedes configurar prácticamente cualquier estructura de precios de venta que tu negocio necesite. Además cuando necesitas aumentar o modificar los precios, solo tienes que hacer el cambio en el “precio base”. Luego, todos los “precios de venta” que se basan en ese precio base se actualizarán automáticamente. Esto ahorra tiempo y evita errores al mantener todos los precios sincronizados muy fácilmente.

No confundir los conceptos mencionados anteriormente, con las [Listas de Precios](https://zetasoftware.info/ayuda/configuracion/stock/listas-de-precios/). Estas listas son la forma que tiene ZetaSoftware de [configurar el reporte](https://zetasoftware.info/ayuda/gestion/informes/stock-e-inventarios/listas-de-precios/) que se emite con los precios de venta.

* * *

#### Te puede interesar

-   [Video Precios de Artículos](https://vimeo.com/704663278)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Precios de Venta y Precios Base - PreviousMarcas](https://zetasoftware.info/ayuda/configuracion/stock/marcas/)[Next - Precios de Venta y Precios BaseUnidades de Stock](https://zetasoftware.info/ayuda/configuracion/stock/unidades-de-stock/)
