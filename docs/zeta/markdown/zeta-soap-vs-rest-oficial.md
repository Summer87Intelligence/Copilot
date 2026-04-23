# ZetaSoftware APIs — SOAP vs REST (Fuente oficial)

**Fuente:** [Protocolos soportados: SOAP y REST](https://zetasoftware.info/ayuda/apis/soap-y-rest/) — ZetaSoftware (consultada para elaborar este resumen técnico).

**Nota sobre la KB local:** el crawl original de la misma página vive en `0135-ayuda-apis-soap-y-rest-4f8f8fd9.md`. Este documento **no** lo sustituye; aporta una **vista estructurada** para integración, debugging y descubrimiento de contratos, sin añadir nombres de métodos que no figuren en la fuente oficial citada.

---

## Resumen

- ZetaSoftware expone APIs en **SOAP** y **REST**.
- **REST** es el protocolo **oficial y recomendado** para integraciones nuevas.
- **SOAP** queda en **mantenimiento / descontinuación**: sin nuevas versiones ni evolución funcional; solo compatibilidad para integraciones existentes.
- La documentación de esta página **incluye un ejemplo completo** de REST (request + response) para **un** endpoint concreto: `RESTFacturaClienteV4QuerySaldosPendientes`. **No** enumera todos los `methodName` REST del catálogo; para eso remite a la **colección Postman** enlazada en la misma página.

---

## Estructura REST (según ejemplo oficial)

1. **URL:** `POST` a `https://api.zetasoftware.com/rest/APIs/{NombreMetodoREST}` — en el ejemplo, `NombreMetodoREST` = `RESTFacturaClienteV4QuerySaldosPendientes`.
2. **Headers:** `Content-Type: application/json` (y `Accept: application/json` si aplica el cliente).
3. **Cuerpo JSON:** objeto raíz cuya **clave principal** coincide con el contrato del método (en el ejemplo: `QuerySaldosPendientesIn`), conteniendo:
   - **`Connection`:** credenciales de desarrollador + empresa + `RolCodigo` (en el ejemplo, `"1"`).
   - **`Data`:** parámetros de negocio del método (en el ejemplo: `Page` y objeto `Filters` con `ClienteCodigo`).
4. **Respuesta:** objeto con clave de salida del método (en el ejemplo: `QuerySaldosPendientesOut`) con campos como `Succeed`, `IsLastPage`, `Response` (array de registros).

> **Importante:** otro endpoint REST puede usar **otra** clave raíz (`*In` / `*Out`), **otra** forma de `Data` (sin `Page`/`Filters`, u otros nombres). La página oficial **no** garantiza un único esquema para todos los métodos; el ejemplo documenta **uno** representativo.

---

## Naming de métodos (patrones REST detectados)

Solo a partir del **ejemplo explícito** de la fuente oficial:

| Elemento | Valor en la documentación oficial |
|----------|-----------------------------------|
| Segmento final de la URL (path del método) | `RESTFacturaClienteV4QuerySaldosPendientes` |
| Prefijo observable | `REST` + nombre de dominio/versionado + operación (`Query…`, etc.) |
| Wrapper de entrada (ejemplo) | `QuerySaldosPendientesIn` |
| Wrapper de salida (ejemplo) | `QuerySaldosPendientesOut` |

**No documentado en esta página:** listado de otros `REST*` (p. ej. comprobantes por cliente, contactos, etc.). Para nombres exactos por entidad, la propia ayuda remite a la **colección Postman** (ver sección siguiente).

---

## Ejemplo de request

Tomado de la documentación oficial (Python → equivalente JSON). Sustituir credenciales y `cliente_codigo` por valores reales.

```json
{
  "QuerySaldosPendientesIn": {
    "Connection": {
      "DesarrolladorCodigo": "TU_CODIGO_DESARROLLADOR",
      "DesarrolladorClave": "TU_CLAVE_DESARROLLADOR",
      "EmpresaCodigo": "TU_CODIGO_EMPRESA",
      "EmpresaClave": "TU_CLAVE_EMPRESA",
      "RolCodigo": "1"
    },
    "Data": {
      "Page": "1",
      "Filters": {
        "ClienteCodigo": "CODIGO_DE_CLIENTE_A_CONSULTAR"
      }
    }
  }
}
```

**URL del POST (ejemplo oficial):**  
`https://api.zetasoftware.com/rest/APIs/RESTFacturaClienteV4QuerySaldosPendientes`

---

## Ejemplo de response

Tomado de la documentación oficial (estructura ilustrativa; valores de negocio varían).

```json
{
  "QuerySaldosPendientesOut": {
    "IsLastPage": true,
    "Succeed": true,
    "Response": [
      {
        "ClienteCodigo": "C123",
        "ClienteNombre": "Cliente prueba API",
        "ComprobanteCodigo": 701,
        "Fecha": "2025-07-10",
        "Saldo": "61.00",
        "Serie": "",
        "Numero": "0"
      }
    ]
  }
}
```

En errores de aplicación, la forma exacta de mensajes/códigos puede depender del método; ante **HTTP 4xx/5xx**, inspeccionar cuerpo de respuesta y contrastar con el contrato del método (Postman o ayuda específica del endpoint).

---

## Diferencias clave SOAP vs REST

- **Formato:** SOAP = **XML** estricto; REST = **JSON**.
- **Autenticación (SOAP):** **WS-Security** (según tabla oficial de la página).
- **Descripción de servicio (SOAP):** **WSDL**; estado: solo compatibilidad, sin evolución.
- **REST:** métodos HTTP estándar; modelo **stateless**; una **URL por recurso/método** bajo el patrón público `…/rest/APIs/{REST…}` del ejemplo.
- **Política de producto:** integraciones **nuevas** → **REST**; SOAP solo legado.

---

## Colección Postman (referencia oficial en la misma página)

- ZetaSoftware publica una colección Postman con endpoints agrupados por entidad (Factura Clientes, Artículos, Cajas, etc.).
- **Descarga (ZIP, enlace oficial en la página):**  
  `https://zetasoftware.info/wp-content/uploads/2025/10/Api-ZetaSoftware-collection_28-10-2025.zip`
- **Importación:** Postman → *File → Import → Upload Files* → seleccionar el ZIP descargado.
- **Nota oficial:** los endpoints agrupados bajo **Finanzas** no están disponibles para integraciones externas y deben **ignorarse**.

Esta colección es la vía indicada por el proveedor para obtener **nombres REST exactos** y cuerpos de request por método cuando la ayuda HTML no los detalla.

---

## Implicaciones para Copilot (Summer87)

1. **Base URL REST:** el ejemplo oficial usa `https://api.zetasoftware.com/rest/APIs` + **nombre de método como último segmento** del path. Alinear variables de entorno (`ZETA_API_BASE_URL`, etc.) con ese patrón salvo que un tenant use gateway distinto documentado aparte.
2. **No asumir un único shape de body:** el patrón `*In` → `Connection` + `Data` es el del **ejemplo**; otros métodos pueden usar otras claves o `Data` plano. Los **400** suelen deberse a URL de método incorrecta o JSON que no coincide con el contrato esperado — validar contra Postman o la ayuda **específica** del endpoint.
3. **`methodName` real:** no inferir desde convención interna del repo si hay duda; **confirmar** en la colección Postman o en la documentación del endpoint concreto (p. ej. ayuda “API Comprobantes por cliente” + WSDL enlazado allí).
4. **SOAP vs REST:** nuevas integraciones Zeta en Copilot deben priorizar **REST** según política oficial; SOAP solo si hay requisito explícito de legado.
5. **Errores HTTP:** registrar cuerpo de respuesta y URL completa; comparar con ejemplo `Succeed` / estructura `*Out` del método correspondiente en Postman.

---

## Qué aporta este archivo respecto a `0135-*.md`

| Aspecto | `0135` (crawl) | `zeta-soap-vs-rest-oficial.md` (este) |
|---------|----------------|----------------------------------------|
| Contenido | Texto fiel de la ayuda | Misma fuente URL, **reorganizado** por secciones de ingeniería |
| Enlaces / ejemplos | Sí | Sí, con **énfasis** en URL base, patrón URL, límites de generalización |
| Postman | Enlace en crawl | Misma URL ZIP + pasos de import + **nota Finanzas** |
| methodName | Solo en ejemplo dentro del crawl | Tabla explícita “solo lo documentado en la página” + **advertencia** de no extrapolar a todos los endpoints |

**Confirmación:** archivo creado en `docs/zeta/markdown/zeta-soap-vs-rest-oficial.md`.
