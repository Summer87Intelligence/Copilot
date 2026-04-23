# API Conceptos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/conceptos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/conceptos/

---

## Contenido

# API Conceptos

Esta API permite gestionar conceptos utilizados en operaciones de caja, bancos y movimientos asociados a artículos. Incluye operaciones de consulta, creación, modificación y eliminación.

La funcionalidad asociada en el sistema se encuentra en Configuración > Conceptos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapconceptosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapconceptosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapconceptosv1](https://api.zetasoftware.com/z.apis.asoapconceptosv1)

## Método Query

Permite obtener un listado de conceptos aplicando filtros.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(10) | No | Código inicial del rango. |
| `CodigoHasta` | T(10) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Filtro por nombre del concepto. |
| `Page` | N(2) | Sí | Número de página. |

### Estructura del response

```
Codigo
Nombre
Tipo
ConceptoActivo
CodigoIVA
AbreviacionIVA
NombreIVA
TasaIVA
CodigoContable
CodigoGrupo
NombreGrupo
TotalizarReportes
```

## Método Load

Permite obtener un concepto específico.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
Tipo
CodigoContable
ConceptoActivo
CodigoIVA
CodigoGrupo
TotalizarReportes
```

## Método Save

Permite crear o actualizar un concepto.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(10) | Sí | Identificador del concepto. |
| `Nombre` | T(30) | Sí | Nombre del concepto. |
| `Tipo` | N(1) | Sí | Tipo de concepto. |
| `CodigoContable` | T(50) | No | Código contable asociado. |
| `ConceptoActivo` | T(1) | Sí | Indica si el concepto está activo (S/N). |
| `CodigoIVA` | N(2) | Sí | Código de IVA asociado. |
| `CodigoGrupo` | T(3) | Sí | Código de grupo del concepto. |
| `TotalizarReportes` | T(1) | Sí | Indica si el concepto se totaliza en reportes (S/N). |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar un concepto.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   El método `Query` permite consultas masivas.
-   El método `Load` es recomendado para consultas puntuales.
-   El método `Save` permite alta y modificación.
-   Los conceptos se utilizan para clasificar operaciones de caja, bancos y movimientos asociados.

## Consideraciones de integración

-   Utilizar paginación en consultas.
-   Validar códigos de IVA y grupos antes de crear conceptos.
-   Persistir conceptos en sistemas externos si se utilizan en integraciones.
-   Evitar eliminaciones sin validar impacto en operaciones existentes.

[API Conceptos - PreviousAPI Comprobantes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/comprobantes/)[Next - API ConceptosAPI Condiciones de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/condiciones-de-pago/)

---

## Links relacionados

- [API Conceptos - PreviousAPI Comprobantes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/comprobantes/)
- [Next - API ConceptosAPI Condiciones de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/condiciones-de-pago/)

