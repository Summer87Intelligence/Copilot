# API Formatos de Impresión - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formatos-de-impresion/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formatos-de-impresion/

---

## Contenido

# API Formatos de Impresión

Esta API permite gestionar los formatos de impresión utilizados en los comprobantes, incluyendo su diseño, estructura y configuración de salida.

La funcionalidad asociada en el sistema se encuentra en Configuración > Formatos de Impresión.

## Casos de uso

-   Consultar formatos de impresión disponibles.
-   Crear nuevos formatos de documentos.
-   Modificar diseños existentes.
-   Integrar formatos con sistemas externos de impresión.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoapformatosv1?wsdl](https://api.zetasoftware.com/z.apis.asoapformatosv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoapformatosv1](https://api.zetasoftware.com/z.apis.asoapformatosv1)

## Método Query

Permite obtener un listado paginado de formatos de impresión.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(3) | No | Código inicial del rango. |
| `CodigoHasta` | T(3) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Texto a buscar dentro del nombre. |
| `Page` | N(2) | Sí | Número de página. |

### Estructura del response

```
Codigo
Nombre
TopeLineas
CodigoDisenio
ArchivoDisenio
Via1
Via2
Via3
Via4
CodigoNumerador
NombreNumerador
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Codigo` | Código del formato. |
| `Nombre` | Nombre del formato. |
| `TopeLineas` | Cantidad máxima de líneas. |
| `CodigoDisenio` | Código del diseño asociado. |
| `ArchivoDisenio` | Archivo de diseño. |
| `Via1` | Descripción de la primera vía de impresión. |
| `Via2` | Descripción de la segunda vía. |
| `Via3` | Descripción de la tercera vía. |
| `Via4` | Descripción de la cuarta vía. |
| `CodigoNumerador` | Código del numerador. |
| `NombreNumerador` | Nombre del numerador. |

## Método Load

Permite obtener un formato de impresión específico.

### Parámetro

-   `Codigo` – Obligatorio.

### Resultado

```
Codigo
Nombre
ArchivoDisenio
CodigoDisenio
Via1
Via2
Via3
Via4
TopeLineas
CodigoNumerador
```

## Método Save

Permite crear o actualizar un formato de impresión.

### Parámetros de entrada

| Campo | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `Codigo` | T(3) | Sí | Código del formato. |
| `Nombre` | T(50) | Sí | Nombre del formato. |
| `ArchivoDisenio` | T(20) | No | Archivo de diseño. |
| `CodigoDisenio` | N(2) | No | Código del diseño. |
| `Via1` | T(20) | No | Primera vía de impresión. |
| `Via2` | T(20) | No | Segunda vía. |
| `Via3` | T(20) | No | Tercera vía. |
| `Via4` | T(20) | No | Cuarta vía. |
| `TopeLineas` | N(3) | No | Cantidad máxima de líneas. |
| `CodigoNumerador` | T(3) | No | Código del numerador. |

### Resultado

```
Succeed
Error
Mensaje
```

## Método Delete

Permite eliminar un formato de impresión.

### Parámetro

-   `Codigo` – Obligatorio.

### Resultado

```
Succeed
Error
Mensaje
```

## Observaciones

-   Los formatos definen la estructura de impresión de comprobantes.
-   Las vías permiten múltiples copias del documento.
-   El diseño impacta directamente en la presentación del comprobante.

## Consideraciones de integración

-   Validar consistencia entre diseño y numerador.
-   Probar formatos antes de usarlos en producción.
-   Evitar eliminar formatos en uso.
-   Gestionar versiones de diseños si hay cambios frecuentes.

[API Formatos de Impresión - PreviousAPI Formas de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formas-de-pago/)[Next - API Formatos de ImpresiónAPI Foto de Artículo](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/foto-de-articulo/)

---

## Links relacionados

- [API Formatos de Impresión - PreviousAPI Formas de Pago](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formas-de-pago/)
- [Next - API Formatos de ImpresiónAPI Foto de Artículo](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/foto-de-articulo/)

