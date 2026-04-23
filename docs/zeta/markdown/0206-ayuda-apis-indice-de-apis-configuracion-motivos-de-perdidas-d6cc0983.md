# API Motivos de Pérdidas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/motivos-de-perdidas/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/motivos-de-perdidas/

---

## Contenido

# API Motivos de Pérdidas

Esta API permite gestionar los motivos de pérdida de ventas dentro de ZetaSoftware.

La funcionalidad corresponde a Configuración > [Motivos de Pérdidas](https://zetasoftware.info/ayuda/configuracion/oportunidades-y-contratos/motivos-de-perdida-de-ventas/).

## Casos de uso

-   Consultar motivos de pérdida.
-   Crear o actualizar motivos.
-   Obtener un motivo específico.
-   Eliminar motivos no utilizados.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapmotivosperdidasv1?wsdl](https://api.zetasoftware.com/z.apis.asoapmotivosperdidasv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapmotivosperdidasv1](https://api.zetasoftware.com/z.apis.asoapmotivosperdidasv1)

## Método Query

Permite obtener un listado de motivos de pérdida.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Búsqueda por nombre. |
| `Page` | N(2) | Sí | Paginación (100 registros por página). |

### Estructura del response

```
Codigo
Nombre
Aplica
```

## Método Save

Permite crear o actualizar un motivo de pérdida.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Identificador del motivo. |
| `Nombre` | T(40) | Sí | Descripción del motivo. |
| `Aplica` | T(1) | Sí | Indica el ámbito de aplicación:
-   C: Candidatos
-   O: Oportunidades
-   T: Contratos

 |

### Resultado

```
Succeed / Error / Mensaje
```

## Método Load

Permite obtener un motivo de pérdida específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del motivo. |

### Resultado

```
Codigo
Nombre
Aplica
```

## Método Delete

Permite eliminar un motivo de pérdida.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del motivo. |

### Resultado

```
Succeed / Error / Mensaje
```

## Consideraciones

-   Los motivos permiten analizar causas de pérdida en el proceso comercial.
-   Se utilizan en oportunidades, candidatos y contratos.

[API Motivos de Pérdidas - PreviousAPI Monedas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/monedas/)[Next - API Motivos de PérdidasAPI Numeradores de Comprobantes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-comprobantes/)

---

## Links relacionados

- [API Motivos de Pérdidas - PreviousAPI Monedas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/monedas/)
- [Next - API Motivos de PérdidasAPI Numeradores de Comprobantes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/numeradores-de-comprobantes/)
- [Motivos de Pérdidas](https://zetasoftware.info/ayuda/configuracion/oportunidades-y-contratos/motivos-de-perdida-de-ventas/)

