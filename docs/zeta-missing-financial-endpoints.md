# Zeta Missing Financial Endpoints — discovery oficial

**Fecha:** 2026-05-11
**Alcance:** identificar qué endpoints REST oficiales Zeta exponen los datos financieros que Copilot todavía aproxima (vencimiento real, aplicaciones recibo↔factura, estado de cuenta, saldos a fecha, diferencias de cambio).

**Fuentes:**

- Colección Postman vigente: `docs/zeta/reference/ZetaSoftware-REST-10-2025.json` (**262 endpoints REST, octubre 2025**). Variable de colección oficial: `baseUrl = "https://api.zetasoftware.com/rest"`. URL final: `{{baseUrl}}/APIs/{NombreMetodoREST}`.
- Colección Postman histórica de referencia: `docs/zeta/postman/Api ZetaSoftware collection.json` (260 endpoints, snapshot anterior).
- Guía complementaria: `docs/zeta/reference/Postman-Ejemplo-de-consultas.pdf` (referencia conceptual, NO contrato técnico).
- Documentación markdown indexada bajo `docs/zeta/markdown/` y `docs/zeta/reference/`.
- Código existente en `lib/integrations/zeta/`.

> **Update 2026-05-11 (tarde, post re-validación con colección 10-2025):**
> - ✅ `RESTCuotasV1QueryCliente` **responde HTTP 200** en producción (la URL correcta es `https://api.zetasoftware.com/rest/APIs/RESTCuotasV1QueryCliente` — el 404 reportado por la mañana fue artefacto del audit script que apuntaba sin `/rest/`). Shape live confirmado para Acquagarden (`ClienteCodigo=2`): `RegistroId=2527, CuotaVencimiento="2026-04-10", CuotaSaldo="368.26", CuotaTotal="678.32", MonedaCodigo=2`. Coincide 1:1 con PDF Zeta "Comprobantes Pendientes" (A2874 saldo USD 368,26). DIV-CONT-009 cerrado como RESUELTO.
> - ❌ `RESTQuerySaldoPendienteCliente` (mencionado en el PDF) **NO existe** como endpoint REST. Re-prueba live: HTTP 404 con `{"error":{"code":404,"message":"Not Found"}}`. Es alias conceptual del PDF. El canónico es `RESTFacturaClienteV4QuerySaldosPendientes`. DIV-CONT-010 documenta la equivalencia.
> - ❌ `RESTRecibosCobranzaV2Load` (probado live con `RegistroId=1911` real) devuelve solo cabecera: `{CajaCodigo, ClienteCodigo, CobradorCodigo, ComprobanteCodigo, Cotizacion, Descripcion, Fecha, LocalCodigo, MonedaCodigo, Notas, Numero, RegistroId, Serie, Total, UsuarioCodigo}`. **Sin arrays `Aplicaciones`/`Imputaciones`/`ComprobantesAplicados`/`FacturasAplicadas`**. DIV-CONT-005 sigue vigente.
> - ✅ Nuevo endpoint en catálogo 2025: `RESTRecibosCobranzaV2QueryPendientes` (body root `QueryPendientesIn`). HTTP 200 live. Lista recibos con saldo a favor del cliente. No resuelve aplicaciones pero sí permitiría futuros módulos.
>
> Esta sección actualizada incluye la matriz reflejando estos hallazgos. NO se implementa migración/pipeline/cron en este turno (alcance "auditar + documentar").

---

## Matriz de cobertura — necesidades vs. endpoints oficiales

