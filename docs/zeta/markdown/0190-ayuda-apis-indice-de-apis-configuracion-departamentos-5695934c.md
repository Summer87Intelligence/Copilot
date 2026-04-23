# API Departamentos - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/departamentos/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/departamentos/

---

## Contenido

# API Departamentos

Esta API permite gestionar departamentos, provincias o estados asociados a los países definidos en la empresa. Incluye operaciones de consulta, creación, modificación y eliminación de registros geográficos.

La funcionalidad asociada en el sistema se encuentra en Configuración > Países y Departamentos.

## Casos de uso

-   Consultar departamentos configurados en la empresa.
-   Crear nuevos departamentos, provincias o estados.
-   Actualizar datos geográficos ya existentes.
-   Sincronizar catálogos geográficos con sistemas externos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapdepartamentosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapdepartamentosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapdepartamentosv1](https://api.zetasoftware.com/z.apis.asoapdepartamentosv1)

## Método Query

Permite obtener un listado paginado de departamentos, provincias o estados configurados en la empresa.

### Requisitos previos

-   Contar con acceso habilitado a la API.
-   Definir, si aplica, el rango de códigos o el texto a buscar.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango de departamentos a consultar. |
| `CodigoHasta` | T(3) | No | Código final del rango de departamentos a consultar. |
| `NombreContiene` | T(20) | No | Texto a buscar dentro del nombre del departamento. |
| `Page` | N(2) | Sí | Número de página a consultar. Devuelve hasta 100 registros por página. |

### Estructura del request

```
CodigoDesde
CodigoHasta
NombreContiene
Page
```

### Estructura del response

```
Codigo
Nombre
PaisCodigo
PaisNombre
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Codigo` | Código del departamento. |
| `Nombre` | Nombre del departamento, provincia o estado. |
| `PaisCodigo` | Código del país asociado. |
| `PaisNombre` | Nombre del país asociado. |

### Ejemplo de request

```
{
  "CodigoDesde": "",
  "CodigoHasta": "",
  "NombreContiene": "",
  "Page": 1
}
```

### Ejemplo de response

```
[
  {
    "Codigo": "010",
    "Nombre": "Montevideo",
    "PaisCodigo": "URY",
    "PaisNombre": "Uruguay"
  }
]
```

## Método Save

Permite crear un nuevo departamento o actualizar uno existente.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código identificador del departamento. |
| `Nombre` | T(40) | Sí | Nombre del departamento, provincia o estado. |
| `PaisCodigo` | T(3) | Sí, al crear | Código del país asociado. El país debe existir previamente en el sistema. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Load

Permite obtener un departamento específico mediante su código.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
PaisCodigo
```

## Método Delete

Permite eliminar un departamento.

### Parámetro de entrada

-   `Codigo` – Obligatorio.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   Esta API gestiona departamentos, provincias o estados según la estructura geográfica utilizada por la empresa.
-   El método `Query` permite búsquedas masivas con paginación.
-   El método `Save` permite alta y modificación.
-   La configuración de departamentos puede ser obligatoria para empresas que operan como Emisor Electrónico.

## Consideraciones de integración

-   Validar previamente que el país exista antes de crear un departamento.
-   Utilizar paginación en consultas masivas.
-   Verificar dependencias antes de eliminar registros geográficos en producción.

[API Departamentos - PreviousAPI Datos Comerciales de Proveedor](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-proveedor/)[Next - API DepartamentosAPI Depósitos de Stock](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/depositos-de-stock/)

---

## Links relacionados

- [API Departamentos - PreviousAPI Datos Comerciales de Proveedor](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/datos-comerciales-proveedor/)
- [Next - API DepartamentosAPI Depósitos de Stock](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/depositos-de-stock/)

