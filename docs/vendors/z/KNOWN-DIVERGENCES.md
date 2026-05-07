# Zeta API — Known Payload Divergences

Diferencias confirmadas entre documentacion oficial de Zeta y payloads reales del tenant.

Cada entrada incluye: fecha, endpoint, shape documentado, shape real, impacto, parser aplicado y compatibilidad mantenida.

Actualizar este archivo cada vez que se detecte una nueva divergencia.
Nunca adaptar un parser sin documentarlo aqui primero.

---

## DIV-001 · RESTFacturaClienteV4VentasDetalladas

**Fecha observada:** 2026-05-07
**Endpoint:** `RESTFacturaClienteV4VentasDetalladas`
**Estado:** CONFIRMADO — parser adaptado y en produccion

### Shape documentado (docs/vendors/z/invoices.md)

```json
{
  "VentasDetalladasOut": {
    "Succeed": true,
    "Response": [ ...rows ]
  }
}
```

O con wrapper ListaMovimientos:

```json
{
  "VentasDetalladasOut": {
    "Succeed": true,
    "Response": {
      "ListaMovimientos": [ ...rows ]
    }
  }
}
```

### Shape real del tenant (validado via logs)

```json
{
  "VentasDetalladasOut": {
    "Succeed": true,
    "Response": {
      "VentasDetalladas": [ ...rows ]
    }
  }
}
```

Shape detectado: `VentasDetalladasOut.Response.VentasDetalladas:array`

### Campos confirmados en filas

| Campo | Tipo observado | Descripcion |
|---|---|---|
| FacturaSerie | string | Serie del comprobante (ej: "A") |
| FacturaNumero | string | Numero del comprobante (ej: "2884") |
| ClienteCodigo | string | Codigo del cliente en Zeta |
| MonedaCodigo | string numerica | "1" = UYU, "2" = USD |
| MonedaSimbolo | string display | "$" = UYU, "U$S" = USD |

### Impacto del mismatch

- Parser original retornaba `null` para shape no reconocido
- `extractVentasRows()` fallaba con `error_code: "zeta_shape"`
- Pipeline de currency enrichment fallaba para las 62 facturas de abril 2026
- `currency_code` quedaba NULL en `proto_invoices` sin correr enrichment

### Parser aplicado

Archivo: `lib/integrations/zeta/zeta-ventas-detalladas-fetch.ts`
Funcion: `extractVentasRowsInternal()`

Cambios:
- Reemplazo de `extractVentasRows()` por `extractVentasRowsInternal()` con resultado tipado `{ rows, shape }`
- Helper `firstArrayIn(obj)` que busca arrays por lista de claves priorizadas
- `VentasDetalladas` agregada a lista de claves priorizadas
- 6 niveles de fallback en orden:
  1. Array en raiz
  2. `VentasDetalladasOut.Response` como array
  3. `VentasDetalladasOut.Response` como objeto → `firstArrayIn()`
  4. `VentasDetalladasOut.Data` / `Result` → idem
  5. `VentasDetalladasOut` → cualquier clave array directa
  6. Cualquier clave del root con array (ultimo recurso)
- Logging diagnostico: `kind: "ventas_detalladas_shape_detected"` con `detected_shape`, `rows_detected`, `shape_summary`

### Compatibilidad mantenida

| Shape | Estado |
|---|---|
| Root array directo | Soportado |
| `VentasDetalladasOut.Response` array | Soportado |
| `VentasDetalladasOut.Response.ListaMovimientos` | Soportado |
| `VentasDetalladasOut.Response.VentasDetalladas` | Soportado (nuevo) |
| `VentasDetalladasOut.Response.*` cualquier clave array | Soportado (nuevo) |
| `QueryOut.*` familia | Soportado |
| `RESTFacturaClienteV4VentasDetalladas` como outer key | Soportado |

### Resultado post-fix

- `invoices_updated`: 62 (abril 2026)
- `currency_code`: 29 USD + 33 UYU
- Moneda mostrada correctamente en tabla y sidebar

---

## DIV-002 · RESTRecibosCobranzaV2QueryComprobantes — response shape

**Fecha observada:** 2026-05-07
**Endpoint:** `RESTRecibosCobranzaV2QueryComprobantes`
**Estado:** CONFIRMADO — parser adaptado y validado con tests

### Shape documentado en `0165-…recibo-de-cobro` (ayuda Zeta)

La página de ayuda enumera los campos devueltos (`RegistroId`, `Fecha`, `Total`, `IsLastPage`, etc.) pero NO especifica el wrapper exterior. Por convención del método genérico `0134` se asumía `QueryOut.Response[]`.

### Shape oficial Postman (`docs/zeta/postman/Api ZetaSoftware collection.json`, item `RESTRecibosCobranzaV2QueryComprobantes`)