| Necesidad | Endpoint candidato | Existe doc | Existe código | Probado | Resultado | Acción |
|---|---|---|---|---|---|---|
| **Aplicaciones recibo↔factura** | `RESTRecibosCobranzaV2Data` | ✅ `docs/zeta/markdown/0165-…recibo-de-cobro.md` | ❌ | ❌ | Solo trae cabecera del recibo (`ComprobanteCodigo`, `Total`, `Saldo`). **NO** trae detalle de facturas aplicadas | `BLOQUEADO endpoint` — Zeta no expone aplicaciones por REST |
| **Aplicaciones recibo↔factura** | `RESTRecibosCobranzaV2Load` | ✅ same | ❌ | ❌ | Trae cabecera + `Cotizacion` + `Notas`. **NO** trae aplicaciones | Idem |
| **Aplicaciones recibo↔factura** | búsqueda exhaustiva en 260 endpoints REST | — | — | — | ❌ ninguno expone aplicaciones | Mantener `proto_receipts.invoice_id=null` y documentar |
| **Fecha de vencimiento real / cuotas** | `RESTCuotasV1QueryCliente` | ✅ `docs/zeta/reference/zeta-postman-examples.md` + colección 10-2025 (root `QueryClienteIn`) | ✅ backend listo (fetch+mapper+contract+60 tests) | ✅ live 2026-05-11 (Acquagarden Codigo=2) | ✅ **HTTP 200** con shape correcto. `RegistroId=2527, CuotaVencimiento="2026-04-10", CuotaSaldo="368.26"`. Coincide 1:1 con PDF "Comprobantes Pendientes". 404 reportado en la mañana era bug del audit (URL sin `/rest/`) | ✅ **ENDPOINT DISPONIBLE** — proponer al usuario migración SQL + cron + backfill (próximo turno, fuera de este alcance). DIV-CONT-009 RESUELTO |
| **Condiciones de pago** | `RESTCondicionesPagoV1Query` | ✅ `docs/zeta/markdown/0184-…condiciones-de-pago.md` | ❌ | ❌ | Catálogo de condiciones con `VencimientoDias`, `CantidadCuotas`, etc. | OPCIONAL — `Cuotas` ya da vencimiento directo, no es necesario |
| **Condición de pago por factura** | `RESTFacturaClienteV4VentaDetallada` | ✅ Postman | ❌ | ❌ | Devuelve `CondicionPagoCodigo` + `CondicionPagoNombre` + `Cotizacion` por línea de factura | BAJO — útil si se quiere mostrar la condición; no requerido para due_date real |
| **Estado de cuenta oficial** | `RESTEstadoCuenta*` o equivalente | ❌ | ❌ | ❌ | **Ningún endpoint REST de Zeta lo expone**. Búsqueda exhaustiva en los 260 endpoints negativa | `BLOQUEADO endpoint` — mantener reconstrucción local con invoices + receipts |
| **Estado de cuenta (alternativa)** | `RESTAsientoV1Lista` | ⏳ presente en Postman | ❌ | ❌ | Lista asientos contables. Si el cliente tiene cuenta contable propia, podría reconstruir movimientos | MEDIO — requiere mapear cliente → cuenta contable. NO urgente |
| **Saldos a fecha histórica** | `RESTFacturaClienteV4QuerySaldosPendientes` | ✅ ya integrado | ✅ | ✅ | Devuelve saldo **AL MOMENTO**, sin parámetro `FechaCorte` | `BLOQUEADO endpoint` — mitigar con tabla local de snapshots |
| **Saldos a fecha (alternativa)** | `RESTCuotasV1QueryCliente` con `CuotaVencimientoHasta` | ✅ same | ✅ backend | ✅ HTTP 200 live (Acquagarden) | Endpoint funcional. Filtrar `CuotaVencimientoHasta=cutoff_date` aproxima "cartera pendiente al corte" | ✅ **VIABLE** — implementar tras backfill de cuotas (próximo turno) |
| **Alias del PDF "Saldo Pendiente Cliente"** | `RESTQuerySaldoPendienteCliente` | ❌ no existe en colección 2025 | ❌ | ✅ live 2026-05-11 | ❌ HTTP 404 con JSON `{"error":{"code":404,"message":"Not Found"}}` | ⚠️ DIV-CONT-010 — **es alias conceptual del PDF**. El canónico es `RESTFacturaClienteV4QuerySaldosPendientes` |
| **Diferencias de cambio (precomputadas)** | `RESTDiferenciaCambio*` | ❌ | ❌ | ❌ | **Ningún endpoint REST oficial** | `BLOQUEADO endpoint` — calcular localmente |
| **Cotizaciones para cálculo local de FX** | `RESTMonedasCotizacionesV1Query` | ✅ Postman | ❌ | ❌ | Devuelve `[{MonedaCodigo, Fecha, CotizacionComercial, CotizacionFiscal}]` por rango de fechas. Combinado con `Cotizacion` en `RESTRecibosCobranzaV2Load` y `RESTFacturaClienteV4VentaDetallada` permite calcular dif. de cambio localmente | MEDIO/BAJO — módulo separado, no urgente |

