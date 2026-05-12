# Zeta Financial Coverage Audit — Summer87 Copilot

**Fecha:** 2026-05-11 (actualizada con colección Postman 10-2025 + revalidación live de tarde)
**Alcance:** auditoría exhaustiva de la base financiera Copilot ↔ Zeta.
**Fuente de verdad:** Zeta (Comprobantes Pendientes, Análisis de Saldos, Vencimiento de Cuotas, Estado de Cuenta, Saldos de Clientes, Diferencias de Cambio).

> **Update 2026-05-11 (tarde) · Revalidación con colección Postman 10-2025**
>
> Tras incorporar la colección oficial `docs/zeta/reference/ZetaSoftware-REST-10-2025.json` (262 endpoints, variable `baseUrl = "https://api.zetasoftware.com/rest"`) y re-probar los endpoints críticos live:
> - ✅ **`RESTCuotasV1QueryCliente`** está disponible (HTTP 200 confirmado live para Acquagarden `ClienteCodigo=2`). El 404 reportado por la mañana era artefacto del audit script (URL sin `/rest/`). DIV-CONT-009 RESUELTO. Resuelve el gap del módulo 9 (`due_date` real, DIV-CONT-001) en cuanto se decida implementar el pipeline.
> - ❌ **Aplicaciones recibo↔factura**: re-probado live `RESTRecibosCobranzaV2Load` con `RegistroId=1911` → devuelve solo cabecera (`CajaCodigo, ClienteCodigo, CobradorCodigo, ComprobanteCodigo, Cotizacion, Descripcion, Fecha, LocalCodigo, MonedaCodigo, Notas, Numero, RegistroId, Serie, Total, UsuarioCodigo`). Sin arrays de aplicaciones. Bloqueo confirmado por API Zeta. DIV-CONT-005.
> - ❌ **`RESTQuerySaldoPendienteCliente`** (alias del PDF) → HTTP 404 real con JSON `{"error":{"code":404,"message":"Not Found"}}`. NO es endpoint real. El canónico es `RESTFacturaClienteV4QuerySaldosPendientes` (ya en uso). DIV-CONT-010.
> - ✅ **Nuevo endpoint en catálogo 2025**: `RESTRecibosCobranzaV2QueryPendientes` (recibos con saldo a favor del cliente). HTTP 200 live. Útil para futuro módulo de anticipos.
> - ❌ Estado de cuenta oficial, saldos a fecha histórica, diferencias de cambio precomputadas: confirmado que NO existen como endpoint REST dedicado en la colección 2025. DIV-CONT-007, DIV-CONT-003, DIV-CONT-008.

> **Cómo leer este documento.** Cada módulo tiene una fila en la matriz de cobertura con: estado de implementación, tabla local, endpoint Zeta usado, campos disponibles y faltantes, riesgo y acción. Las acciones marcadas como `SEGURO` ya tienen los datos sincronizados — se pueden implementar sin tocar sync ni mappers. Las marcadas como `BLOQUEADO endpoint` requieren primero certificar el endpoint Zeta correspondiente y luego ampliar mapper/pipeline.

---

## 1. Matriz de cobertura (Fase 1)

