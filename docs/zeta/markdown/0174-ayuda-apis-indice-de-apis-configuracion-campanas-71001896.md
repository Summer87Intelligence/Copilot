# API Campañas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campanas/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campanas/

---

## Contenido

# API Campañas

Esta API permite gestionar campañas de marketing de la empresa, incluyendo consulta, creación, modificación y eliminación de registros.

La funcionalidad asociada en el sistema se encuentra en Configuración > Campañas.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcampaniasv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcampaniasv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcampaniasv1](https://api.zetasoftware.com/z.apis.asoapcampaniasv1)

## Método Query

Permite obtener un listado de campañas aplicando filtros.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Filtro por nombre de campaña. |
| `Page` | N(2) | Sí | Número de página. |

### Estructura del response

```
Codigo
Nombre
```

## Método Load

Permite obtener una campaña específica.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
```

## Método Save

Permite crear o actualizar una campaña.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Identificador de la campaña. |
| `Nombre` | T(40) | Sí | Nombre de la campaña. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar una campaña.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   El método `Query` permite consultas masivas de campañas.
-   El método `Load` es recomendado para consultas puntuales.
-   El método `Save` permite tanto alta como modificación.
-   Las campañas pueden ser utilizadas en oportunidades de venta para análisis comercial.

## Consideraciones de integración

-   Utilizar paginación en consultas.
-   Evitar consultas masivas frecuentes sin filtros.
-   Validar existencia de la campaña antes de asignarla a procesos comerciales.

[API Campañas - PreviousAPI Cajas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cajas/)[Next - API CampañasAPI Campos Adicionales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campos-adicionales/)

---

## Links relacionados

- [API Campañas - PreviousAPI Cajas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cajas/)
- [Next - API CampañasAPI Campos Adicionales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campos-adicionales/)

