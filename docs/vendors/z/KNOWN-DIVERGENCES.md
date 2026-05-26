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

## DIV-003 · RESTContactosV3Query — response shape

**Fecha observada:** 2026-05-09
**Endpoint:** `RESTContactosV3Query`
**Estado:** CONFIRMADO — parser adaptado con retrocompat y tests

### Shape asumido originalmente

```json
{
  "QueryOut": {
    "Contactos": {
      "Contacto": [ { "Codigo": "C-100", "Nombre": "...", ... } ]
    }
  }
}
```

### Shape real (Postman oficial + tenant real)

```json
{
  "QueryOut": {
    "Succeed": true,
    "IsLastPage": true,
    "Response": [
      { "Codigo": "C-100", "Nombre": "...", "RazonSocial": "...", "Celular": "...", ... }
    ]
  }
}
```

Wrapper exterior: `QueryOut` (igual). Diferencia: el array de contactos viene en `QueryOut.Response[]`, no en `QueryOut.Contactos.Contacto[]`.

### Campos confirmados en filas (Response[])

| Campo | Tipo | Descripción |
|---|---|---|
| Codigo | string | Código único del contacto |
| Nombre | string | Nombre personal |
| RazonSocial | string | Razón social / empresa |
| RUT | string | Documento de identidad |
| Documento | string | Documento (idem RUT) |
| Email1 | string | Email primario |
| Email2 | string | Email secundario |
| Telefono | string | Teléfono fijo |
| Celular | string | Teléfono celular |
| EsCliente | "S"/"N" | Flag cliente |
| EsProveedor | "S"/"N" | Flag proveedor |

### Impacto del mismatch

- El fetch original asumía `QueryOut.Contactos.Contacto[]`; con el shape real devolvía `[]` (extracción vacía).
- El pipeline de contactos podría no haber insertado ningún contacto en un tenant real antes de este fix.

### Parser aplicado

Archivo: `lib/integrations/zeta/contracts/zeta-contacts.contract.ts`

Prioridad de extracción implementada:
1. `QueryOut.Response[]` — Postman oficial + tenant real **(primario)**
2. `QueryOut.Contactos[]` — array directo (variante defensiva)
3. `QueryOut.Contactos.Contacto[]` — shape asumido original (retrocompat)
4. `QueryOut.Contactos.Contacto` (objeto único) — normalizado a array de 1

Funciones exportadas: `isZetaContactsResponse`, `extractZetaContacts`, `readZetaContactsQueryOutFlags`, `summarizeZetaContactsResponseShape`.

### Compatibilidad mantenida

| Shape | Estado |
|---|---|
| `QueryOut.Response[]` (Postman + tenant real) | Soportado (primario) |
| `QueryOut.Contactos[]` (array directo) | Soportado (defensivo) |
| `QueryOut.Contactos.Contacto[]` (shape original asumido) | Soportado (retrocompat) |
| `QueryOut.Contactos.Contacto` (objeto único) | Soportado (normalizado) |
| `QueryOut.Response[]` vacío | Válido (0 contactos) |

### Resultado post-fix

- 8 casos de test en `zeta-contacts.contract.test.ts` cubren todos los shapes.
- `tsc --noEmit`: 0 errores.
- Pipeline `syncZetaContactsIncremental` usa el contrato para paginar y upsert.

---

## NOTE-001 · Borradores CFE en exports Zeta (no es divergencia de API)

**Fecha observada:** 2026-05-07
**Endpoint:** No aplica — aplica a exports Excel `VentasExport.xlsx` / reconciliadores
**Estado:** DOCUMENTADO — filtro implementado en reconciliadores

### Descripción

Los exports Excel de Zeta (ej. `RecibosCobranzaWWExport-*.xlsx`, `VentasExport-*.xlsx`) incluyen filas con `Numero = 0` que corresponden a **borradores CFE no emitidos** (campo `Emitida = "N"`, `Estado DGI = ""`). La API `RESTComprobantesClienteV1Query` y otros endpoints de sync **no devuelven** estos borradores, por lo que la reconciliación Excel↔DB arrojaría falsos positivos si no se filtran.

### Regla de filtro

```
Excluir fila si: Numero <= 0 OR Emitida = "N"
```

Aplica en todo reconciliador que compara datos Zeta (API/DB) contra exports Excel del tenant.

### Caso concreto validado

