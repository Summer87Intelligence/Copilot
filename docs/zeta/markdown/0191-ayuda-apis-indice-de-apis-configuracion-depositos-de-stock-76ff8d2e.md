# API Depósitos de Stock - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/depositos-de-stock/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/depositos-de-stock/

---

## Contenido

# API Depósitos de Stock

Esta API permite gestionar los depósitos de stock de la empresa, definiendo desde dónde salen y a dónde ingresan los artículos. Incluye operaciones de consulta, creación, modificación y eliminación de depósitos.

La funcionalidad asociada en el sistema se encuentra en Configuración > Depósitos de Stock.

## Casos de uso

-   Consultar depósitos de stock configurados.
-   Crear nuevos depósitos.
-   Actualizar información de depósitos existentes.
-   Sincronizar depósitos con sistemas externos de logística o inventario.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapdepositosstockv1?wsdl](https://api.zetasoftware.com/z.apis.asoapdepositosstockv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapdepositosstockv1](https://api.zetasoftware.com/z.apis.asoapdepositosstockv1)

## Método Query

Permite obtener un listado paginado de depósitos de stock.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | N(3) | No | Código inicial del rango a consultar. |
| `CodigoHasta` | N(3) | No | Código final del rango a consultar. |
| `NombreContiene` | T(20) | No | Texto a buscar dentro del nombre del depósito. |
| `LocalCodigo` | N(3) | No | Filtro por local. |
| `Page` | N(2) | Sí | Número de página. |

### Estructura del response

```
Codigo
Nombre
Abreviacion
ContabilizaInventario
LocalCodigo
LocalNombre
```

## Método Load

Permite obtener un depósito específico.

### Parámetro

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
Abreviacion
ContabilizaInventario
LocalCodigo
```

## Método Save

Permite crear o actualizar un depósito de stock.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | N(3) | Sí | Código del depósito. |
| `Nombre` | T(40) | Sí | Nombre del depósito. |
| `Abreviacion` | T(10) | Sí | Nombre abreviado. |
| `ContabilizaInventario` | T(1) | Sí | Indica si contabiliza inventario. Valores: `S`, `N`. |
| `LocalCodigo` | N(3) | Sí | Local asociado. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar un depósito.

### Parámetro

-   `Codigo` – Obligatorio.

### Restricciones

-   No se puede eliminar si tiene movimientos de stock.
-   No se puede eliminar si tiene stock actual.
-   No se puede eliminar si está referenciado en comprobantes.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   El método `Query` permite consultas masivas con paginación.
-   El método `Load` es para consultas puntuales.
-   El método `Save` permite alta y modificación.
-   Los depósitos impactan directamente en la gestión de stock y movimientos de inventario.

## Consideraciones de integración

-   Validar previamente que el local exista antes de crear un depósito.
-   No eliminar depósitos en uso en procesos operativos.
-   Sincronizar depósitos con sistemas de inventario o logística.

[API Depósitos de Stock - PreviousAPI Departamentos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/departamentos/)[Next - API Depósitos de StockAPI Ejercicios Contables](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ejercicios-contables/)

---

## Links relacionados

- [API Depósitos de Stock - PreviousAPI Departamentos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/departamentos/)
- [Next - API Depósitos de StockAPI Ejercicios Contables](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/ejercicios-contables/)