| Módulo | Existe en Copilot | Tabla actual | Endpoint Zeta usado | Campos presentes | Campos faltantes | Riesgo | Acción |
|---|---|---|---|---|---|---|---|
| **Clientes** | ✅ Sí | `proto_companies` | `RESTContactosV3Query` (`lib/integrations/zeta/zeta-clients.ts`) | id, nombre, RUT, dirección, email, teléfono, `zeta_codigo` | Condición de pago, días de crédito, límite de crédito | BAJO | Sin acción inmediata. Si se quiere `due_date` real, traer `condicion_pago`. |
| **Facturas / ventas crédito** | ✅ Sí | `proto_invoices` | `RESTComprobantesClienteV1Query` (`zeta-customer-vouchers-pipeline.ts`) + enrichment moneda `RESTFacturaClienteV4VentasDetalladas` | invoice_number, issue_date, total_amount, currency_code, status, `zeta_metadata.zeta_customer_voucher_v1.{cfe_tipo, cfe_estado, serie, numero, ...}` | `due_date` real (hoy es sintético `+30d`), tipo de CFE diferenciado para NC | MEDIO | Sin acción inmediata para due_date (ver módulo 9). NCs ver módulo 6. |
| **Saldos pendientes** | ✅ Sí | `proto_invoices.balance_amount` | `RESTFacturaClienteV4QuerySaldosPendientes` (`zeta-saldos-pipeline.ts`, cron 3h en `/api/cron/zeta-sync-saldos`) | balance_amount actual por factura, ligado a `invoice_number ZETA:CCV1:*` | Snapshot por fecha de corte (es siempre "ahora") | MEDIO | Para cartera con `Hasta < hoy`, ver módulo 8. |
| **Recibos de cobranza** | ✅ Sí | `proto_receipts` | `RESTRecibosCobranzaV2QueryComprobantes` (`zeta-collection-receipts-pipeline.ts`, pipeline manual hoy) | receipt_number, receipt_date, amount, currency_code, payment_method, status, reference | Detalle de **aplicaciones** (qué factura cobra cada recibo) | CRÍTICO¹ | Ver módulo 5. |
| **Vínculo factura ↔ recibo** | ⚠️ Parcial | `proto_receipts.invoice_id` (columna existe) | — (sin endpoint detalle de aplicaciones) | — (columna **siempre `null`** en producción; mapper línea 211) | Endpoint Zeta de aplicaciones de recibo | CRÍTICO¹ | `BLOQUEADO endpoint` — certificar `RESTRecibosCobranzaV2QueryAplicaciones` (nombre tentativo) o equivalente. |
| **Notas de crédito** | ⚠️ Parcial | `proto_invoices` (entran como facturas) | `RESTComprobantesClienteV1Query` (mismo pipeline que facturas) | `zeta_metadata.zeta_customer_voucher_v1.cfe_tipo` con catálogo DGI (102/112/122/...) sí persiste | Tratamiento como **crédito** (signo negativo, debe restar de cartera) | CRÍTICO² | `SEGURO` — dato disponible, solo falta usarlo. Ver módulo 6. |
| **Estado de cuenta / movimientos contables** | ⚠️ Parcial | Reconstrucción local (`lib/copilot-client-account-statement.ts`) | — (no hay endpoint dedicado) | Σ invoices + Σ receipts por cliente/moneda | NCs como crédito (depende de módulo 6), aplicaciones de recibos (depende de módulo 5) | MEDIO | Mejora natural con módulos 5/6. |
| **Saldos por cliente a fecha histórica** | ❌ No | — | — (endpoint actual solo devuelve "ahora") | — | Snapshot por `as_of_date` | MEDIO | Mitigable con tabla local `proto_invoice_balance_snapshots` (no urgente). |
| **Vencimiento real de cuotas** | ⚠️ Pipeline pendiente | `proto_invoices.due_date` (sintético) | `RESTCuotasV1QueryCliente` (`/rest/APIs/...`) — **endpoint validado live 2026-05-11** | — (mapper hace `addDaysIso(issue, 30)`); backend Cuotas + fetch + mapper + 60 tests ya entregados, listos para pipeline | Migración SQL `proto_invoice_installments`, pipeline orquestador, cron, backfill, migración `due_date` | MEDIO (deja de ser CRÍTICO bloqueado) | ✅ **READY-TO-IMPLEMENT** — Decisión del usuario sobre próximos pasos. Resuelve DIV-CONT-001. |
| **Diferencias de cambio** | ❌ No | — | — | — | Endpoint cotizaciones + tabla local | BAJO | Módulo separado. No bloquea cartera básica. Documentado en `docs/zeta/markdown/0071-*-monedas-y-cotizaciones-*.md`. |

¹ Bloquea reconstruir trazabilidad exacta de cobranza por factura.
² Causa divergencia visible contra Zeta para clientes con NCs (caso confirmado: El País).

---

