# API Cajas - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cajas/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cajas/

---

## Contenido

# API Cajas

Esta API permite gestionar las cajas asignadas a los locales comerciales de la empresa. Incluye operaciones de consulta, alta, modificación y eliminación de registros, dentro del alcance de configuración operativa de locales y cajas.

La funcionalidad asociada en el sistema se encuentra en Configuración > Locales y Cajas.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcajasv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcajasv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcajasv1](https://api.zetasoftware.com/z.apis.asoapcajasv1).

## Método Query

Permite obtener un listado de cajas aplicando filtros por código, nombre y local.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango a consultar. |
| `CodigoHasta` | T(3) | No | Código final del rango a consultar. |
| `NombreContiene` | T(3) | No | Texto a buscar dentro del nombre de la caja. |
| `LocalCodigo` | T(4) | No | Código del local asociado. |
| `Page` | N(2) | Sí | Número de página a consultar. |

### Estructura del response

```
Codigo
Nombre
LocalCodigo
LocalNombre
LocalActivo
Notas
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Codigo` | Código identificador de la caja. |
| `Nombre` | Nombre de la caja. |
| `LocalCodigo` | Código del local al que está asignada. |
| `LocalNombre` | Nombre del local asociado. |
| `LocalActivo` | Indica si el local asociado se encuentra activo. |
| `Notas` | Información adicional del registro. |

## Método Save

Permite crear una nueva caja o actualizar una caja existente.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código identificador de la caja. |
| `Nombre` | T(40) | Sí | Nombre de la caja. |
| `LocalCodigo` | T(4) | Sí, al crear | Código del local asociado. El local debe existir previamente. |
| `Notas` | T(1000) | No | Información adicional del registro. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Load

Permite obtener una caja específica mediante su código.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
LocalCodigo
Notas
```

## Método Delete

Permite eliminar una caja.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Restricción

No es posible eliminar una caja si existen comprobantes o documentos emitidos desde la misma.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   El método `Query` permite búsquedas masivas de cajas.
-   El método `Load` es apropiado para consultas puntuales.
-   El método `Save` permite alta y modificación de registros.
-   La creación de una caja requiere que el local exista previamente en el sistema.
-   El método `Delete` está condicionado por el uso histórico de la caja en comprobantes o documentos.

## Consideraciones de integración

-   Utilizar paginación en consultas masivas.
-   Validar previamente la existencia del local antes de crear una caja.
-   Persistir la relación entre caja y local en sistemas externos si se requiere integración operativa.

[API Cajas - PreviousAPI Bancos y Financieras](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/bancos-y-financieras/)[Next - API CajasAPI Campañas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campanas/)

---

## Links relacionados

- [API Cajas - PreviousAPI Bancos y Financieras](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/bancos-y-financieras/)
- [Next - API CajasAPI Campañas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campanas/)

