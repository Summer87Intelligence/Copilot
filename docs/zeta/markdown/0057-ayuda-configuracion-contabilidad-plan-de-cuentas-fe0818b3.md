# Plan de Cuentas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/
- URL final: https://zetasoftware.info/ayuda/configuracion/contabilidad/plan-de-cuentas/

---

## Contenido

# Plan de Cuentas

El Plan de Cuentas es la estructura fundamental de tu sistema contable. Define todas las cuentas que utilizarás para registrar las operaciones de la empresa, organizadas en una jerarquía lógica que refleja la naturaleza de cada transacción.

## ¿Para qué sirve?

El Plan de Cuentas cumple tres funciones esenciales:

-   **Clasificar** cada operación económica en la cuenta correcta
-   **Estructurar** la información para generar estados financieros (Balance, Estado de Resultados)
-   **Estandarizar** el registro contable en toda la organización

Sin un Plan de Cuentas correctamente configurado, no es posible registrar asientos ni generar informes contables.

## Estructura jerárquica

El Plan se organiza en niveles, desde lo más general hasta lo más específico:

| Nivel | Nombre | Ejemplo de código | ¿Se imputan asientos? | Color en grilla |
| --- | --- | --- | --- | --- |
| 1 | Capítulo | 1 (Activo) | No | Verde |
| 2 | Subcuenta | 11 (Activo Corriente) | No | Azul |
| 3 | Subcuenta | 111 (Disponibilidades) | No | Azul |
| 4 | Cuenta imputable | 11101 (Caja Principal Pesos) | Sí | Blanco |

El sistema determina automáticamente si una cuenta es imputable o es una subcuenta agrupadora, según su posición en la jerarquía de códigos.

## Datos de cada cuenta

### Código

Identificador numérico único que determina la posición jerárquica de la cuenta. La estructura del código define automáticamente quién es la “cuenta padre”. Por ejemplo, la cuenta 11101 es hija de 111, que a su vez es hija de 11.

**Recomendación:** Si necesitás más de 99 cuentas dentro de un grupo, usá códigos de 3 dígitos en el último nivel (ej: 111001 en lugar de 11101).

### Nombre

Descripción clara de la cuenta. Aparece en todos los informes y al buscar cuentas durante el ingreso de asientos.

### Presentación

Por defecto adopta el código, pero podés personalizarlo para que en los balances aparezca una representación alternativa (ej: “C.P.P.” en lugar de “11101”).

### Moneda

Define la divisa en que opera la cuenta. Es fundamental para el cálculo de diferencias de cambio.

### Centro de Costos

Determina si al imputar esta cuenta en un asiento se debe indicar un Centro de Costos:

-   **No requerido:** no se solicita
-   **Opcional:** se puede ingresar pero no es obligatorio
-   **Obligatorio:** el asiento no se puede guardar sin indicar el Centro de Costos

Esta opción solo está disponible si activaste “Trabaja con Centros de Costo” en los [Parámetros Generales de Contabilidad](https://zetasoftware.info/ayuda/configuracion/contabilidad/parametros-generales-de-contabilidad/).

### Grupo

Permite clasificar la cuenta dentro de un [Grupo de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/grupos-de-cuentas/). Los grupos son transversales a los capítulos: podés agrupar bajo “Cuentas de IVA” tanto cuentas de Activo (IVA Compras) como de Pasivo (IVA Ventas).

### Literal Tributario

Código tributario asociado a la cuenta. Se utiliza para la generación del Anexo 2/181 de DGI. Esta opción solo está disponible si activaste “Usa Literal Tributario” en los [Parámetros Generales de Contabilidad](https://zetasoftware.info/ayuda/configuracion/contabilidad/parametros-generales-de-contabilidad/).

### Calcular Diferencias de Cambio

Indica si esta cuenta se incluye en el proceso automático de cálculo de diferencias de cambio. Activalo para cuentas en moneda extranjera cuyos saldos generan resultados por variación del tipo de cambio (ej: Caja Dólares, Banco USD, Deudores en USD).

### Notas

Campo libre para documentar políticas de uso, tipos de transacciones que debe registrar, o cualquier aclaración relevante para el equipo contable.

## Acciones disponibles

### Agregar cuenta

Dos formas de crear cuentas nuevas:

-   **Botón “Agregar”:** crea una cuenta desde cero
-   **Opción “Agregar Cuenta” en cada fila:** sugiere automáticamente el código padre. Si estás en la cuenta 111 y elegís esta opción, el sistema propone 11101 como nuevo código

### Nuevo Capítulo

Crea cuentas de primer nivel (un solo dígito). Los capítulos estándar (1-Activo, 2-Pasivo, 3-Capital, 4-Ganancias, 5-Pérdidas) vienen predefinidos, pero podés agregar otros como Cuentas de Orden (6 y 7).

### Exportar / Importar

Permite trabajar el Plan de Cuentas en Excel:

-   **Exportar:** genera un archivo Excel con todo el plan actual
-   **Importar:** carga un plan desde Excel. Útil para estudios contables que replican estructuras entre empresas

**Importante:** La importación solo está habilitada cuando la empresa no tiene asientos registrados.

## Impacto en el sistema

El Plan de Cuentas es prerequisito para:

-   Registrar cualquier asiento contable
-   Configurar la [Definición de Asientos por RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/) para generación automática desde CFEs
-   Generar balances, estados de resultados y todos los informes contables
-   Calcular diferencias de cambio automáticas

## Antes de configurar el Plan

Asegurate de haber definido previamente:

1.  [Parámetros Generales de Contabilidad](https://zetasoftware.info/ayuda/configuracion/contabilidad/parametros-generales-de-contabilidad/) (capítulos, monedas, centros de costo)
2.  [Grupos de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/grupos-de-cuentas/) si vas a utilizarlos

#### Te puede interesar

-   [Video Plan de Cuentas](https://vimeo.com/596500282)
-   [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

[Plan de Cuentas - PreviousContabilidad](https://zetasoftware.info/ayuda/configuracion/contabilidad/)[Next - Plan de CuentasGrupos de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/grupos-de-cuentas/)

---

## Links relacionados

- [Plan de Cuentas - PreviousContabilidad](https://zetasoftware.info/ayuda/configuracion/contabilidad/)
- [Grupo de Cuentas](https://zetasoftware.info/ayuda/configuracion/contabilidad/grupos-de-cuentas/)
- [Definición de Asientos por RUT](https://zetasoftware.info/ayuda/configuracion/contabilidad/numeros-de-rut/)
- [Parámetros Generales de Contabilidad](https://zetasoftware.info/ayuda/configuracion/contabilidad/parametros-generales-de-contabilidad/)
- [Utilizando las Grillas en ZetaSoftware: ¿Qué necesitas saber?](https://zetasoftware.info/ayuda/preguntas-frecuentes/generales/como-funcionan-y-cuales-son-las-ventajas-de-las-grillas-en-zetasoftware/)

