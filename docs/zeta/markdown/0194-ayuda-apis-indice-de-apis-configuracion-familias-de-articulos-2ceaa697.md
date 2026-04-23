# API Familias de Artículos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/familias-de-articulos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/familias-de-articulos/

---

## Contenido

# API Familias de Artículos

Esta API permite gestionar las familias de artículos, facilitando la organización y segmentación del inventario mediante estructuras jerárquicas.

La funcionalidad asociada en el sistema se encuentra en Configuración > Familias de Artículos.

## Casos de uso

-   Consultar familias de artículos.
-   Definir estructuras jerárquicas de productos.
-   Organizar el inventario por niveles.
-   Integrar catálogos de productos con sistemas externos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapfamiliasv2?wsdl](https://api.zetasoftware.com/z.apis.asoapfamiliasv2?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapfamiliasv2](https://api.zetasoftware.com/z.apis.asoapfamiliasv2)

## Método Query

Permite obtener un listado paginado de familias de artículos.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(10) | No | Código inicial del rango. |
| `CodigoHasta` | T(10) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Texto a buscar dentro del nombre. |
| `EsImputable` | T(1) | No | Indica si la familia es imputable. |
| `Page` | N(2) | Sí | Número de página. |

### Estructura del response

```
Codigo
Nombre
Padre
Nivel
EsImputable
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Codigo` | Código de la familia. |
| `Nombre` | Nombre de la familia. |
| `Padre` | Código de la familia padre. |
| `Nivel` | Nivel jerárquico. |
| `EsImputable` | Indica si admite imputación directa. |

## Método Load

Permite obtener una familia específica.

### Parámetro

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
Padre
Nivel
EsImputable
```

## Método Save

Permite crear o actualizar una familia de artículos.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(10) | Sí | Código de la familia. |
| `Nombre` | T(40) | Sí | Nombre de la familia. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar una familia de artículos.

### Parámetro

-   `Codigo` – Obligatorio.

### Restricciones

-   No se puede eliminar si está asignada a artículos.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   Las familias permiten organizar artículos en estructuras jerárquicas.
-   El campo `Padre` define la relación entre niveles.
-   El campo `EsImputable` indica si se puede utilizar directamente en operaciones.

## Consideraciones de integración

-   Respetar la estructura jerárquica al sincronizar datos.
-   Validar dependencias antes de eliminar familias.
-   Utilizar paginación en consultas masivas.
-   Evitar modificar estructuras en uso en producción.

[API Familias de Artículos - PreviousAPI Estados de Oportunidades](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/estados-de-oportunidades/)[Next - API Familias de ArtículosAPI Formas de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formas-de-pago/)

---

## Links relacionados

- [API Familias de Artículos - PreviousAPI Estados de Oportunidades](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/estados-de-oportunidades/)
- [Next - API Familias de ArtículosAPI Formas de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formas-de-pago/)