- `Prestis S.A.S.`, 04-mar-2026, UYU 9.760, `Numero=0`, `Emitida="N"`, `Estado DGI=""` → borrador CFE.
- Excluir del universo "Excel emitido" reduce el universo de facturas de 282 → 281 (o similar según período).

### Detalle

Documentado originalmente en `temp-audits/audit-prestis-numero-0.md` §6.3.

---

## DIV-CONT-001 · `proto_invoices.due_date` sintético (issue_date + 30 días)

**Fecha observada:** 2026-05-11
**Fecha mitigación:** 2026-05-12 (ZETA-08 — pipeline de cuotas + due_date real)
**Endpoint origen:** `RESTFacturaClienteV4VentasDetalladas` / `RESTFacturaClienteV4QuerySaldosPendientes`
**Estado:** MITIGADO POR ZETA-08 — `due_date` se migra a real (`zeta_cuotas_v1`) cuando hay cuota; fallback sintético si la factura aún no tiene cuotas sincronizadas

> **Actualización 2026-05-12:** ZETA-08 entrega el pipeline `proto_invoice_installments` + `due_date_source`:
>
> - Tabla nueva `proto_invoice_installments` persiste `CuotaVencimiento` real desde `RESTCuotasV1QueryCliente`.
> - Cron `zeta-sync-cuotas` (cada 6 h) y endpoint manual `/api/zeta/sync-installments-backfill` actualizan `proto_invoices.due_date` con `min(cuota_vencimiento de cuotas con saldo > 0)` y marcan `due_date_source = 'zeta_cuotas_v1'`.
> - El mapper voucher y el pipeline de saldos escriben `due_date_source = 'synthetic_30d'` y NUNCA pisan un `due_date` real (guard `buildSaldosDueDatePatch`).
> - Aging del motor (`lib/copilot-financial-reconciliation.ts`) usa el `due_date` real con fallback sintético y emite `agingSource` per-currency (`real` / `synthetic` / `mixed` / `none`).
>
> Cada factura mantendrá la divergencia DIV-CONT-001 únicamente hasta que el primer run del cron de cuotas la procese.

### Origen del dato

`lib/integrations/zeta/zeta-customer-vouchers-mapper.ts:488`:

```ts
const due = addDaysIso(issue, 30);
```

`due_date` se calcula como **`issue_date + 30 días`** para TODAS las facturas que vienen desde Zeta. No se preserva la `FechaVencimiento` real (cuando Zeta la informa).

### Impacto en cartera contable

- **Reporte "Vencimiento de Cuotas"** (Zeta): puede divergir para clientes con condiciones de pago ≠ 30 días (15d, 60d, contado, etc.).
  - Total y saldo siguen siendo correctos.
  - `días de atraso` puede diferir del PDF.
- **Aging (Análisis de Saldos)** en `/copilot/cartera`: actualmente se calcula por `issue_date − cutoff` (no por `due_date`), así que esta divergencia NO afecta los buckets aging del sistema interno. Sí afectaría si en el futuro pasamos aging a `due_date`.
- **Cards "Pendiente al corte"**: no afectadas (no usan `due_date`).
- **Script audit `audit-zeta-vencimiento-cuotas.mjs`**: incluye disclaimer al inicio y al final indicando esta limitación.

### Solución implementada (ZETA-08, 2026-05-12)

1. ✅ `RESTCuotasV1QueryCliente` confirmado live (DIV-CONT-009 resuelto): devuelve `CuotaVencimiento` real por cuota + saldo + moneda.
2. ✅ Tabla `proto_invoice_installments` (SQL `supabase/zeta-08-01-proto-invoice-installments.sql`) con RLS por tenant y unique `(workspace, registro_id, cuota_numero)`.
3. ✅ Pipeline `lib/integrations/zeta/zeta-installments-pipeline.ts`:
   - Linkea cuota ↔ factura por `RegistroId`.
   - Upsert idempotente.
   - Actualiza `proto_invoices.due_date` y `due_date_source = 'zeta_cuotas_v1'` con `min(cuota_vencimiento)` de cuotas con saldo > 0.