## 2. Mapa actual (Fase 2)

### Tablas Supabase

| Tabla | Propósito | Sync | Estado |
|---|---|---|---|
| `proto_companies` | Clientes | `RESTContactosV3Query` (cron `/api/cron/zeta-sync-contacts` diario 02:00 UTC) | ✅ |
| `proto_invoices` | Facturas + NCs (mezcladas) | `RESTComprobantesClienteV1Query` (cron `/api/cron/zeta-sync-vouchers` cada 6h) | ✅ con gap NCs |
| `proto_invoices.balance_amount` | Saldo vivo de factura | `RESTFacturaClienteV4QuerySaldosPendientes` (cron `/api/cron/zeta-sync-saldos` cada 3h) | ✅ snapshot vivo |
| `proto_receipts` | Recibos de cobranza | `RESTRecibosCobranzaV2QueryComprobantes` (pipeline `zeta-collection-receipts-pipeline.ts`, ejecución manual hoy) | ✅ sin vínculo a invoice |
| `proto_receipts.invoice_id` | FK al recibo aplicado | — | ❌ columna existe pero **siempre `null`** |
| `proto_payments` | Pagos a proveedores | (sin pipeline Zeta integrado) | — fuera de scope cartera |
| `zeta_pipeline_runs` | Telemetría de runs | (pipeline interno) | ✅ |
| `zeta_sync_state` | Estado por `resource_flow` | (pipeline interno) | ✅ |

### Endpoints Zeta operativos (en código)

1. **`RESTContactosV3Query`** — `lib/integrations/zeta/zeta-clients.ts`. Sync contactos.
2. **`RESTComprobantesClienteV1Query`** — `lib/integrations/zeta/zeta-customer-vouchers-pipeline.ts`. Comprobantes cliente (facturas + NCs).
3. **`RESTFacturaClienteV4QuerySaldosPendientes`** — `lib/integrations/zeta/zeta-saldos-pipeline.ts`. Saldos pendientes por cliente.
4. **`RESTFacturaClienteV4VentasDetalladas`** — `lib/integrations/zeta/zeta-ventas-detalladas-fetch.ts`. Ventas detalladas (enrichment de moneda).
5. **`RESTRecibosCobranzaV2QueryComprobantes`** — `lib/integrations/zeta/zeta-collection-receipts-pipeline.ts`. Recibos de cobranza (cabecera).

### Endpoints documentados pero **NO** integrados

Según `docs/zeta/catalog/copilot-zeta-coverage.md`:

- `asoapcuotasv1` — vencimientos por cuota (CRÍTICO para due_date real)
- `asoapclientev4` — datos comerciales cliente (incluye condición de pago)
- `asoapproveedorv3`, `asoapcontactossucursalesv1` — fuera de scope cartera
- `asoapmovimientoscajav1`, `asoapmovimientosbancariosv1` — caja/bancos (fuera de scope cartera)
- `asoapbalancev1`, `asoapasientov1`, `asoapplancuentasv2` — contabilidad (fuera de scope cartera)
- `asoaprecibospagosv1` — recibos a proveedores (fuera de scope cartera)
- **Endpoint de aplicaciones de recibo de cobranza** — no aparece nombrado en catálogo (PENDIENTE certificar nombre).

---

## 3. Hallazgos críticos (Fase 2 detalle)

### 3.1 Vínculo factura ↔ recibo — CRÍTICO bloqueado

`lib/integrations/zeta/zeta-collection-receipts-mapper.ts:211`:

```ts
return {
  ok: true,
  input: {
    company_id: companyId,
    invoice_id: null,    // ← siempre null
    receipt_number: buildZetaCollectionReceiptNumber(m.zeta_registro_id),
    ...
  },
};
```

**Causa:** el endpoint `RESTRecibosCobranzaV2QueryComprobantes` devuelve la **cabecera** del recibo (Fecha, Total, ComprobanteCodigo, MedioPago) pero **no el detalle de aplicaciones** (qué facturas, en qué proporción). Por eso `invoice_id` siempre se setea a `null`.

