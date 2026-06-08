# Zeta API — Contrato de Integración

**Última actualización:** 2026-06-08
**Fuentes:** `docs/vendors/z/KNOWN-DIVERGENCES.md`, `docs/zeta/postman/Api ZetaSoftware collection.json`, `docs/zeta/reference/ZetaSoftware-REST-10-2025.json`, ayuda oficial zetasoftware.info/ayuda/apis/

> **Runbook de auditorías:** ver `docs/integrations/zeta-audit-runbook.md`

---

## 1. Endpoints usados por Copilot

| Endpoint | Propósito | Cron / On-demand |
|---|---|---|
| `RESTComprobantesClienteV1Query` | Comprobantes por cliente (facturas + recibos) | On-demand + resync |
| `RESTFacturaClienteV4VentasDetalladas` | Ventas detalladas por mes/año | On-demand |
| `RESTFacturaClienteV4QuerySaldosPendientes` | Saldos pendientes activos | Cron 3h |
| `RESTRecibosCobranzaV2QueryComprobantes` | Recibos de cobranza | Cron + backfill |
| `RESTContactosV3Query` | Contactos / clientes | On-demand + backfill |
| `RESTCuotasV1QueryCliente` | Cuotas (vencimientos reales) | Cron 6h |

### Base URL canónica

```
https://api.zetasoftware.com/rest/APIs/{Metodo}
```

Todo script y código de producción DEBE usar `loadZetaServerConfig().baseUrl` (default `https://api.zetasoftware.com/rest/APIs`).
**Nunca** hardcodear la URL sin el segmento `/rest/`. Ver DIV-CONT-009.

---

## 2. Reglas de moneda (MonedaCodigo)

| MonedaCodigo | ISO 4217 | Símbolo típico |
|---|---|---|
| `"1"` | UYU | `$` |
| `"2"` | USD | `U$S` |

- `MonedaCodigo` es un string numérico en la mayoría de endpoints.
- Prioridad de normalización: `MonedaNombre` → `MonedaSimbolo` → `MonedaCodigo`.
- Implementación: `lib/integrations/zeta/zeta-currency-normalize.ts`.
- `MonedaCodigo` fuera de `{1, 2}` → generar alerta `UNKNOWN_MONEDA_CODIGO`, no inventar moneda.

---

## 3. RegistroId — clave única global

`RegistroId` es el identificador único de un comprobante en Zeta (factura, saldo pendiente, recibo, cuota).

### Reglas
- **Siempre preservar** `RegistroId` en `zeta_metadata` para correlación futura.
- `RegistroId` llega como string o integer según el endpoint; normalizar a string.
- Una fila sin `RegistroId` no puede garantizar idempotencia: **loggear** y tratar por separado.
- El linker cuota↔factura usa `RegistroId` como clave de join (`proto_invoice_installments.zeta_registro_id`).

### Caso edge: Numero=0 con RegistroId

Saldos pendientes (`RESTFacturaClienteV4QuerySaldosPendientes`) pueden devolver filas con `Numero=0`.
Estas NO son borradores si tienen `RegistroId` válido + `Saldo != null` + `Total != null`.
**No descartar** estas filas solo por `Numero=0`.

Borradores CFE reales (de exports Excel) se identifican por `Numero <= 0 AND Emitida = "N"`.
Los endpoints REST de saldos pendientes no devuelven borradores, solo comprobantes vivos.

---

## 4. Notas de crédito

### Detección

| Campo | Valores que indican NC |
|---|---|
| `CFETipo` | 181 (e-NC e-Factura), 182 (e-NC e-Ticket) |
| `ComprobanteTipo` | varía por configuración; validar contra catálogo |
| `ComprobanteNombre` | "Nota de Crédito" / variantes |

### Regla contable

Una NC reduce el saldo del cliente (Haber). En el estado de cuenta (`ledgerMode: true`):
- `kind = "credit_note"`, `credit = total`, `debit = 0`.
- La detección primaria es `cfe_tipo ∈ {181, 182}` (campo `zeta_metadata.zeta_customer_voucher_v1.cfe_tipo`).

Implementación: `lib/copilot-client-account-statement.ts` (sección `ledgerMode`).

### CFE DGI válidos (no-NC, no-recibo)

```
101-103, 111-113, 121-124, 131-133, 141-143, 201-203, 211-213, 221-224, 231-233, 241-243
```

---

## 5. Saldos pendientes (RESTFacturaClienteV4QuerySaldosPendientes)

### Campos obligatorios por fila

