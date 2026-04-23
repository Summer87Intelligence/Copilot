# API Centros de Costo - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/centros-de-costo/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/centros-de-costo/

---

## Contenido

# API Centros de Costo

Esta API permite gestionar los centros de costo utilizados para la organización y análisis financiero dentro de la empresa. Incluye operaciones de consulta, creación, modificación y eliminación.

La funcionalidad asociada en el sistema se encuentra en Configuración > Centros de Costo.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapcentroscostov1?wsdl](https://api.zetasoftware.com/z.apis.asoapcentroscostov1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapcentroscostov1](https://api.zetasoftware.com/z.apis.asoapcentroscostov1)

## Método Query

Permite obtener un listado de centros de costo aplicando filtros.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(10) | No | Código inicial del rango. |
| `CodigoHasta` | T(10) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Filtro por nombre. |
| `Page` | N(1) | Sí | Número de página. |

### Estructura del response

```
Codigo
Nombre
```

## Método Load

Permite obtener un centro de costo específico.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
```

## Método Save

Permite crear o actualizar un centro de costo.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(10) | Sí | Identificador del centro de costo. |
| `Nombre` | T(40) | Sí | Nombre del centro de costo. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar un centro de costo.

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
-   Los centros de costo permiten organizar y analizar información financiera.

## Consideraciones de integración

-   Utilizar paginación en consultas.
-   Evitar consultas masivas frecuentes sin filtros.
-   Persistir centros de costo en sistemas externos si se utilizan para análisis.
-   Validar existencia del centro de costo antes de utilizarlo en operaciones.

[API Centros de Costo - PreviousAPI Categorías de Proveedores](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-proveedores/)[Next - API Centros de CostoAPI Comprobantes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/comprobantes/)

---

## Links relacionados

- [API Centros de Costo - PreviousAPI Categorías de Proveedores](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/categorias-de-proveedores/)
- [Next - API Centros de CostoAPI Comprobantes](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/comprobantes/)