4. ✅ Cron `app/api/cron/zeta-sync-cuotas/route.ts` cada 6 h + endpoint backfill manual + script `scripts/zeta-backfill-installments.mjs`.
5. ✅ `proto_invoices.due_date_source` (`synthetic_30d` | `zeta_cuotas_v1`) migrado en `supabase/zeta-08-02-proto-invoices-due-date-source.sql`.
6. ✅ Aging del motor financiero usa `due_date` real cuando `due_date_source = 'zeta_cuotas_v1'`; fallback sintético en otro caso. Reporta `agingSource` per-currency.

Hasta que el cron de cuotas haya recorrido a TODOS los clientes activos al menos una vez, las facturas no-procesadas seguirán mostrando `due_date_source = 'synthetic_30d'`. Una vez convergido, DIV-CONT-001 queda como divergencia histórica residual.

---

## DIV-CONT-002 · Notas de crédito y saldos pendientes en Estado de Cuenta PDF

**Fecha observada:** 2026-05-11
**Última actualización:** 2026-05-26 — RESUELTO para `ledgerMode: true`
**Estado:** RESUELTO en PDF/ledger — pendiente para motor de reconciliación

### Problema original

Dos causas hacían que el PDF mostrara saldo incorrecto para El País S.A.:

1. **Registros "saldos pendientes"** (`category = "Zeta / saldos pendientes"`) del pipeline
   `RESTFacturaClienteV4QuerySaldosPendientes` se incluían como movimientos contables reales.
   Estos representan el saldo vivo sincronizado, NO comprobantes emitidos.

2. **Notas de crédito** (CFE tipo 181/182) almacenadas en `proto_invoices` eran tratadas
   como facturas (Debe), cuando deben reducir el saldo (Haber).

**Caso documentado El País UYU (corregido):**
- Copilot antes: $ 93.208 | Zeta: $ 25.742 | Diferencia: $ 67.466
- Detalle: saldo pendiente 2574 (41.480) + saldo pendiente 2674 (8.662) + NC A391 dirección incorrecta (2 × 8.662 = 17.324) = 67.466 ✓

### Solución implementada (2026-05-26)

En `lib/copilot-client-account-statement.ts`, cuando `ledgerMode: true`:

- **Filtro saldos pendientes**: se omiten filas con `category === "Zeta / saldos pendientes"`.
  Solo aplica en `ledgerMode: true` para no afectar el modo operacional.

- **Detección de NCs por CFE tipo**: se lee `zeta_metadata.zeta_customer_voucher_v1.cfe_tipo`.
  Si el valor es 181 (e-NC e-Factura) o 182 (e-NC e-Ticket), el movimiento se clasifica
  como `kind: "credit_note"` con `credit = total, debit = 0`.
  `hasCreditNoteSupport` pasa a `true` cuando se detectan NCs reales.

### Pendiente

- `lib/copilot-financial-reconciliation.ts` (`pendingAtCutoff`, `openingBalance`) aún NO resta NCs.
  Divergencias en esos campos son esperadas cuando el cliente tiene NCs en el período.
- La detección por `cfe_tipo` aplica solo para el tenant que escribe ese campo vía el pipeline
  de customer vouchers. Validar en otros tenants si la NC no aparece correctamente.

---

## DIV-CONT-003 · `balance_amount` es snapshot vivo, no histórico al `Hasta`

**Fecha observada:** 2026-05-11
**Endpoint origen:** `RESTFacturaClienteV4QuerySaldosPendientes` (cron cada 3h)
**Estado:** CONFIRMADO — limitación documentada

### Origen del problema

`proto_invoices.balance_amount` se actualiza cada 3 horas por el cron `app/api/cron/zeta-sync-saldos/route.ts` con el saldo **vigente al momento de la sincronización** (= el "ahora" de Zeta). No hay snapshot histórico de saldo por fecha de corte.

### Impacto en cartera contable

Cuando el usuario filtra `/copilot/cartera` por un período **pasado** (ej. `Hasta = ayer`):
- **`pendingAtCutoff`** muestra el balance AL MOMENTO DE LA ÚLTIMA SYNC, no el saldo real al cierre del `Hasta`.
- Si una factura del período se cobró DESPUÉS del `Hasta`, ya no aparece como pendiente (subestima la cartera del corte).
- Si una factura PRE-período se cobró DESPUÉS del `Hasta`, idem.

### Mitigaciones