---

## Endpoints REST oficiales relevantes para finanzas (catálogo)

Fuente: `docs/zeta/postman/Api ZetaSoftware collection.json` (260 endpoints).

### Ventas / facturación
- `RESTFacturaClienteV4Agregar`
- `RESTFacturaClienteV4QueryMovimientosStock`
- `RESTFacturaClienteV4QuerySaldosPendientes` ✅ **usado en producción**
- `RESTFacturaClienteV4QueryVentas`
- `RESTFacturaClienteV4URLPDF`
- `RESTFacturaClienteV4VentaDetallada` (singular — detalle por `FacturaId`)
- `RESTFacturaClienteV4Ventas`
- `RESTFacturaClienteV4VentasDetalladas` ✅ **usado para enrichment de moneda**

### Recibos de cobranza
- `RESTRecibosCobranzaV2Data` — cabecera por `RegistroId` (body root `DataIn`). HTTP 200 live; sin aplicaciones.
- `RESTRecibosCobranzaV2Load` — cabecera modificable, incluye `Cotizacion` (body root `LoadIn`). HTTP 200 live para `RegistroId=1911`; **shape confirmado: cabecera, sin aplicaciones**.
- `RESTRecibosCobranzaV2QueryComprobantes` ✅ **usado en producción** (body root `QueryComprobantesIn`).
- `RESTRecibosCobranzaV2QueryPendientes` — recibos con saldo a favor del cliente (body root `QueryPendientesIn`). HTTP 200 live; útil para futuro módulo de anticipos.
- `RESTRecibosCobranzaV2Save` — alta (body root `SaveIn`).

### Cuotas / vencimientos
- `RESTCuotasV1QueryCliente` ✅ **DISPONIBLE LIVE (2026-05-11 tarde)** — `POST /rest/APIs/RESTCuotasV1QueryCliente`, root `QueryClienteIn`. Devuelve `RegistroId`+`CuotaVencimiento`+`CuotaSaldo`+`CuotaTotal`+`MonedaCodigo`. Ver DIV-CONT-009 RESUELTO.
- `RESTCuotasV1QueryProveedor` (out of scope cartera, no probado)

### Configuración
- `RESTCondicionesPagoV1Query/Save/Load/Delete`
- `RESTFormasPagoV1Query/Save/Load/Delete`
- `RESTMonedasV1Query`
- `RESTMonedasCotizacionesV1Query` ⭐ **CLAVE para diferencias de cambio**

### Contabilidad
- `RESTAsientoV1Lista` — asientos contables
- `RESTBalanceV1Query` — balance contable
- `RESTPlanCuentasV2Query` — plan de cuentas
- `RESTBandejaEntradaAsientosV1Query/Save/Load/Delete`
- `RESTCFEsRecibidosV1CFEsRecibidos`, `RESTCFEsRecibidosV1CFERecibidoDetalle`

### Otros relacionados
- `RESTChequesRecibidosV1Query` — cheques recibidos
- `RESTMovimientosBancariosV1Query`, `RESTMovimientosCajaV1Query`
- `RESTRetencionesPercepcionesV1Query`

