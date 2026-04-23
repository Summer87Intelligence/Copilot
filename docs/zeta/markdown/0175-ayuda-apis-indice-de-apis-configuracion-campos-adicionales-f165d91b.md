# API Campos Adicionales - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campos-adicionales/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campos-adicionales/

---

## Contenido

# API Campos Adicionales

Esta API permite gestionar campos adicionales utilizados para extender la información de artículos, contactos y comprobantes. Facilita la personalización del sistema según necesidades específicas de cada empresa.

La funcionalidad asociada en el sistema se encuentra en Configuración > Campos Adicionales.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcamposadicionalesv1?wsdl](https://api.zetasoftware.com/z.apis.asoapcamposadicionalesv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcamposadicionalesv1](https://api.zetasoftware.com/z.apis.asoapcamposadicionalesv1)

## Método Query

Permite obtener un listado de campos adicionales aplicando filtros.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Filtro por nombre. |
| `Aplica` | T(1) | No | Contexto de aplicación: A=Artículos, C=Clientes/Proveedores, D=Comprobantes, N=Renglones de comprobantes. |
| `Page` | N(1) | Sí | Número de página. |

### Estructura del response

```
Codigo
Nombre
Aplica
```

## Método Load

Permite obtener un campo adicional específico.

### Parámetro de entrada

-   `Codigo` – Opcional.

### Resultado

```
Codigo
Nombre
Aplica
```

## Método Save

Permite crear o actualizar un campo adicional.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Identificador del campo adicional. |
| `Nombre` | T(30) | Sí | Nombre del campo adicional. |
| `Aplica` | T(1) | Sí | Contexto de aplicación. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar un campo adicional.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   Los campos adicionales permiten extender la información estándar del sistema.
-   El campo `Aplica` define dónde se utilizará el campo adicional.
-   El método `Query` permite consultas masivas.
-   El método `Load` es recomendado para consultas puntuales.

## Consideraciones de integración

-   Utilizar paginación en consultas.
-   Validar el valor de `Aplica` según el tipo de entidad.

[API Campos Adicionales - PreviousAPI Campañas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campanas/)[Next - API Campos AdicionalesAPI Categoría de Contratos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categoria-de-contratos/)

---

## Links relacionados

- [API Campos Adicionales - PreviousAPI Campañas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/campanas/)
- [Next - API Campos AdicionalesAPI Categoría de Contratos](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categoria-de-contratos/)