**Impacto:**
- No se puede reconstruir trazabilidad "qué factura cobró qué recibo".
- El motor financiero solo puede sumar Σ receipts por cliente×moneda, sin imputarlos.
- Para coincidir con un Estado de Cuenta exacto Zeta donde un recibo cancela una factura específica, no tenemos el dato.

**Acción:** identificar endpoint Zeta que exponga aplicaciones (tentativos: `RESTRecibosCobranzaV2QueryAplicaciones`, `asoapreciboscobranzav2`/aplicaciones, o un detalle dentro del propio Query). Hasta tener nombre y shape oficiales, mantener `invoice_id = null` y documentar la limitación.

### 3.2 Notas de crédito como facturas — CRÍTICO **fixeable**

`lib/integrations/zeta/zeta-customer-vouchers-invoice-classifier.ts:22-35` incluye en el set de CFE Tipos persistibles los códigos DGI de NCs:

```ts
const CFE_TIPOS_DGI_FACTURA_O_DOCUMENTO_FISCAL = new Set([
  101, 102, 103,   // 102 = e-Factura Nota de Crédito
  111, 112, 113,   // 112 = e-Boleta NC
  121, 122, 123, 124,  // 122 = e-Ticket NC
  131, 132, 133,
  141, 142, 143,
  181, 182,
  201, 202, 203,
  211, 212, 213,
  221, 222, 223, 224,
  231, 232, 233,
  241, 242, 243,
  281, 282,
]);
```

El mapper (`zeta-customer-vouchers-mapper.ts:489`) guarda `total_amount = mapped.total_recibo ?? 0` **siempre positivo** y persiste el CFETipo en `zeta_metadata.zeta_customer_voucher_v1.cfe_tipo` (línea 427). Las NCs entran como facturas con total positivo, sumando al saldo en lugar de restarlo.

**Caso confirmado:** El País UYU. Estado de Cuenta Zeta cierra en `$ 67.222`; Copilot reporta `$ 75.884`. Diferencia `$ 8.662 = NC A391` no contabilizada.

**Acción `SEGURO`:** el dato ya está en metadata. Crear un helper puro que clasifique NCs por `cfe_tipo` y úselo en el motor para restar de `pendingAtCutoff` y `openingBalance`. NO requiere tocar mapper, pipeline, sync ni schema.

(Esta acción se implementa en este turno — ver sección 5.)

### 3.3 `due_date` sintético — CRÍTICO bloqueado

`lib/integrations/zeta/zeta-customer-vouchers-mapper.ts:488`:

```ts
const due = addDaysIso(issue, 30);
```

Aplica a **todas** las facturas Zeta. Las condiciones de pago reales por cliente (`VencimientoDias`, ver `docs/zeta/markdown/0184-*-condiciones-de-pago-*.md`) están documentadas pero no se sincronizan en Copilot. Para clientes con condiciones distintas a 30 días (15d, 60d, contado…) el `due_date` que mostramos es sintético.

**Impacto:**
- Aging por antigüedad real (días de atraso) diverge contra el reporte "Vencimiento de Cuotas" de Zeta.
- Aging por `issue_date` (lo que hace Copilot hoy) sigue funcionando, sólo el cálculo "vencido sí/no" diverge.

**Acción:** identificar y certificar endpoint que exponga la condición de pago por cliente. Posibles candidatos: el endpoint completo de Cliente (`asoapclientev4`) o uno dedicado a Condiciones de Pago (`asoapcondicionespagov1` referenciado en docs Zeta). Hasta tener endpoint y shape, mantener `+30d` y documentar en UI ("vencimiento estimado").

### 3.4 Snapshot histórico de saldo — MEDIO mitigable

`balance_amount` se actualiza cada 3h por el cron de saldos. Si el usuario filtra cartera con `Hasta < hoy`, el `pendingAtCutoff` muestra el balance **vivo**, no el cierre del `Hasta`.