### NO existen (búsqueda exhaustiva negativa)
- `REST*EstadoCuenta*` — no hay endpoint de estado de cuenta oficial
- `REST*CuentaCorriente*` — no
- `REST*Saldos*Fecha*` — no hay parámetro de fecha de corte en QuerySaldosPendientes
- `REST*DiferenciaCambio*` — no hay endpoint dedicado
- `REST*Aplicaciones*`, `REST*Imputaciones*`, `REST*Cancelaciones*` — no hay endpoint que vincule recibos con facturas

---

## Conclusiones por gap del audit anterior

### 1. Aplicaciones recibo ↔ factura → `BLOQUEADO Zeta`

Búsqueda exhaustiva sobre los 260 endpoints REST oficiales no encuentra **ningún endpoint** que exponga el detalle de qué factura(s) cancela cada recibo. La doc oficial (línea 142 de `0165-…recibo-de-cobro.md`) dice textualmente:

> "Este método no asigna formas de pago. **Para ello debe utilizarse la API de facturas de clientes.**"

Pero la API de facturas (`RESTFacturaClienteV4*`) tampoco expone aplicaciones — solo cabecera, líneas de producto, saldos pendientes globales y `CondicionPagoCodigo`.

**Acción:** mantener `proto_receipts.invoice_id = null` y la limitación documentada en `KNOWN-DIVERGENCES.md DIV-CONT-005` (nuevo). Pedir explícitamente a Zeta vía soporte si hay un endpoint no documentado o si la información se puede pedir vía SOAP de forma diferente.

### 2. Fecha de vencimiento real → ✅ **ENDPOINT DISPONIBLE** (validado live 2026-05-11)

**Estado actual:** ✅ **VIABLE IMPLEMENTAR** — el endpoint funciona, backend listo, shape confirmado. Pendiente decisión del usuario sobre migración SQL + pipeline + cron (no se ejecuta en este turno).

**Evidencia live (2026-05-11, tarde):**

- Script: `temp-audits/audit-zeta-cuotas-path-reprobe.mjs --cliente-codigo 2`
- URL canónica probada: `POST https://api.zetasoftware.com/rest/APIs/RESTCuotasV1QueryCliente` (con segmento `/rest/`).
- HTTP: **200**, `IsLastPage: true`, `rows: 2`.
- Sample row:

```json
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
```

- Validación cruzada vs PDF Zeta "Comprobantes Pendientes — ACQUAGARDEN":
  - PDF: factura A2874 saldo USD 368,26 + factura A2926 saldo USD 678,32, total cliente USD 1.046,58.
  - API live: `RegistroId=2527, CuotaSaldo=368.26, CuotaTotal=678.32, MonedaCodigo=2 (USD)`. Coincidencia 1:1 con A2874.
  - `CuotaVencimiento="2026-04-10"` es fecha REAL emitida por Zeta (no `issue_date+30`).

**Por qué el audit anterior daba 404:**

El script `temp-audits/audit-zeta-due-date-shape.mjs` línea 34 leía `process.env.ZETA_BASE_URL` (variable no definida en `.env.local`) y caía al default `"https://api.zetasoftware.com"` SIN el segmento `/rest`. URL final probada: `.../APIs/...` → 404. Mientras tanto, `lib/integrations/zeta/zeta-config.ts` línea 4 usa `DEFAULT_BASE = "https://api.zetasoftware.com/rest/APIs"`. Ver `KNOWN-DIVERGENCES.md DIV-CONT-009 RESUELTO`.

**Backend ya implementado y validado contra el shape real:**

- `lib/integrations/zeta/contracts/zeta-installments.contract.ts` — parser puro `QueryClienteOut.Response[]` ✓ coincide con shape live.
- `lib/integrations/zeta/zeta-installments-mapper.ts` — raw → `ProtoInstallmentInput` (31 tests verdes).
- `lib/integrations/zeta/zeta-installments-fetch.ts` — orquestador HTTP + logging + shape validation (11 tests). Constante `ZETA_INSTALLMENTS_ROOT_IN_KEY = "QueryClienteIn"` ✓ coincide.
- `lib/integrations/zeta/contracts/zeta-installments.contract.test.ts` — 18 tests.