| Campo | Tipo | Descripción |
|---|---|---|
| `RegistroId` | string/int | Clave única del comprobante |
| `ClienteCodigo` | string | Código del cliente en Zeta |
| `MonedaCodigo` | string numérica | `"1"` = UYU, `"2"` = USD |
| `Saldo` | number | Saldo pendiente actual |
| `Total` | number | Total original del comprobante |
| `Fecha` | string | Fecha de emisión |

### Campos opcionales relevantes

| Campo | Descripción |
|---|---|
| `Numero` | Número de comprobante (puede ser `0` para casos especiales) |
| `Serie` | Serie del comprobante |
| `ComprobanteCodigo` | Código de tipo de comprobante |
| `ComprobanteTipo` | Tipo numérico de comprobante |
| `CondicionCodigo` | Condición de pago (fuente de `due_date` aproximado) |

### Shadow / colisión con CCV1

El pipeline de saldos escribe filas en `proto_invoices` con `category = "Zeta / saldos pendientes"`.
Si existe una fila CCV1 con el mismo `RegistroId`, el pipeline usa `buildSaldosDueDatePatch` y
**nunca sobreescribe** el `due_date` real.

- **Shadow duplicado**: ocurre cuando el pipeline inserta una fila de saldos y ya existe un
  CCV1 con mismo `RegistroId`. El guard en `zeta-balance-write-diag.ts` detecta esto
  y emite `legacy_shadow_write: true`.
- En `ledgerMode: true` las filas `category === "Zeta / saldos pendientes"` se **filtran** del
  estado de cuenta (no son comprobantes emitidos). Ver DIV-CONT-002.

---

## 6. Recibos de cobro (RESTRecibosCobranzaV2QueryComprobantes)

### Wrapper de respuesta canónico (DIV-002)

```json
{
  "QueryComprobantesOut": {
    "Succeed": true,
    "Response": [
      { "RegistroId": "<long>", "ComprobanteCodigo": "<integer>", ... }
    ]
  }
}
```

### Campos por fila

| Campo | Obligatorio | Descripción |
|---|---|---|
| `RegistroId` | Sí | Clave única del recibo |
| `Fecha` | Sí | Fecha del recibo |
| `Total` | Sí | Importe total del recibo |
| `ClienteCodigo` | Sí | Código del cliente |
| `MonedaCodigo` | Sí | Moneda (`"1"` UYU, `"2"` USD) |
| `ComprobanteCodigo` | No | Tipo de comprobante |
| `Notas` | No | Notas libres |

### ClienteCodigo = "VARIOS USD"

Recibos con `ClienteCodigo = "VARIOS USD"` (o `"VARIOS"`) son **recibos sin cliente específico asignado**
(pagos genéricos en Zeta).

**Regla**: poner en revisión (`status = "pending_review"`), **no asignar** a ninguna empresa local automáticamente.
Asignación manual posterior si el operador puede identificar el cliente real.

---

## 7. CFETipo=0 — Caso especial Prestis (factura interna válida)

### Regla

Una fila con `CFETipo=0` es normalmente excluida del pipeline de facturas (comprobante interno, no CFE DGI).

**Excepción documentada** (PRESTIS, mar/2026): `CFETipo=0 + ComprobanteCodigo=701 + Lineas con Total > 0` sin `FormasPago`.
Esta fila es una factura interna con líneas de venta válidas, aceptada como persistible.

**Condición exacta para aceptar CFETipo=0:**

```ts
CFETipo === 0
  && zetaCustomerVoucherRowHasInvoiceLineas(row) === true
  && zetaCustomerVoucherRowHasFormasPago(row) === false
```

Implementación: `lib/integrations/zeta/zeta-customer-vouchers-invoice-classifier.ts`.

**No generalizar** esta excepción a otros ComprobanteCodigo sin nueva validación contra PDF Zeta.

---

## 8. Contactos / Clientes (RESTContactosV3Query)

### Wrapper canónico (DIV-003)

```json
{
  "QueryOut": {
    "Succeed": true,
    "IsLastPage": true,
    "Response": [
      { "Codigo": "C-100", "Nombre": "...", "RazonSocial": "...", ... }
    ]
  }
}
```

### Campos por contacto

| Campo | Obligatorio | Descripción |
|---|---|---|
| `Codigo` | Sí | Código único en Zeta |
| `Nombre` | No | Nombre personal |
| `RazonSocial` | No | Razón social / empresa |
| `RUT` | No | Documento de identidad |
| `Email1` | No | Email primario |
| `EsCliente` | No | `"S"` / `"N"` |

---

## 9. Cuotas (RESTCuotasV1QueryCliente)