1. **UI**: tooltip "Saldo al corte = saldo actual sincronizado (cron cada 3 h)" en la card "Pendiente al corte" (TODO).
2. **Período actual** (`Hasta = hoy`): la divergencia es máxima 3h (frecuencia del cron). Aceptable.
3. **Período pasado**: el usuario debe entender que muestra el snapshot vivo, no el cierre histórico. Para auditoría exacta de cierre, exportar desde Zeta directamente.

### Solución pendiente (largo plazo)

- Crear tabla `proto_invoice_balance_snapshots` que persista `(invoice_id, snapshot_date, balance_amount)` con frecuencia diaria.
- Motor lee del snapshot más cercano a `periodEnd` cuando éste es pasado.
- No prioritario salvo que el usuario opere muy a menudo con cortes históricos.

---

## DIV-CONT-004 · `openingBalance` depende de recibos pre-período sincronizados

**Fecha observada:** 2026-05-11
**Endpoint origen:** `RESTRecibosCobranzaV2QueryComprobantes` (pipeline de recibos)
**Estado:** ACEPTADO — limitación dependiente de cobertura de sync

### Origen del problema

El motor reconstruye `openingBalance` (saldo anterior al `Desde`) como:

```
openingBalance = Σ(invoices.total_amount con issue_date < Desde) − Σ(receipts.amount con receipt_date < Desde)
```

Si faltan recibos pre-período (porque el backfill no llegó tan atrás, o porque ese recibo todavía no se sincronizó), `openingBalance` queda **inflado**: el cliente parece tener más deuda anterior de la que realmente tiene.

### Mitigaciones

1. Verificar cobertura de `proto_receipts` para fechas anteriores al `Desde` que el usuario elija.
2. Para auditorías serias, usar el script `audit-zeta-estado-cuenta.mjs` que muestra todos los movimientos pre-período y permite comparar con el PDF de Zeta.
3. Si una validación arroja divergencia significativa, ejecutar backfill manual de recibos.

### Solución pendiente

- Telemetría: detectar cuando `openingBalance` parece anormalmente alto y emitir warning en UI ("posible falta de recibos pre-período sincronizados").

---

## DIV-CONT-005 · `proto_receipts.invoice_id` siempre null — Aplicaciones recibo↔factura ausentes

**Fecha observada:** 2026-05-11
**Endpoints relevantes:** `RESTRecibosCobranzaV2QueryComprobantes`, `RESTRecibosCobranzaV2Data`, `RESTRecibosCobranzaV2Load`, `RESTRecibosCobranzaV2QueryPendientes`
**Estado:** CONFIRMADO — bloqueado por API Zeta

### Hallazgo

Tras revisar exhaustivamente los **260 endpoints REST oficiales** documentados en `docs/zeta/postman/Api ZetaSoftware collection.json`, **ningún endpoint** expone el detalle de qué factura(s) cancela cada recibo. La doc oficial (`docs/zeta/markdown/0165-…recibo-de-cobro.md`, línea 142) confirma:

> "Este método [Save] no asigna formas de pago. **Para ello debe utilizarse la API de facturas de clientes.**"

Pero la API de facturas (`RESTFacturaClienteV4*`) tampoco expone aplicaciones: solo trae cabecera, líneas de producto, `CondicionPagoCodigo` y saldos pendientes globales.

### Impacto

- `proto_receipts.invoice_id` siempre `null`.
- Los recibos no pueden imputarse 1:1 a facturas.
- `lib/copilot-client-account-statement.ts` reconstruye Estado de Cuenta como Σ(facturas) − Σ(recibos) por moneda — equivalente al saldo final, pero **no muestra qué recibo canceló cuál factura**.
- Imposible calcular diferencias de cambio exactas por factura.

### Mitigación

1. Documentado en `docs/zeta-financial-coverage-audit.md`.
2. Documentado en `docs/zeta-missing-financial-endpoints.md` (matriz de búsqueda exhaustiva).
3. Conservar `proto_receipts.zeta_metadata` con el `RegistroId` del recibo para correlaciones futuras si Zeta llegara a exponer aplicaciones.
4. **TODO técnico:** consultar a Zeta vía soporte si existe un endpoint no documentado en Postman o si está en roadmap.

### Solución pendiente

- Pedir a Zeta soporte un endpoint que exponga las aplicaciones de un recibo (campos esperados: `FacturaId`, `Serie`, `Numero`, `ImporteAplicado`, `Cotizacion`).
- Mientras tanto, **no inferir aplicaciones**: cualquier algoritmo que vincule recibos a facturas sin dato oficial introduce ruido en el ledger.