**Recomendación técnica (a confirmar con el usuario en próximo turno):**

1. Migración SQL `proto_invoice_installments(workspace_id, invoice_id, cuota_numero, cuota_vencimiento, cuota_total, cuota_saldo, moneda_codigo, currency_code, es_entrega_inicial, raw_payload, synced_at)` con UNIQUE `(invoice_id, cuota_numero)`.
2. Pipeline orquestador `lib/integrations/zeta/zeta-installments-pipeline.ts` (paginado, idempotente, upsert por `(invoice_id, cuota_numero)`).
3. Cron `/api/cron/zeta-installments` cada 3h (alineado con el de saldos).
4. Backfill por workspace_company_id (mismo patrón que cron de saldos).
5. Validar muestreo contra PDF Zeta "Vencimiento de Cuotas" (al menos 10 facturas, USD y UYU).
6. **Solo entonces** migrar `proto_invoices.due_date = min(cuota_vencimiento)` con flag `due_date_source = 'zeta_cuotas_v1'`. Resuelve DIV-CONT-001.

### 3. Estado de cuenta oficial → `BLOQUEADO Zeta` (alternativa con asientos pendiente de POC)

No hay endpoint de estado de cuenta dedicado. Existe `RESTAsientoV1Lista` (asientos contables) que **podría** reconstruir movimientos de cliente si éste tiene cuenta contable propia y los asientos imputan a esa cuenta. Pero requiere:
- Mapear `ClienteCodigo` Zeta → cuenta contable en plan de cuentas (`RESTPlanCuentasV2Query`).
- Validar que los asientos automáticos en Zeta vinculan `ClienteCodigo` con su cuenta.
- Reconstruir Debe/Haber por fecha.

Es un proyecto en sí mismo. Por ahora mantenemos `lib/copilot-client-account-statement.ts` (reconstrucción local invoices + receipts).

### 4. Saldos por cliente a fecha → `BLOQUEADO Zeta` (mitigar localmente)

`RESTFacturaClienteV4QuerySaldosPendientes` no acepta parámetro `FechaCorte`/`AsOf`. Es siempre "ahora".

**Alternativa:**
- (a) **Cuotas como proxy:** filtrar `RESTCuotasV1QueryCliente` con `CuotaVencimientoHasta = cutoff_date` da las cuotas pendientes con vencimiento dentro del rango. NO es saldo a fecha, sí es "cuotas que vencían antes de fecha X". Útil para aging.
- (b) **Snapshot local:** tabla `proto_invoice_balance_snapshots` poblada por el cron de saldos.

**Acción:** documentar en `KNOWN-DIVERGENCES.md DIV-CONT-003` (ya está) y dejar como Fase futura.

### 5. Diferencias de cambio → módulo separado pendiente

No hay endpoint Zeta de diferencias de cambio precomputadas. Pero el cálculo es derivable:

```
dif_cambio = Total_factura × (Cotizacion_recibo − Cotizacion_factura)
```

donde:
- `Cotizacion_factura` viene en `RESTFacturaClienteV4VentaDetallada.Cotizacion`.
- `Cotizacion_recibo` viene en `RESTRecibosCobranzaV2Load.Cotizacion`.
- O alternativamente, ambas via `RESTMonedasCotizacionesV1Query` por fecha.

**Acción:** crear el audit script (Fase 5), guardar shape, y dejar el módulo como futura Fase E. NO afecta cartera.

---

## Lista clara para el usuario

**✅ DISPONIBLE Y READY-TO-IMPLEMENT (pendiente decisión del usuario sobre migración SQL):**
- **`RESTCuotasV1QueryCliente`** → endpoint funcional confirmado live (2026-05-11). Backend + fetch + mapper + contract + 60 tests verdes ya entregados. Solo restan: migración `proto_invoice_installments`, pipeline + cron + backfill, validación contra PDF "Vencimiento de Cuotas". **Resuelve DIV-CONT-001** (`due_date` sintético).
- **`RESTRecibosCobranzaV2QueryPendientes`** (nuevo en catálogo 10-2025, HTTP 200 confirmado live) — listar recibos con saldo a favor del cliente. Útil para futuro módulo "Anticipos / Saldos a favor". No urgente.