**Mitigación local (no requiere endpoint):** tabla `proto_invoice_balance_snapshots(invoice_id, snapshot_date, balance_amount)` poblada por el cron de saldos como "registro histórico". El motor consultaría el snapshot más cercano a `periodEnd` cuando éste es pasado.

Documentado en `KNOWN-DIVERGENCES.md` DIV-CONT-003. **No urgente** si el caso de uso operativo es siempre `Hasta = hoy`.

### 3.5 Diferencias de cambio — BAJO módulo aparte

Sin pipeline. Endpoint cotizaciones (`asoapcotizacionesmonedav1` referenciado en docs `0186-…cotizacion-de-monedas`) documentado pero no integrado. **No bloquea cartera básica** porque Copilot ya separa USD y UYU como flujos independientes y no convierte una moneda a otra.

Si en el futuro se quiere mostrar "deuda total en USD equivalente", habría que:
1. Sincronizar cotizaciones diarias por moneda.
2. Crear tabla `proto_exchange_rates(date, currency_code, rate)`.
3. Helper de conversión `convertToUsdAt(date)`.

---

## 4. Matriz de decisión (Fase 4)

### CRÍTICO (afecta saldo / cartera / coincidencia con Zeta)

| # | Gap | Tipo | Acción | Implementable hoy |
|---|---|---|---|---|
| 1 | NCs no contabilizadas como crédito | `SEGURO` (dato disponible) | Helper detector NC + opt-in en motor + tests | ✅ Sí (en este turno) |
| 2 | Vínculo factura↔recibo (`invoice_id` siempre null) | `BLOQUEADO endpoint` | Identificar endpoint de aplicaciones Zeta | ❌ No |
| 3 | `due_date` sintético | `BLOQUEADO endpoint` | Sincronizar condición de pago por cliente | ❌ No |

### MEDIO (mejora explicabilidad / trazabilidad)

| # | Gap | Acción | Implementable hoy |
|---|---|---|---|
| 4 | Sin snapshots históricos de `balance_amount` | Tabla local `proto_invoice_balance_snapshots` poblada por cron | ⚠️ Sí pero requiere migración + cron update; no urgente |
| 5 | Estado de cuenta sin NCs | Se resuelve cerrando #1 | ✅ Se cubre con #1 |

### BAJO (reporte avanzado, no necesario hoy)

| # | Gap | Acción | Implementable hoy |
|---|---|---|---|
| 6 | Diferencias de cambio | Pipeline cotizaciones + tabla local + helper conversión | ⚠️ Sí pero módulo aparte; sin caso de uso confirmado |

---

## 5. Implementación segura aplicada en este turno (Fase 5)

### Detector de Notas de Crédito desde `zeta_metadata`

**Archivo:** `lib/copilot-zeta-credit-note.ts` (nuevo, puro y testeable).

Funciones:
- `CFE_NC_TIPOS_DGI` — `Set<number>` con los códigos DGI de NC (102, 112, 122, 132, 142, 182, 202, 212, 222, 232, 242, 282).
- `readCfeTipoFromZetaMetadata(metadata: unknown): number | null` — lee `zeta_customer_voucher_v1.cfe_tipo` defensivamente (camel/snake, number/string).
- `isCreditNoteFromMetadata(metadata: unknown): boolean` — `true` si `cfe_tipo ∈ CFE_NC_TIPOS_DGI`.

**Tests:** `lib/copilot-zeta-credit-note.test.ts` — cubre catálogo, metadata ausente, snake_case, string CFETipo, NaN, código inválido.

**Integración con motor:** opt-in vía un nuevo campo `InvoiceInput.is_credit_note?: boolean`. Si está `true`, el motor:
- Suma el `total_amount` al lado **crédito** (resta de `pendingAtCutoff`, `openingBalance`, `issuedInPeriod`).
- Cuenta la fila en `creditNoteCount` en lugar de `invoiceCount`.

La route `app/api/copilot/financial-reconciliation/route.ts` resuelve `is_credit_note` desde `zeta_metadata` y lo pasa al motor.

