# API Bancos y Financieras - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/bancos-y-financieras/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/bancos-y-financieras/

---

## Contenido

# API Bancos y Financieras

Esta API permite gestionar bancos y entidades financieras utilizados por la empresa, incluyendo consulta, alta, modificación y eliminación de registros.

La funcionalidad asociada en el sistema se encuentra en Configuración > Caja y Bancos > Bancos y Financieras.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapbancosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapbancosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapbancosv1](https://api.zetasoftware.com/z.apis.asoapbancosv1)

## Método Query

Permite obtener un listado de bancos y entidades financieras aplicando filtros.

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
Abreviacion
Tipo
Notas
```

## Método Load

Permite obtener un banco o entidad financiera específica.

### Parámetro de entrada

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

Permite crear o actualizar un banco o entidad financiera.

### Parámetros de entrada

-   `Codigo`
-   `Nombre`
-   `Abreviacion`
-   `Tipo` (B = Banco, E = Entidad financiera)
-   `Notas`

### Resultado

```
Succeed
Error
Mensaje
```

### Observación

El campo `Tipo` solo puede definirse al crear un registro nuevo.

## Método Delete

Permite eliminar un banco o entidad financiera.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Restricción

No es posible eliminar un banco o entidad financiera si está asociado a cuentas bancarias o tarjetas.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   El método `Query` permite consultas masivas.
-   El método `Load` es recomendado para consultas puntuales.
-   El método `Save` permite tanto alta como modificación.
-   El método `Delete` está condicionado por dependencias en el sistema.

## Consideraciones de integración

-   Utilizar paginación en consultas.
-   Validar dependencias antes de eliminar registros.
-   Persistir bancos y financieras en sistemas externos si se requiere integración.

[API Bancos y Financieras - PreviousAPI Auxiliares](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/auxiliares/)[Next - API Bancos y FinancierasAPI Cajas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cajas/)

---

## Links relacionados

- [API Bancos y Financieras - PreviousAPI Auxiliares](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/auxiliares/)
- [Next - API Bancos y FinancierasAPI Cajas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cajas/)