---

## DIV-CONT-006 · Vencimiento real disponible vía `RESTCuotasV1QueryCliente`

**Fecha observada:** 2026-05-11
**Fecha implementación end-to-end:** 2026-05-12 (ZETA-08)
**Endpoint:** `RESTCuotasV1QueryCliente` (`asoapcuotasv1`)
**Estado:** ✅ **IMPLEMENTADO** — tabla `proto_invoice_installments` + pipeline + cron 6h + backfill manual + tests + aging real activos en `main`.

> **Actualización 2026-05-11 (tarde):** Tras el bug de ruta documentado en DIV-CONT-009 (RESUELTO), el endpoint fue re-probado live contra Acquagarden (`ClienteCodigo=2`) y respondió HTTP 200 con shape esperado. Shape live coincide 1:1 con el ejemplo de abajo: `RegistroId=2527`, `CuotaVencimiento=2026-04-10`, `CuotaSaldo=368.26`, `CuotaTotal=678.32`, `MonedaCodigo=2`. Validación cruzada contra PDF Zeta "Comprobantes Pendientes — ACQUAGARDEN" exacta (A2874 saldo USD 368,26).

### Contexto

`proto_invoices.due_date` se calcula como `issue_date + 30 días` (DIV-CONT-001). Esto es sintético y NO refleja condiciones reales (cuotas 60/90/120, planes de pago, etc.).

### Hallazgo

`RESTCuotasV1QueryCliente` devuelve, por cliente:

```json
{
  "QueryClienteOut": {
    "Succeed": true,
    "Response": [
      {
        "RegistroId": 1254,
        "ClienteCodigo": "C0001",
        "CuotaNumero": 3,
        "CuotaVencimiento": "2026-03-20",
        "MonedaCodigo": 1,
        "CuotaTotal": 15000.0,
        "CuotaSaldo": 5000.0,
        "EsEntregaInicial": "N"
      }
    ],
    "IsLastPage": true
  }
}
```

**Clave:** `RegistroId` linkea con `proto_invoices.zeta_metadata.zeta_customer_voucher_v1.zeta_registro_id`, así que se puede asociar cuotas con facturas locales sin ambigüedad.

### Implementación parcial entregada

- `lib/integrations/zeta/contracts/zeta-installments.contract.ts` — contract validador + paginación + summary.
- `lib/integrations/zeta/zeta-installments-fetch.ts` — fetch HTTP + logging.
- `lib/integrations/zeta/zeta-installments-mapper.ts` — mapper puro a `ProtoInstallmentInput`.
- Tests: 60 pruebas unitarias (incluye edge cases es-UY, ISO con hora, S/N booleans, MonedaCodigo desconocido).
- Audit script `temp-audits/audit-zeta-due-date-shape.mjs` — valida shape live antes de wirear el pipeline.

### Plan de migración (ENTREGADO 2026-05-12)

1. ✅ Audit live confirmó shape — `temp-audits/audit-zeta-cuotas-path-reprobe.mjs` (DIV-CONT-009 resuelto).
2. ✅ Tabla `proto_invoice_installments` (SQL `supabase/zeta-08-01-proto-invoice-installments.sql`) con UNIQUE `(workspace_company_id, zeta_registro_id, cuota_numero)`, RLS + trigger fail-closed.
3. ✅ Pipeline orquestador `lib/integrations/zeta/zeta-installments-pipeline.ts` + linker batch `lib/integrations/zeta/zeta-installments-link.ts`.
4. ✅ Cron `app/api/cron/zeta-sync-cuotas/route.ts` cada 6 h + anti-overlap + retry.
5. ✅ Backfill manual `app/api/zeta/sync-installments-backfill/route.ts` + script `scripts/zeta-backfill-installments.mjs`.
6. ✅ Migración `proto_invoices.due_date_source` + protección de `due_date` en pipeline de saldos (`buildSaldosDueDatePatch`).
7. ✅ Aging real con fallback en `lib/copilot-financial-reconciliation.ts` + `agingSource` per-currency + 12 tests dedicados.
8. ⏳ Validación live contra PDFs Zeta ("Comprobantes Pendientes", "Vencimiento de Cuotas") — bloqueante del rollout productivo. Ver FASE 9 de TASKS.
6. Migrar `due_date` sintético: `proto_invoices.due_date = min(cuota_vencimiento)` con flag `due_date_source = 'zeta_cuotas_v1'`.
7. Aging recalculado con `due_date` real (resuelve DIV-CONT-001).