**📦 Implementable en módulos futuros:**
- `RESTMonedasCotizacionesV1Query` + `RESTRecibosCobranzaV2Load` + `RESTFacturaClienteV4VentaDetallada` → diferencias de cambio. Audit script ya creado. Bloqueado por DIV-CONT-005 (aplicaciones recibo↔factura) para granularidad por factura.
- `RESTCondicionesPagoV1Query` → catálogo de condiciones. Útil como enriquecimiento de `proto_invoices`, no requerido para `due_date` real (ya tenemos cuotas).
- `RESTAsientoV1Lista` → reconstrucción de Estado de Cuenta oficial vía asientos contables. Proyecto en sí mismo, requiere mapeo `ClienteCodigo` → cuenta contable del plan.

**❌ BLOQUEADO por Zeta (confirmado por re-prueba live 2026-05-11):**
- **Aplicaciones recibo↔factura**: ni `RESTRecibosCobranzaV2Data`, ni `RESTRecibosCobranzaV2Load` (probado live con `RegistroId=1911`), ni `QueryComprobantes`, ni `QueryPendientes` exponen el detalle. `RESTRecibosCobranzaV2Load.Response` devuelve solo cabecera (`CajaCodigo, ClienteCodigo, CobradorCodigo, ComprobanteCodigo, Cotizacion, Descripcion, Fecha, LocalCodigo, MonedaCodigo, Notas, Numero, RegistroId, Serie, Total, UsuarioCodigo`). DIV-CONT-005 sigue vigente.
- Estado de cuenta oficial dedicado (`RESTEstadoCuenta*`, `RESTCuentaCorriente*` no existen). DIV-CONT-007.
- Saldos por cliente a fecha histórica (mitigable con snapshots locales). DIV-CONT-003.
- Diferencias de cambio precomputadas (calculable localmente). DIV-CONT-008.

**⚠️ Aliases del PDF que NO son endpoints reales:**
- `RESTQuerySaldoPendienteCliente` (HTTP 404 live, JSON `{"error":{"code":404,"message":"Not Found"}}`). Es referencia conceptual del PDF; el canónico es `RESTFacturaClienteV4QuerySaldosPendientes`. DIV-CONT-010.

**Riesgos remanentes:**
- Aging sigue calculándose con `issue_date + 30 días` sintético (DIV-CONT-001) hasta implementar pipeline de Cuotas. **Ya no es bloqueo de Zeta, es decisión de scope.**
- Reconstrucción Estado de Cuenta no detecta imputaciones de recibos a facturas específicas; solo Σ ledger. Bloqueo real de Zeta (DIV-CONT-005).

---

## Plan de tests (Fase 6)

Para cada endpoint nuevo:
- Mapper: unit tests con fixtures sintéticas y casos edge (fechas inválidas, saldos negativos, monedas no canónicas).
- Pipeline: tests de paginación, idempotencia upsert, error handling.
- Audit script: corre live contra Zeta una vez con credenciales del workspace y guarda JSON sanitizado en `temp-audits/output/`.

### Estado actual de los audits (2026-05-11)

