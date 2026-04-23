# API Cuentas Bancarias - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cuentas-bancarias/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cuentas-bancarias/

---

## Contenido

# API Cuentas Bancarias

Esta API permite gestionar las cuentas bancarias registradas en la empresa. Incluye operaciones de consulta, alta, modificación y eliminación de registros asociados a bancos, monedas y configuración operativa de la cuenta.

La funcionalidad asociada en el sistema se encuentra en Configuración > Cuentas Bancarias.

## Casos de uso

-   Consultar cuentas bancarias configuradas en la empresa.
-   Crear nuevas cuentas bancarias.
-   Actualizar datos operativos de una cuenta existente.
-   Sincronizar cuentas bancarias con sistemas externos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcuentasv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcuentasv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcuentasv1](https://api.zetasoftware.com/z.apis.asoapcuentasv1)

## Método Query

Permite obtener un listado de cuentas bancarias aplicando filtros por código y nombre.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | N(3) | No | Código inicial del rango a consultar. |
| `CodigoHasta` | N(3) | No | Código final del rango a consultar. |
| `NombreContiene` | T(20) | No | Texto a buscar dentro del nombre de la cuenta. |

### Estructura del response

La documentación original indica que la respuesta devuelve múltiples atributos de la cuenta bancaria, incluyendo código, nombre, número de cuenta, moneda, banco y otros datos relacionados.

### Campos principales devueltos

-   `Codigo`
-   `Numero`
-   `CodigoMoneda`
-   `CodigoBanco`
-   `Titular`
-   `CodigoContable`
-   `EmiteCheques`
-   `CuentaActiva`
-   `Notas`

## Método Load

Permite obtener una cuenta bancaria específica mediante su código.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

Devuelve el detalle de la cuenta bancaria consultada, incluyendo número, banco, titular y demás datos asociados.

## Método Save

Permite crear una nueva cuenta bancaria o actualizar una existente.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | N(3) | Sí | Código identificador de la cuenta bancaria. |
| `Numero` | T(20) | Sí | Número de la cuenta bancaria. |
| `CodigoMoneda` | N(2) | Sí, al crear | Código de la moneda de la cuenta. |
| `CodigoBanco` | T(3) | Sí | Código del banco asociado. |
| `Titular` | T(40) | No | Titular de la cuenta bancaria. |
| `CodigoContable` | T(50) | No | Código contable asociado. |
| `EmiteCheques` | T(1) | No | Indica si la cuenta emite cheques. Valores admitidos: `S`, `N`. |
| `CuentaActiva` | T(1) | No | Indica si la cuenta está activa. Valores admitidos: `S`, `N`. |
| `Notas` | T(1000) | No | Observaciones adicionales. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar una cuenta bancaria.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Restricción

No es posible eliminar una cuenta bancaria si tiene información vinculada en documentos.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   El método `Query` permite búsquedas masivas por código y nombre.
-   El método `Load` es adecuado para consultas puntuales.
-   El método `Save` permite tanto alta como modificación.
-   La moneda es obligatoria al crear una cuenta nueva.
-   La eliminación está restringida por dependencias documentales en el sistema.

## Consideraciones de integración

-   Validar previamente que el banco y la moneda existan en el sistema antes de crear una cuenta.
-   Verificar dependencias antes de intentar eliminar registros.
-   Controlar el estado activo de la cuenta antes de utilizarla en procesos automáticos.

[API Cuentas Bancarias - PreviousAPI Cotización de Monedas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cotizacion-de-monedas/)[Next - API Cuentas BancariasAPI Datos Comerciales de Cliente](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-cliente/)

---

## Links relacionados

- [API Cuentas Bancarias - PreviousAPI Cotización de Monedas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/cotizacion-de-monedas/)
- [Next - API Cuentas BancariasAPI Datos Comerciales de Cliente](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-cliente/)