---

## DIV-CONT-007 · Estado de cuenta oficial / saldos a fecha histórica — sin endpoint REST

**Fecha observada:** 2026-05-11
**Estado:** CONFIRMADO — bloqueado por API Zeta

### Hallazgo

Tras revisar los 260 endpoints REST oficiales:

- **No existe** `RESTEstadoCuenta*`, `RESTCuentaCorriente*`, `RESTQueryEstadoCuenta` ni equivalente que devuelva: saldo anterior, debe, haber, saldo final por cliente y moneda.
- **No existe** un parámetro `FechaCorte` / `AsOf` en `RESTFacturaClienteV4QuerySaldosPendientes`: siempre devuelve "ahora".

### Alternativas evaluadas

- `RESTAsientoV1Lista` — asientos contables. Puede reconstruir movimientos **si** el cliente tiene cuenta contable propia mapeada en el plan de cuentas. Requiere POC adicional. Documentado en `temp-audits/audit-zeta-account-statement-endpoints.mjs`.
- Reconstrucción local con `proto_invoices` + `proto_receipts` (lo que ya hace `lib/copilot-client-account-statement.ts`). Limitación: no detecta imputaciones recibo→factura (ver DIV-CONT-005).

### Acción

- Mantener reconstrucción local. Documentado en `docs/zeta-missing-financial-endpoints.md`.
- Si en el futuro se necesita Estado de Cuenta oficial, evaluar implementar pipeline basado en `RESTAsientoV1Lista` + `RESTPlanCuentasV2Query` (proyecto en sí mismo).

---

## DIV-CONT-008 · Diferencias de cambio — sin endpoint REST oficial, calculables localmente

**Fecha observada:** 2026-05-11
**Estado:** DOCUMENTADO — módulo futuro, no implementado

### Hallazgo

- **No existe** `RESTDiferenciaCambio*` ni equivalente que devuelva FX differences precomputadas.
- **Sí existen** las piezas para calcularlas localmente:
  - `RESTMonedasCotizacionesV1Query` — cotizaciones por fecha (`CotizacionComercial`, `CotizacionFiscal`).
  - `RESTRecibosCobranzaV2Load.Cotizacion` — cotización aplicada al recibo.
  - `RESTFacturaClienteV4VentaDetallada.Cotizacion` — cotización aplicada a cada línea de factura.

### Cálculo derivable

```
dif_cambio_factura = Total_factura × (Cotizacion_recibo − Cotizacion_factura)
```

### Bloqueo dependiente

El cálculo factura-por-factura **requiere primero resolver DIV-CONT-005** (aplicaciones recibo↔factura). Sin esa información, solo es posible un FX agregado por cliente/período, que no coincide con la contabilidad oficial Zeta.

### Acción

- Audit script `temp-audits/audit-zeta-exchange-differences-shape.mjs` — valida shape live de cotizaciones, factura.Cotizacion y recibo.Cotizacion.
- Documentado en `docs/zeta-missing-financial-endpoints.md`.
- **NO implementar** UI ni tabla hasta que se desbloquee DIV-CONT-005 o se obtenga un endpoint dedicado de Zeta para FX differences.

---

## DIV-CONT-009 · `RESTCuotasV1QueryCliente` — falso 404 por ruta incorrecta en audit script *(RESUELTO 2026-05-11)*

**Fecha observada:** 2026-05-11 (mañana)
**Fecha resuelta:** 2026-05-11 (tarde, tras revalidación con colección Postman `ZetaSoftware-REST-10-2025.json`)
**Endpoint:** `RESTCuotasV1QueryCliente`
**Estado:** ✅ **RESUELTO** — no era bloqueo Zeta, era bug del audit script anterior.

### Causa raíz del 404 inicial

El audit script `temp-audits/audit-zeta-due-date-shape.mjs` construyó la URL como:

```js
const zetaBase = process.env.ZETA_BASE_URL || "https://api.zetasoftware.com";
const url = `${zetaBase.replace(/\/+$/, "")}/APIs/RESTCuotasV1QueryCliente`;
```

