# Canonical Analytics Architecture (Copilot)

> Fuente única de verdad por métrica. Toda superficie (Ventas, Finanzas, Cartera,
> Clientes, Cliente 360, Reportes, Hoy, Dashboard) debe consumir estas funciones
> canónicas y NO recalcular fórmulas en paralelo. Documento vivo — actualizar al
> agregar/mover una métrica.

Última actualización: FASE 9E + reconciliación de Reportes (2026-07-16).

## Principios

1. **Una métrica, una función.** Igual workspace + período + moneda + corte ⇒ igual
   resultado en todas las secciones.
2. **UYU y USD nunca se suman entre sí.** Consolidado solo con tipo de cambio explícito
   y visible.
3. **Las funciones canónicas son puras** (no tocan DB): reciben filas ya cargadas
   (scoped al tenant por RLS) y devuelven métricas. La carga/paginación vive en
   data-sources server-side.
4. **Zeta es la fuente**: `proto_invoices` (comprobantes), `proto_receipts` (recibos),
   `bank_movements` (banco canónico). No se inventan endpoints ni campos.

## Resolución de moneda (crítica)

`lib/sales/canonical/issued-sale-universe.ts` → `resolveCanonicalSaleCurrency(row)`:
`currency_code` ISO → fallback a `zeta_metadata.zeta_customer_voucher_v1.raw_payload.MonedaCodigo`
(`1`→UYU, `2`→USD). Devuelve `null` si no resuelve.

Motivo (FASE 9E): comprobantes internos CCV1 (`ZETA:CCV1:NOSER:…:701`, `CFETipo=0`
con líneas de venta — caso PRESTIS) pueden tener `currency_code` nulo pero
`MonedaCodigo` válido. Resolver solo por `currency_code` los descartaba, produciendo
divergencias (UYU $97.417 entre Ventas y Finanzas; misma causa en Reportes).

**Consumidores obligados** de la resolución canónica de moneda de ventas:
- Ventas: `lib/sales/canonical/build-canonical-sales.ts` (`resolveCurrency` delega).
- Finanzas: `lib/copilot-financial-reconciliation.ts` (`resolveInvoiceCurrency`, 5 lecturas de factura).
- Reportes: `lib/reports/net-sales-report/build-net-sales-report-model.ts` (`isValidInvoice`),
  y por reuso `lib/reports/executive-monthly-report`.

Excepción legítima: **recibos** (`proto_receipts`) NO tienen payload de voucher; se
resuelven por `currency_code` (p. ej. `collections-report`, loop de recibos en la
reconciliación). Es correcto y no debe "arreglarse".

## Matriz de métricas canónicas

| Métrica | Fuente canónica | Definición | Consumidores |
|---|---|---|---|
| Moneda de venta | `issued-sale-universe.resolveCanonicalSaleCurrency` | currency_code → MonedaCodigo | Ventas, Finanzas, Reportes |
| Universo de venta emitida | `issued-sale-universe.classifyIssuedSaleRow` / `isValidIssuedSaleRow` | activa, no anulada, total>0, moneda resuelta, no NC | Ventas, Finanzas, Reportes |
| Neto emitido por moneda | `issued-sale-universe.netIssuedByCurrency` = Σfacturas − ΣNC | por moneda, sin mezclar | Ventas, Finanzas, Reportes |
| Ventas emitidas / netas / NC (documento) | `lib/sales/canonical/sales-aggregations.buildSalesPeriodSnapshot` | grossAmount por documento; net = emitido − NC | Ventas, Cliente 360, Reportes |
| Dedup shadow↔CCV1 | `lib/copilot-zeta-invoice-canonical-dedup.dedupeZetaShadowInvoicesCanonical` | 3 pasos (registro, bucket±0.20, fingerprint) | Ventas, Finanzas, Cartera |
| Emitido/pendiente/cobrado aplicado/NC (financiero) | `lib/financial/canonical` (`buildCanonicalSalesMetrics`, `buildCanonicalRegisteredCollectionsMetrics`) + `generateFinancialConsistencyReport` | issue_date anclado; pendingAtCutoff incluye pre-período | Finanzas, Cartera, Dashboard, Hoy |
| Atraso / aging | `lib/financial/canonical/aging.ts` + `lib/copilot/cartera-operating-aging.ts` | por `due_date` y saldo al corte; buckets al día/1–7/8–14/15–30/+30 | Cartera, Cliente 360, Reportes |
| Cobranza registrada vs aplicada | `lib/financial/canonical/collections.ts` | registrada = recibos por receipt_date; aplicada = emitido − pendiente | Cobranza, Finanzas |
| Caja / tesorería | `lib/treasury/canonical/*` sobre `bank_movements` | disponible ≠ suma mensual; proyectada con recurrentes | Tesorería, Hoy, Reportes |
| Banco canónico | `bank_movements` (+ `lib/bank/canonical/`) | corte 2026-07-01; legacy `bank_reconciliation_movements` read-only | Banco, Tesorería |
| Cliente comercial vigente | `lib/sales/sales-client-salesperson-repository.resolveClientSalespersonOnDate` | por cliente, vigencia temporal desde 2026-07-01 | Ventas, Cliente 360, Comerciales |

## Reglas semánticas invariantes

- **Notas de crédito**: restan del neto; no son factura positiva; no crean cliente
  comprador; no suman servicio ni ticket ni venta de comercial.
- **Anulados / inactivos / pre-2026 / sin moneda**: excluidos de KPI.
- **Atraso**: siempre por `due_date`, nunca por `issue_date`.
- **"Caja"**: saldo disponible, no una suma mensual de movimientos.

## Sección Hoy

`Hoy` consume funciones compartidas (p. ej. reconciliación / snapshots). Cualquier
cambio en una función canónica debe preservar el resultado visible de Hoy sin alterar
su diseño, cards, jerarquía, textos ni navegación. Verificar paridad antes de tocar
una función compartida por Hoy.
