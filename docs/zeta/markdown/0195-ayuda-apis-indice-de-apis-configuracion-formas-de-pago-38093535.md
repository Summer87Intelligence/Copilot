# API Formas de Pago - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formas-de-pago/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formas-de-pago/

---

## Contenido

# API Formas de Pago

Esta API permite gestionar las distintas formas de pago utilizadas por la empresa, incluyendo efectivo, tarjetas, transferencias y otros medios.

La funcionalidad asociada en el sistema se encuentra en Configuración > Formas de Pago.

## Casos de uso

-   Consultar formas de pago disponibles.
-   Configurar nuevos medios de cobro.
-   Actualizar datos de formas de pago.
-   Integrar métodos de pago con sistemas externos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapformaspagov1?wsdl](https://api.zetasoftware.com/z.apis.asoapformaspagov1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapformaspagov1](https://api.zetasoftware.com/z.apis.asoapformaspagov1)

## Método Query

Permite obtener un listado paginado de formas de pago.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Texto a buscar dentro del nombre. |
| `Tipo` | T(2) | No | Tipo de forma de pago. Valores: EF, CR, TR, MB, CE, DR, DE, RT. |
| `Page` | N(2) | Sí | Número de página. |

### Estructura del response

```
Codigo
Nombre
Abreviacion
EF
Notas
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Codigo` | Código de la forma de pago. |
| `Nombre` | Nombre descriptivo. |
| `Abreviacion` | Nombre abreviado. |
| `EF` | Indicador interno del tipo de pago. |
| `Notas` | Información adicional. |

## Método Load

Permite obtener una forma de pago específica.

### Parámetro

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
Abreviacion
Tipo
Notas
```

## Método Save

Permite crear o actualizar una forma de pago.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código identificador. |
| `Nombre` | T(50) | Sí | Nombre de la forma de pago. |
| `Abreviacion` | T(10) | Sí | Nombre abreviado. |
| `Tipo` | T(2) | Sí | Tipo de forma de pago. |
| `Notas` | T(1000) | No | Información adicional. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar una forma de pago.

### Parámetro

-   `Codigo` – Obligatorio.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   Las formas de pago determinan cómo se registran los cobros y pagos.
-   El campo `Tipo` define el comportamiento operativo.
-   Se recomienda mantener consistencia con los medios de pago reales utilizados.

## Consideraciones de integración

-   Sincronizar formas de pago con sistemas externos.
-   Validar tipos de pago antes de utilizarlos en comprobantes.
-   Evitar eliminar formas de pago en uso.
-   Utilizar paginación para consultas masivas.

[API Formas de Pago - PreviousAPI Familias de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/familias-de-articulos/)[Next - API Formas de PagoAPI Formatos de Impresión](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formatos-de-impresion/)

---

## Links relacionados

- [API Formas de Pago - PreviousAPI Familias de Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/familias-de-articulos/)
- [Next - API Formas de PagoAPI Formatos de Impresión](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formatos-de-impresion/)