`.env.local` **no define `ZETA_BASE_URL`**, así que cayó al default sin `/rest`. URL final probada: `https://api.zetasoftware.com/APIs/RESTCuotasV1QueryCliente` → HTTP 404 (página HTML genérica de Zeta).

Mientras tanto, el código de producción (`lib/integrations/zeta/zeta-config.ts` línea 4) usa:

```ts
const DEFAULT_BASE = "https://api.zetasoftware.com/rest/APIs";
```

— con el segmento `/rest/` que la colección oficial Postman 10-2025 confirma como variable `baseUrl = "https://api.zetasoftware.com/rest"` y URL final `{{baseUrl}}/APIs/{method}` = `https://api.zetasoftware.com/rest/APIs/{method}`.

### Re-prueba live controlada (2026-05-11)

Script: `temp-audits/audit-zeta-cuotas-path-reprobe.mjs --cliente-codigo 2`

| Variante | URL probada | HTTP | Body |
|---|---|---|---|
| A) ruta del audit anterior | `https://api.zetasoftware.com/APIs/RESTCuotasV1QueryCliente` | 404 | HTML genérico "404 Not found" |
| B) ruta canónica Postman | `https://api.zetasoftware.com/rest/APIs/RESTCuotasV1QueryCliente` | **200** | `QueryClienteOut.Response[]` con 2 cuotas reales |

### Shape live confirmado para Acquagarden (`ClienteCodigo=2`)

```json
{
  "QueryClienteOut": {
    "IsLastPage": true,
    "Response": [
      {
        "ClienteCodigo": "2",
        "CuotaNumero": 1,
        "CuotaSaldo": "368.26",
        "CuotaTotal": "678.32",
        "CuotaVencimiento": "2026-04-10",
        "EsEntregaInicial": "",
        "MonedaCodigo": 2,
        "RegistroId": "2527"
      }
    ]
  }
}
```

**Validación cruzada contra PDF Zeta "Comprobantes Pendientes — ACQUAGARDEN":**

- PDF: factura A2874 saldo USD 368,26, factura A2926 saldo USD 678,32, total cliente USD 1.046,58.
- API live `Cuotas`: `RegistroId=2527, CuotaSaldo=368.26, CuotaTotal=678.32, MonedaCodigo=2 (USD)`.
- **Coincidencia 1:1**: A2874 ↔ RegistroId 2527, saldo idéntico (368.26 USD).
- `CuotaVencimiento=2026-04-10` es la fecha REAL emitida por Zeta (no `issue_date+30`).

### Wrapper confirmado

| Item | Valor |
|---|---|
| Method | `POST` |
| URL | `https://api.zetasoftware.com/rest/APIs/RESTCuotasV1QueryCliente` |
| Body root | `QueryClienteIn` |
| Body interno | `{ Connection, Data: { Page, Filters: { CuotaVencimientoDesde, CuotaVencimientoHasta, CuotaSaldoDesde, CuotaSaldoHasta, ClienteCodigo? } } }` |
| Response root | `QueryClienteOut.Response[]` con `IsLastPage` |
| Campos por fila | `RegistroId, ClienteCodigo, CuotaNumero, CuotaTotal, CuotaSaldo, CuotaVencimiento, MonedaCodigo, EsEntregaInicial` |

Coincide 1:1 con el code path `lib/integrations/zeta/zeta-installments-fetch.ts` (constante `ZETA_INSTALLMENTS_ROOT_IN_KEY = "QueryClienteIn"`, builder `buildQueryClienteInData`). El backend ya implementado es **directamente reactivable** sin modificaciones.

### Impacto / próximos pasos

1. **No es bloqueo Zeta** — el endpoint nunca estuvo deshabilitado.
2. El backend ya implementado (`zeta-installments-*.ts` + contract + 60 tests verdes) puede activarse en cualquier momento.
3. **NO se implementa migración / pipeline / cron en este turno** (alcance "auditar + documentar" según pedido del usuario 2026-05-11).
4. **Decisión pendiente** (a confirmar con el usuario antes de implementar): crear `proto_invoice_installments(workspace_id, invoice_id, cuota_numero, cuota_vencimiento, cuota_total, cuota_saldo, moneda_codigo, es_entrega_inicial, raw_payload, synced_at)` con UNIQUE `(invoice_id, cuota_numero)`, cron `/api/cron/zeta-installments` cada 3h, backfill seguro, validación contra PDF "Vencimiento de Cuotas", y migración `proto_invoices.due_date = min(cuota_vencimiento)` con flag `due_date_source = 'zeta_cuotas_v1'`.