```json
{
  "QueryComprobantesOut": {
    "Succeed": true,
    "Response": [
      { "RegistroId": "<long>", "ComprobanteCodigo": "<integer>", "...": "..." }
    ]
  }
}
```

Wrapper específico: `QueryComprobantesOut` (no `QueryOut`).

### Shape real del tenant (validado vía logs piloto enero 2026)

Coincide con Postman: outer = `QueryComprobantesOut`, array bajo `Response`. HTTP 200 con `payload_size_bytes ≈ 33707` para enero. El parser anterior solo aceptaba `QueryOut.Response` y `<root-array>`, por lo que el response disparaba `code: "zeta_shape"` con mensaje *"HTTP OK pero cuerpo no coincide con QueryOut.Response[] ni array raíz documentado."*

### Impacto del mismatch

- `isZetaCollectionReceiptsQueryResponse(raw)` retornaba `false` para todo response real del endpoint.
- `extractZetaCollectionReceipts(raw)` retornaba `[]` y loggeaba `zeta_collection_receipts_contract`.
- Pipeline `syncZetaCollectionReceipts` no llegaba a normalizar ninguna fila (0 procesadas, 1 error).
- Bloqueo total del piloto Recibos enero 2026 → no se persistía nada en `proto_receipts`.

### Parser aplicado

Archivo: `lib/integrations/zeta/contracts/zeta-collection-receipts.contract.ts`

Cambios:

- Extender `OUTER_NAMES` para incluir `QueryComprobantesOut` / `queryComprobantesOut` además de `QueryOut` / `queryOut`.
- Extender claves de array dentro del outer (`RESPONSE_KEYS`): `Response`, `Recibos`, `Comprobantes`, `Items`, `Data`, `Result` (case-insensitive) — alineado al patrón DIV-001 ventas detalladas.
- Nueva función `findRows(data)` que retorna `{ rows, path }` con prioridad:
  1. Array raíz directo (`<root-array>`)
  2. `QueryComprobantesOut.Response[]` (Postman, real tenant)
  3. `QueryOut.Response[]` (legacy `0134`)
  4. Cualquier outer conocido con primer array bajo claves prioritarias
- Diagnóstico read-only `summarizeZetaCollectionReceiptsResponseShape(raw)` que expone:
  `typeof_root`, `is_array_root`, `top_level_keys`, `outer_key_detected`,
  `outer_keys`, `array_path_detected`, `array_paths_detected[]`,
  `rows_detected`, `first_item_preview`, `first_item_keys`,
  `has_registro_id_first_item`.
- `readZetaCollectionReceiptsQueryOutFlags` lee `IsLastPage` y `TotalRegistros` del outer detectado (cualquiera de los nombres soportados).
- Logging estructurado `kind: "zeta_receipts_raw_response"` agregado en el fetch (`zeta-collection-receipts-fetch.ts`); siempre se imprime (incluido caso shape no detectado) para trazar futuras divergencias sin volver a tocar código.

### Compatibilidad mantenida

| Shape | Estado |
|---|---|
| `QueryOut.Response[]` (legacy 0134) | Soportado |
| `QueryComprobantesOut.Response[]` (Postman + tenant real) | Soportado (nuevo) |
| `QueryComprobantesOut.Recibos[]` / `.Items[]` / `.Data[]` / `.Result[]` | Soportado (nuevo, defensivo) |
| Array raíz | Soportado |
| `Succeed=false` con mensaje | Soportado a nivel HTTP/log (el contrato no lo emite como fila) |
| Filas sin `RegistroId` | Rechazadas (log `zeta_collection_receipts_contract`) |

### Validación

- `npx tsc --noEmit`: 0 errores.
- `npx vitest run`: tests del contract `zeta-collection-receipts.contract.test.ts` cubren los 4 shapes + rechazos defensivos.
- Sin cambios en DB, mapper, pipeline, UI, persistence, reconciliation, balances.

### Resultado post-fix esperado

Piloto enero 2026 → response `QueryComprobantesOut.Response[]` se reconoce como `array_path_detected = "QueryComprobantesOut.Response"`, `rows_detected > 0`, mapper recibe filas, pipeline persiste sin tocar facturas.

---

## Plantilla para nuevas divergencias

Copiar y completar al detectar una nueva divergencia.

```
## DIV-NNN · {EndpointName}

**Fecha observada:** AAAA-MM-DD
**Endpoint:** `{MethodName}`
**Estado:** PENDIENTE | CONFIRMADO | RESUELTO

### Shape documentado

### Shape real del tenant

### Campos confirmados en filas

### Impacto del mismatch

### Parser aplicado

### Compatibilidad mantenida

### Resultado post-fix
```