### Wrapper canónico (DIV-CONT-009)

```json
{
  "QueryClienteOut": {
    "IsLastPage": true,
    "Response": [
      {
        "RegistroId": "2527",
        "ClienteCodigo": "2",
        "CuotaNumero": 1,
        "CuotaSaldo": "368.26",
        "CuotaTotal": "678.32",
        "CuotaVencimiento": "2026-04-10",
        "MonedaCodigo": 2,
        "EsEntregaInicial": ""
      }
    ]
  }
}
```

### Clave de join

`RegistroId` en cuotas linkea con `proto_invoices.zeta_metadata.zeta_customer_voucher_v1.zeta_registro_id`.
Tabla destino: `proto_invoice_installments`.

---

## 10. Tipos desconocidos — política de alerta

Ante cualquier valor fuera del catálogo documentado:

| Situación | Acción |
|---|---|
| `CFETipo` fuera de catálogo DGI | Loggear `UNKNOWN_CFE_TIPO`, excluir del pipeline de facturas |
| `ComprobanteCodigo` no reconocido | Loggear `UNKNOWN_COMPROBANTE_CODIGO`, persistir con flag de revisión |
| `MonedaCodigo` fuera de `{1, 2}` | Loggear `UNKNOWN_MONEDA_CODIGO`, dejar `currency_code = null` |
| `ClienteCodigo = "VARIOS USD"` | Loggear `RECEIPT_VARIOS_USD`, poner recibo en `pending_review` |
| `RegistroId` ausente en factura | Loggear `INVOICE_MISSING_REGISTRO_ID`, aceptar si tiene `Serie+Numero` |
| `RegistroId` ausente en saldo | Loggear `SALDO_MISSING_REGISTRO_ID`, descartar fila |
| Shape de respuesta no reconocido | Loggear `ZETA_SHAPE_UNKNOWN`, **no inventar datos** |

---

## 11. Paginación

Todos los endpoints paginan con:

```json
{ "Data": { "Page": 1, ... } }
```

`IsLastPage: true` en el outer wrapper indica última página.
El client (`zeta-http-client.ts`) itera hasta `IsLastPage`.

---

## 12. Divergencias conocidas activas

Ver `docs/vendors/z/KNOWN-DIVERGENCES.md` para detalle completo.

| ID | Endpoint | Estado |
|---|---|---|
| DIV-001 | `RESTFacturaClienteV4VentasDetalladas` — shape `VentasDetalladas` | Resuelto |
| DIV-002 | `RESTRecibosCobranzaV2QueryComprobantes` — wrapper `QueryComprobantesOut` | Resuelto |
| DIV-003 | `RESTContactosV3Query` — array en `QueryOut.Response` | Resuelto |
| DIV-CONT-001 | `due_date` sintético `issue_date+30d` | Mitigado (ZETA-08) |
| DIV-CONT-002 | NCs y saldos en estado de cuenta PDF | Resuelto (ledgerMode) |
| DIV-CONT-003 | `balance_amount` es snapshot vivo, no histórico | Limitación documentada |
| DIV-CONT-004 | `openingBalance` depende de recibos pre-período | Mitigado (override explícito) |
| DIV-CONT-005 | `invoice_id` en recibos siempre null | Bloqueado por API Zeta |
| DIV-CONT-009 | `RESTCuotasV1QueryCliente` falso 404 por ruta sin `/rest/` | Resuelto |
| DIV-CONT-010 | `RESTQuerySaldoPendienteCliente` no existe; usar `...V4QuerySaldosPendientes` | Documentado |

---

## 13. Niveles de auditoría

Zeta es un sistema vivo: la contadora carga pagos y facturas; Copilot sincroniza cada ~2h.
Los PDFs de estado de cuenta son **snapshots en el tiempo**, no fuentes de verdad continua.

| Nivel | Cuándo | Script |
|---|---|---|
| 1 · Contract drift | Diaria — detecta cambios de formato/códigos en Zeta | `npm run audit:zeta-contract` |
| 2 · Sync health | Diaria — salud de pipelines y conteos actuales | `npm run audit:zeta-sync-health` |
| 3 · PDF parity | Mensual — solo con PDFs nuevos del mismo corte | `npm run audit:zeta-pdf-parity` |

**Regla fundamental**: nunca comparar Copilot actual contra PDFs Zeta viejos.
Si el PDF tiene más de 24h de antigüedad y hubo actividad en Zeta, los datos divergerán
por razones válidas (pagos nuevos, facturas emitidas) y el resultado será un falso positivo.

Ver runbook completo: `docs/integrations/zeta-audit-runbook.md`
