# API Locales Comerciales - ZetaSoftware

Fuente:
- URL original: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/locales-comerciales/
- URL final: https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/locales-comerciales/

---

## Contenido

# API Locales Comerciales

Esta API permite consultar la información de los locales comerciales definidos en ZetaSoftware.

La funcionalidad corresponde a Configuración > Locales y Cajas.

## Casos de uso

-   Consultar locales comerciales existentes.
-   Obtener datos de sucursales.
-   Integrar información de locales en sistemas externos.

## Endpoint del servicio

-   **WSDL:** [https://api.zetasoftware.com/z.apis.asoaplocalescomercialesv1?wsdl](https://api.zetasoftware.com/z.apis.asoaplocalescomercialesv1?wsdl)
-   **Servicio:** [https://api.zetasoftware.com/z.apis.asoaplocalescomercialesv1](https://api.zetasoftware.com/z.apis.asoaplocalescomercialesv1)

## Método Query

Permite obtener un listado de locales comerciales.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `CodigoDesde` | T(4) | No | Código inicial del rango. |
| `CodigoHasta` | T(4) | No | Código final del rango. |
| `NombreContiene` | T(20) | No | Texto a buscar en el nombre del local. |
| `Page` | N(2) | Sí | Paginación de resultados (500 registros por página). |

### Estructura del response

```
Codigo
Nombre
Direccion
Ciudad
Departamento
Telefono
Fax
Contacto
Email
Notas
Activo
```

## Campos devueltos

| Campo | Descripción |
| --- | --- |
| `Codigo` | Identificador del local. |
| `Nombre` | Nombre del local. |
| `Direccion` | Dirección física. |
| `Ciudad` | Ciudad del local. |
| `Departamento` | Departamento o provincia. |
| `Telefono` | Teléfono de contacto. |
| `Fax` | Fax. |
| `Contacto` | Persona de contacto. |
| `Email` | Correo electrónico. |
| `Notas` | Información adicional. |
| `Activo` | Indica si el local está activo. |

## Consideraciones

-   Los locales comerciales representan sucursales de la empresa.
-   Se utilizan en múltiples procesos del sistema como ventas, stock y caja.

[API Locales Comerciales - PreviousAPI Listas de Precios](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/listas-de-precios/)[Next - API Locales ComercialesAPI Marcas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/marcas/)

---

## Links relacionados

- [API Locales Comerciales - PreviousAPI Listas de Precios](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/listas-de-precios/)
- [Next - API Locales ComercialesAPI Marcas](https://zetasoftware.info/ayuda/apis/indice-de-apis/configuracion/marcas/)

