# ZetaSoftware — Comprobantes por cliente (contrato oficial Postman)

**Rol:** fuente de verdad para integración REST del método *Comprobantes por cliente*, alineada a la **colección Postman oficial** publicada por ZetaSoftware (no sustituye el WSDL; complementa el descubrimiento cuando la ayuda HTML no detalla el JSON raíz).

---

## Resumen

- En la colección **ZetaSoftware REST** (importada desde el ZIP oficial), el recurso **“Comprobantes por Cliente”** define un único método REST: **`RESTComprobantesClienteV1Query`**.
- El **cuerpo del request no es** un objeto raíz plano `{ Connection, Data }`, sino un **envoltorio `QueryIn`** que contiene `Connection` y `Data`.
- La respuesta de ejemplo documentada en Postman usa **`QueryOut`** (no `ComprobantesClienteV1QueryOut` en el ejemplo exportado), con `Response` que incluye **`ListaMovimientos`** (array de comprobantes con `Lineas`, `FormasPago`, etc.).
- Variable de colección **`baseUrl`** = `https://api.zetasoftware.com/rest`, por lo que la URL del request coincide con el patrón público: `https://api.zetasoftware.com/rest/APIs/RESTComprobantesClienteV1Query`.

---

## Origen y artefactos locales

| Elemento | Valor |
|----------|--------|
| Enlace oficial (ZIP) | `https://zetasoftware.info/wp-content/uploads/2025/10/Api-ZetaSoftware-collection_28-10-2025.zip` |
| Documentado también en | `docs/zeta/markdown/zeta-soap-vs-rest-oficial.md` |
| Carpeta local del proyecto | `docs/zeta/postman/` |
| Archivo ZIP descargado | `docs/zeta/postman/Api-ZetaSoftware-collection_28-10-2025.zip` |
| Colección JSON extraída | `docs/zeta/postman/Api ZetaSoftware collection.json` |
| Fecha en nombre del ZIP (proveedor) | 28-10-2025 |

---

## Búsqueda realizada en la colección

Se localizó por nombre de carpeta y método:

- Carpeta: **`Comprobantes por Cliente`** (variante con mayúscula en “Cliente”).
- Request: **`RESTComprobantesClienteV1Query`** → **`REST Service`**.
- Cadenas adicionales pedidas en el brief: **`asoapcomprobantesclientev1`** — **no aparece** en la colección exportada (nombre típico SOAP/WSDL interno; la colección REST usa nombres `REST*` y `QueryIn`).

Otros endpoints cercanos (distinto negocio): carpeta **`Comprobantes`** con **`RESTComprobantesV1Query`** (usa `Page` + `Filters` en `Data`, no es “por cliente”).

---

## methodName exacto (path REST)

`RESTComprobantesClienteV1Query`

---

## URL exacta

Según Postman (variable `baseUrl` + sufijo fijo de la colección):

- **Plantilla:** `{{baseUrl}}/APIs/RESTComprobantesClienteV1Query`
- **Resuelta (valor por defecto de `baseUrl` en la colección):**  
  `https://api.zetasoftware.com/rest/APIs/RESTComprobantesClienteV1Query`

Equivale al patrón ya usado en Copilot cuando `ZETA_API_BASE_URL` es `https://api.zetasoftware.com/rest/APIs` (sin barra final) y se concatena `/${methodName}`.

---

## Headers (request)

Tal como figura en el ítem **REST Service** de Postman:

| Header | Valor |
|--------|--------|
| `Content-Type` | `application/json` |
| `Accept` | `application/json` |

---

## Shape real del request (oficial Postman)

**Raíz JSON:** un único hijo **`QueryIn`**, con **`Connection`** y **`Data`**.

En el esquema exportado, `Connection` incluye placeholders para **`UsuarioCodigo`** y **`UsuarioClave`** además de desarrollador/empresa/`RolCodigo`. En integraciones típicas por credenciales de desarrollador + empresa, esos campos suelen omitirse u omitirse si el gateway los trata como opcionales; **la colección no sustituye la prueba en tenant** — solo fija el contrato nominal del body.

### Ejemplo de request real (estructura de la colección; valores ficticios)

Sustituir `<…>` por credenciales y fechas reales.

```json
{
  "QueryIn": {
    "Connection": {
      "DesarrolladorCodigo": "<string>",
      "DesarrolladorClave": "<string>",
      "EmpresaCodigo": "<string>",
      "EmpresaClave": "<string>",
      "UsuarioCodigo": "<long>",
      "UsuarioClave": "<string>",
      "RolCodigo": "<integer>"
    },
    "Data": {
      "ClienteCodigo": "<string>",
      "Mes": "<integer>",
      "Anio": "<integer>",
      "FechaDesde": "<date>",
      "FechaHasta": "<date>"
    }
  }
}
```

