# Auxiliares - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/contabilidad/auxiliares/
- URL final: https://zetasoftware.info/ayuda/configuracion/contabilidad/auxiliares/

---

## Contenido

# Auxiliares

Los Auxiliares agrupan [Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/) relacionados para facilitar su gestión y análisis. Funcionan como categorías que reúnen diferentes tipos bajo un mismo concepto operativo.

_Nota: Esta página describe la configuración de Auxiliares (agrupaciones de tipos de asientos). Para los informes de Libros Auxiliares (ventas, compras, etc.), consultá [Informes → Auxiliares](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/)._

## ¿Para qué sirven?

Mientras los Tipos de Asientos clasifican cada asiento contable individualmente (ventas contado, ventas crédito, compras, etc.), los Auxiliares agrupan esos tipos en categorías más amplias. Por ejemplo:

-   El Auxiliar “Ventas” puede incluir los tipos: Ventas Contado, Ventas Crédito, Notas de Crédito de Ventas
-   El Auxiliar “Compras” puede incluir los tipos: Compras Contado, Compras Crédito, Notas de Crédito de Compras

Esta agrupación permite generar [Libros Auxiliares](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/) que consoliden información de varios tipos de asientos relacionados.

## Auxiliares predefinidos

ZetaSoftware incluye auxiliares predefinidos que cubren las operaciones más comunes:

-   **Ventas:** agrupa todos los tipos de asientos relacionados con ventas
-   **Compras:** agrupa todos los tipos de asientos relacionados con compras
-   **Cobranzas:** agrupa los tipos de asientos de cobro a clientes
-   **Pagos:** agrupa los tipos de asientos de pago a proveedores

Podés crear auxiliares adicionales según las necesidades de análisis de tu empresa.

## Relación con Tipos de Asientos

La relación es jerárquica:

-   Un Auxiliar contiene uno o más [Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/)
-   Cada Tipo de Asiento pertenece a un único Auxiliar
-   Al crear un nuevo Tipo de Asiento, debés asignarlo a un Auxiliar existente

## Uso en informes

Los Auxiliares configurados aquí determinan qué [Libros Auxiliares](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/) podés generar. Si necesitás un informe que agrupe ciertos tipos de asientos contables, primero debés crear el Auxiliar correspondiente y asignarle los tipos.

## Ejemplo práctico

Una empresa quiere analizar por separado las operaciones de importación. Para esto:

1.  Crea un Auxiliar llamado “Importaciones”
2.  Crea Tipos de Asientos específicos: “Compras Importación”, “Gastos de Importación”
3.  Asigna esos tipos al Auxiliar “Importaciones”
4.  Ahora puede generar un Libro Auxiliar de Importaciones con todas las operaciones relacionadas

## Buenas prácticas

-   **Usá los auxiliares predefinidos:** cubren la mayoría de las necesidades estándar
-   **Creá auxiliares específicos solo cuando sea necesario:** demasiadas categorías dificultan el análisis
-   **Mantené coherencia:** todos los tipos de asientos de una misma naturaleza deberían estar en el mismo auxiliar

## Relación con otras funcionalidades

-   [Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/): Los elementos que se agrupan dentro de cada Auxiliar
-   [Libros Auxiliares (Informes)](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/): Donde se visualizan los asientos agrupados por Auxiliar
-   [Asientos](https://zetasoftware.info/ayuda/contabilidad/asientos/): Cada asiento contable tiene un tipo, y cada tipo pertenece a un auxiliar

#### Te puede interesar

-   [Video Auxiliares](https://vimeo.com/606761499)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Auxiliares - PreviousEjercicios Contables](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/)[Next - AuxiliaresTipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/)

---

## Links relacionados

- [Auxiliares - PreviousEjercicios Contables](https://zetasoftware.info/ayuda/configuracion/contabilidad/ejercicios-contables/)
- [Tipos de Asientos](https://zetasoftware.info/ayuda/configuracion/contabilidad/tipos-de-asientos/)
- [Asientos](https://zetasoftware.info/ayuda/contabilidad/asientos/)
- [Informes → Auxiliares](https://zetasoftware.info/ayuda/contabilidad/informes/auxiliares/)
- [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