**Por qué es seguro:**
- No modifica mappers, pipelines, schema, RLS ni cron.
- El default es `false` → comportamiento idéntico al actual cuando metadata no detecta NC.
- Cubre el caso documentado El País sin afectar clientes sin NCs.
- Tests verifican que clientes sin NCs producen exactamente el mismo output.

---

## 6. Lista clara para el usuario

### ✅ Tenemos implementado

- Clientes (sync + persistencia)
- Facturas (sync + persistencia, con CFETipo en metadata)
- Saldos pendientes (cron 3h, vivo)
- Recibos de cobranza (cabecera)
- Enrichment moneda (USD/UYU)
- Reportes (`/copilot/cartera`) con cards contables separadas: Emitido / Cobrado / Pendiente / Saldo anterior / Efectividad.
- 4 scripts de auditoría contra PDFs Zeta (Comprobantes Pendientes, Análisis de Saldos, Vencimiento de Cuotas, Estado de Cuenta).
- **NUEVO (este turno):** detector de NCs desde `zeta_metadata` + opt-in en motor + tests.

### ⚠️ Falta implementar (data disponible, queda como TODO)

- **Snapshots históricos de `balance_amount`** — tabla local + cron. No urgente si el caso de uso es `Hasta = hoy`.
- **Diferencias de cambio** — pipeline cotizaciones. Módulo aparte.

### ❌ Falta endpoint / documentación Zeta

- **Detalle de aplicaciones de recibo** (qué factura cobra cada recibo) — bloqueante para reconstrucción ledger exacto.
- **Condición de pago por cliente** (`VencimientoDias` real) — bloqueante para `due_date` real y aging por atraso real.
- **Saldo a fecha histórica** — no parece existir como endpoint; se mitiga con snapshots locales.

### Riesgo actual

- Clientes con NCs muestran saldo mayor que en Zeta (DIV-CONT-002). **Mitigado parcialmente en este turno** con el detector — falta encender el motor con opt-in.
- Aging por días de atraso real diverge para clientes con condiciones ≠ 30 días (DIV-CONT-001). Bajo, no rompe cartera.
- Cartera con `Hasta` pasado muestra snapshot vivo, no histórico (DIV-CONT-003). Bajo, raramente operacional.

### Próximo paso recomendado

1. **Encender opt-in de NCs en el motor** una vez validado el caso El País contra el PDF Zeta. (Implementación lista en este turno, opt-in conservador.)
2. **Investigar endpoint Zeta de aplicaciones de recibo** — pedir documentación oficial Zeta o capturar via Postman.
3. **Investigar endpoint Zeta de condición de pago por cliente** — idem.
4. **(Opcional)** snapshots de balance para auditoría histórica si emerge caso de uso.
5. **(Opcional)** pipeline de cotizaciones si negocio quiere "deuda total en USD equivalente".

---

## 7. Referencias

- `lib/copilot-financial-reconciliation.ts` — motor financiero.
- `lib/copilot-zeta-credit-note.ts` — detector NC (nuevo).
- `lib/integrations/zeta/zeta-customer-vouchers-invoice-classifier.ts` — catálogo CFE DGI.
- `lib/integrations/zeta/zeta-customer-vouchers-mapper.ts` — mapper de facturas.
- `lib/integrations/zeta/zeta-collection-receipts-mapper.ts` — mapper de recibos (línea 211 `invoice_id: null`).
- `docs/vendors/z/KNOWN-DIVERGENCES.md` — divergencias documentadas (DIV-CONT-001/002/003/004).
- `docs/zeta/catalog/copilot-zeta-coverage.md` — catálogo de endpoints Zeta.
- `temp-audits/audit-zeta-financial-coverage.mjs` — script de auditoría read-only (este documento).
- `temp-audits/audit-zeta-comprobantes-pendientes.mjs` — validación visual contra PDF.
- `temp-audits/audit-zeta-analisis-saldos.mjs` — validación visual aging.
- `temp-audits/audit-zeta-vencimiento-cuotas.mjs` — validación visual con caveat due_date.
- `temp-audits/audit-zeta-estado-cuenta.mjs` — validación visual estado de cuenta.
