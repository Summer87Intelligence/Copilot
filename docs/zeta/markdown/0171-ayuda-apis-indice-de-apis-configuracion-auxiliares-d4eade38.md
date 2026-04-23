# API Auxiliares - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/auxiliares/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/auxiliares/

---

## Contenido

# API Auxiliares

Esta API permite gestionar libros auxiliares utilizados para agrupar tipos de asientos contables. Incluye funcionalidades de consulta, creación, modificación y eliminación.

La funcionalidad asociada en el sistema se encuentra en Configuración > Contabilidad > Auxiliares.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapauxiliaresv1?wsdl](https://api.zetasoftware.com/z.apis.asoapauxiliaresv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapauxiliaresv1](https://api.zetasoftware.com/z.apis.asoapauxiliaresv1)

## Método Query

Permite obtener un listado de auxiliares aplicando filtros.

### Parámetros de entrada

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `CodigoDesde` | T(3) | Código inicial. |
| `CodigoHasta` | T(3) | Código final. |
| `NombreContiene` | T(20) | Filtro por nombre. |
| `Page` | N(2) | Paginación (obligatorio). |

### Estructura del response

```
Codigo
Nombre
```

## Método Load

Permite obtener un auxiliar específico.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
```

## Método Save

Permite crear o actualizar un auxiliar.

### Parámetros de entrada

-   `Codigo` – Obligatorio.
-   `Nombre` – Opcional.

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar un auxiliar.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Succeed
Error
Mensaje
```

### Restricción

No es posible eliminar auxiliares que tengan asientos contables asociados.

## Observaciones

-   El método `Query` permite búsquedas masivas.
-   El método `Load` es recomendado para consultas puntuales.
-   El método `Save` permite tanto alta como modificación.
-   El método `Delete` tiene restricciones según uso del auxiliar.

## Consideraciones de integración

-   Utilizar paginación en consultas masivas.
-   Validar dependencias antes de eliminar auxiliares.
-   Persistir auxiliares en sistemas externos si se requiere integración contable.

[API Auxiliares - PreviousAPI Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/articulos/)[Next - API AuxiliaresAPI Bancos y Financieras](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/bancos-y-financieras/)

---

## Links relacionados

- [API Auxiliares - PreviousAPI Artículos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/articulos/)
- [Next - API AuxiliaresAPI Bancos y Financieras](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/bancos-y-financieras/)