**Campos de negocio en `Data`:** `ClienteCodigo`, `Mes`, `Anio`, `FechaDesde`, `FechaHasta` — mismos conceptos que ya modelaba Copilot, pero **dentro de `QueryIn`**.

---

## Shape real del response (ejemplo “Successful operation” en Postman)

Código HTTP de ejemplo en la colección: **200**. Raíz: **`QueryOut`**, con `Succeed`, `Error`, y `Response` (objeto que contiene **`ListaMovimientos`**: arreglo de ítems con cabecera de comprobante, **`Lineas`** y **`FormasPago`**).

Estructura ilustrativa (placeholders del export; no es un comprobante real):

```json
{
  "QueryOut": {
    "Succeed": "<boolean>",
    "Error": {
      "Code": "<string>",
      "Message": "<string>"
    },
    "Response": {
      "ListaMovimientos": [
        {
          "ComprobanteCodigo": "<integer>",
          "Serie": "<string>",
          "Numero": "<long>",
          "Fecha": "<string>",
          "MonedaCodigo": "<integer>",
          "Cotizacion": "<double>",
          "ClienteCodigo": "<string>",
          "Lineas": [],
          "FormasPago": []
        }
      ],
      "Succeed": "<boolean>",
      "Mensaje": "<string>"
    }
  }
}
```

> **Nota:** el export de Postman a veces duplica flags (`Succeed` / `Mensaje`) bajo `Response` además del nivel `QueryOut`; al implementar parsers conviene seguir el comportamiento real del tenant y el body capturado en logs.

---

## Diferencias respecto a lo que veníamos probando (`flat_Connection_Data`)

| Aspecto | Enfoque previo (Copilot / pruebas) | Contrato oficial Postman |
|---------|-----------------------------------|---------------------------|
| Raíz del JSON | `{ "Connection": …, "Data": … }` | `{ "QueryIn": { "Connection": …, "Data": … } }` |
| Nombre del método REST | Correcto: `RESTComprobantesClienteV1Query` | Igual |
| Headers | `Content-Type` + `Accept` JSON | Igual |
| `Connection` | Solo desarrollador + empresa + `RolCodigo` | Plantilla Postman incluye también `UsuarioCodigo` / `UsuarioClave` |
| Respuesta esperada en docs internas | Énfasis en `ComprobantesClienteV1QueryOut` (WSDL / ayuda) | Ejemplo Postman muestra **`QueryOut`** con `Response.ListaMovimientos` |

La discrepancia **principal** que explica el **HTTP 400** con método correcto es la **falta del wrapper `QueryIn`** en el body raíz, no el `ClienteCodigo` ni el `methodName` en sí.

---

## Implicaciones para Copilot

1. **Transporte:** enviar el body como `{ QueryIn: { Connection, Data } }` para alinear con Postman y con el binding del gateway.
2. **`root_in_key` / env `ZETA_REST_CUSTOMER_VOUCHERS_ROOT_IN`:** el default documentado en código apuntaba a `ComprobantesClienteV1QueryIn`; la colección oficial usa **`QueryIn`**. Cuando se actualice el conector, conviene **parametrizar** `QueryIn` vs nombres WSDL legacy según evidencia en runtime.
3. **Parser:** el contrato en `zeta-customer-vouchers.contract.ts` ya prevé rutas **`QueryOut`** y **`ComprobantesClienteV1QueryOut`**; verificar que la extracción de filas cubra `QueryOut.Response.ListaMovimientos` (y variantes de nombres de ítem si el API devuelve `MovimientoItem` vs objetos anónimos en el arreglo).
4. **Logs / diagnóstico:** etiquetar `body_shape` como algo tipo `query_in_Connection_Data` cuando se migre, para distinguir intentos históricos `flat_Connection_Data`.
5. **Sin cambio en esta tarea:** no se modificó el conector; solo se fijó el contrato en KB para el siguiente cambio de código controlado.

---

## Hallazgo principal (una línea)

**El request oficial de “Comprobantes por cliente” en la colección Postman de Zeta es `POST …/RESTComprobantesClienteV1Query` con JSON raíz `QueryIn` → `{ Connection, Data }`, no `{ Connection, Data }` en la raíz.**

---

## Request exacto encontrado (referencia)

- **Método HTTP:** `POST`
- **URL:** `https://api.zetasoftware.com/rest/APIs/RESTComprobantesClienteV1Query`
- **Body (forma exacta):** objeto con clave **`QueryIn`**; dentro, **`Connection`** y **`Data`** con los campos listados arriba.
- **Headers:** `Content-Type: application/json`, `Accept: application/json`

---

## Confirmación

Archivo creado: **`docs/zeta/markdown/zeta-comprobantes-cliente-postman-oficial.md`**.

Artefactos de colección en repo: **`docs/zeta/postman/`** (ZIP + `Api ZetaSoftware collection.json`).
