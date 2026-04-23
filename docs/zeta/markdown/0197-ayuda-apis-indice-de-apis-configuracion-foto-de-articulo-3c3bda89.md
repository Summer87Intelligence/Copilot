# API Foto de Artículo - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/foto-de-articulo/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/foto-de-articulo/

---

## Contenido

# API Foto de Artículo

Esta API permite obtener la imagen asociada a un artículo desde ZetaSoftware.

La funcionalidad corresponde a la gestión de artículos dentro del sistema.

**Importante:** Esta API se encuentra en proceso de descontinuación. Su uso no es recomendable para nuevas integraciones.

## Casos de uso

-   Obtener la imagen principal de un artículo.
-   Mostrar la foto en sistemas externos.
-   Sincronizar imágenes de productos de forma puntual.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoaparticulofotov1?wsdl](https://api.zetasoftware.com/z.apis.asoaparticulofotov1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoaparticulofotov1](https://api.zetasoftware.com/z.apis.asoaparticulofotov1)

## Método ObtenerFoto

Permite recuperar la foto asociada a un artículo específico.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `ArticuloCodigo` | T(20) | Sí | Código del artículo. |

### Estructura del response

```
Foto
```

### Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Foto` | Imagen codificada en Base64. |

## Observaciones

-   Solo se dispone de una imagen por artículo.
-   El resultado debe ser decodificado desde Base64 para su visualización.

## Limitaciones

-   No permite múltiples imágenes por artículo.
-   No es adecuada para integraciones de e-commerce.
-   No está pensada para consultas masivas.

## Recomendaciones de uso

-   Utilizar esta API únicamente para consultas puntuales.
-   Evitar sincronizaciones masivas.
-   Implementar almacenamiento externo de imágenes.

## Consideraciones de integración

-   Decodificar correctamente el Base64 antes de mostrar la imagen.
-   Controlar el volumen de consultas para evitar bloqueos.
-   Evaluar migración a repositorios externos de imágenes.

[API Foto de Artículo - PreviousAPI Formatos de Impresión](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formatos-de-impresion/)[Next - API Foto de ArtículoAPI Giros Comerciales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/giros-comerciales/)

---

## Links relacionados

- [API Foto de Artículo - PreviousAPI Formatos de Impresión](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/formatos-de-impresion/)
- [Next - API Foto de ArtículoAPI Giros Comerciales](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/giros-comerciales/)