### Lección operativa

Para evitar este tipo de falso bloqueo: **todo audit script live debe usar el mismo `baseUrl` que `lib/integrations/zeta/zeta-config.ts`** (default `https://api.zetasoftware.com/rest/APIs`) o reusar `loadZetaServerConfig()`. Se elimina la opción de override por env `ZETA_BASE_URL` sin `/rest` en scripts nuevos.

### Evidencia archivada

- `temp-audits/audit-zeta-cuotas-path-reprobe.mjs` — script de revalidación.
- `temp-audits/output/cuotas-reprobe-A-bug-2.json` — evidencia 404 con ruta sin `/rest/`.
- `temp-audits/output/cuotas-reprobe-B-canon-2.json` — evidencia 200 con ruta canónica.

---

## DIV-CONT-010 · `RESTQuerySaldoPendienteCliente` — alias del PDF que no existe como endpoint REST *(documentado)*

**Fecha observada:** 2026-05-11
**Endpoint:** `RESTQuerySaldoPendienteCliente` (mencionado en `docs/zeta/reference/Postman-Ejemplo-de-consultas.pdf` y enlaces a `https://zetasoftware.info/.../facturas-de-clientes/#método-querysaldospendientes`)
**Estado:** ⚠️ Documentado — no es endpoint REST real.

### Hallazgo

- La guía PDF *Postman: Ejemplo de consultas* (`docs/zeta/reference/Postman-Ejemplo-de-consultas.pdf`) referencia el concepto "*Saldo Pendiente Cliente*" usando el ancla `#método-querysaldospendientes` del manual oficial.
- La colección oficial REST `docs/zeta/reference/ZetaSoftware-REST-10-2025.json` (262 endpoints) **NO contiene** ningún endpoint llamado `RESTQuerySaldoPendienteCliente`, `RESTQuerySaldosPendientesCliente` ni variantes singulares.
- Re-prueba live: `POST https://api.zetasoftware.com/rest/APIs/RESTQuerySaldoPendienteCliente` → **HTTP 404** con `{"error":{"code":404,"message":"Not Found"}}` (JSON real de la API, no página HTML — confirma que el gateway recibe la petición pero el método no existe).

### Endpoint canónico equivalente

`RESTFacturaClienteV4QuerySaldosPendientes` — body root `QuerySaldosPendientesIn`, URL `{{baseUrl}}/APIs/RESTFacturaClienteV4QuerySaldosPendientes`. Es el que Copilot **ya usa en producción** (`lib/integrations/zeta/zeta-saldos-pipeline.ts`) y el que la nueva colección documenta oficialmente.

Re-prueba live para `ClienteCodigo=2` (Acquagarden):

- HTTP 200, `rows: 2`, sample keys: `ClienteCodigo, ClienteNombre, ClienteRazonSocial, ComprobanteAbreviacion, ComprobanteCodigo, ComprobanteNombre, ComprobanteTipo, ComprobanteTipoNombre, CondicionCodigo, CondicionNombre, Emitido, Fecha, LocalCodigo, LocalNombre, MonedaCodigo, MonedaNombre, MonedaSimbolo, Notas, Numero, RegistroId, Saldo, SaldoSigno, Serie, Total, TotalSigno`.

### Equivalencia / acción

- **Son el mismo endpoint conceptual**. El PDF usa un nombre simplificado; el canónico versionado es `RESTFacturaClienteV4QuerySaldosPendientes`.
- **No migrar nada** — el endpoint en uso es el correcto.
- Documentado para evitar confusión futura cuando un nuevo onboarding lea el PDF y busque el método por su nombre simplificado.

### Hallazgo adicional aprovechable (futuro)

El canónico devuelve `CondicionCodigo` y `CondicionNombre` por factura — info que el mapper actual (`zeta-saldos-mapper.ts`) NO persiste. Combinándolo con `RESTCondicionesPagoV1Query` podría derivarse un `due_date` aproximado (`issue_date + condicion.VencimientoDias`) si en algún momento se prefiere ese fallback sobre el sintético `+30 días`. Pero la solución correcta sigue siendo `RESTCuotasV1QueryCliente` (DIV-CONT-009).

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