| Audit script | Endpoint | Resultado live |
|---|---|---|
| `temp-audits/audit-zeta-receipt-data-shape.mjs` | `RESTRecibosCobranzaV2Data` | 200 OK — cabecera sin aplicaciones (DIV-CONT-005) |
| `temp-audits/audit-zeta-due-date-shape.mjs` | `RESTCuotasV1QueryCliente` (ruta `/APIs/` sin `/rest/`) | ❌ 404 — bug del script (URL incorrecta), NO bloqueo Zeta |
| `temp-audits/audit-zeta-cuotas-path-reprobe.mjs` (nuevo) | `RESTCuotasV1QueryCliente` (ruta canónica `/rest/APIs/`) | ✅ **200 OK con shape correcto** (DIV-CONT-009 RESUELTO) |
| `temp-audits/audit-zeta-2025-reprobe.mjs` (nuevo) | `RESTQuerySaldoPendienteCliente` | ❌ 404 — alias del PDF, no existe (DIV-CONT-010) |
| `temp-audits/audit-zeta-2025-reprobe.mjs` (nuevo) | `RESTFacturaClienteV4QuerySaldosPendientes` | ✅ 200 OK — canónico (ya en uso) |
| `temp-audits/audit-zeta-2025-reprobe.mjs` (nuevo) | `RESTRecibosCobranzaV2Load` (RegistroId=1911) | ✅ 200 OK — cabecera sin aplicaciones, DIV-CONT-005 vigente |
| `temp-audits/audit-zeta-2025-reprobe.mjs` (nuevo) | `RESTRecibosCobranzaV2QueryPendientes` (nuevo en catálogo 2025) | ✅ 200 OK — endpoint funcional, 0 rows para Acquagarden |
| `temp-audits/audit-zeta-account-statement-endpoints.mjs` | varios | Ningún endpoint REST dedicado (DIV-CONT-007) |
| `temp-audits/audit-zeta-exchange-differences-shape.mjs` | `RESTMonedasCotizacionesV1Query` + `RESTRecibosCobranzaV2Load` | 200 OK — calculable localmente, depende de DIV-CONT-005 |

### Evidencia archivada en `temp-audits/output/`

- `cuotas-reprobe-A-bug-2.json` — 404 con ruta sin `/rest/` (reproducción del bug original).
- `cuotas-reprobe-B-canon-2.json` — 200 con ruta canónica y shape `QueryClienteOut.Response[]`.
- `2025-reprobe-1-saldopendientecliente-ghost.json` — 404 del alias del PDF.
- `2025-reprobe-2-saldos-canonico.json` — 200 del canónico `RESTFacturaClienteV4QuerySaldosPendientes`.
- `2025-reprobe-3-recibo-load.json` — 200 de `RESTRecibosCobranzaV2Load` (sin aplicaciones).
- `2025-reprobe-4-recibos-pendientes.json` — 200 del nuevo `RESTRecibosCobranzaV2QueryPendientes`.

---

## Referencias

- `docs/zeta/reference/ZetaSoftware-REST-10-2025.json` — **colección Postman vigente (octubre 2025)**, 262 endpoints, variable `baseUrl = "https://api.zetasoftware.com/rest"`.
- `docs/zeta/reference/zeta-postman-examples.md` — ejemplos JSON con observaciones, derivado de la colección 10-2025.
- `docs/zeta/reference/zeta-api-endpoints.md` — índice tabular de la colección 10-2025 con wrappers (`QueryIn`, `QueryClienteIn`, `LoadIn`, etc.).
- `docs/zeta/reference/Postman-Ejemplo-de-consultas.pdf` — guía complementaria (sólo enlaces a ayuda Zeta; sin contrato técnico extra).
- `docs/zeta/postman/Api ZetaSoftware collection.json` — colección histórica (snapshot anterior, 260 endpoints).
- `docs/zeta/markdown/0158-…cuotas-de-cliente-y-proveedor.md` — doc oficial Cuotas.
- `docs/zeta/markdown/0184-…condiciones-de-pago.md` — doc oficial Condiciones de Pago.
- `docs/zeta/markdown/0165-…recibo-de-cobro.md` — doc oficial Recibos de Cobranza (confirma que no exponen aplicaciones).
- `docs/zeta-financial-coverage-audit.md` — matriz general de cobertura financiera.
- `docs/vendors/z/KNOWN-DIVERGENCES.md` — divergencias documentadas (DIV-CONT-001 a DIV-CONT-010).
