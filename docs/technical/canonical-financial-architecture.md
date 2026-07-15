# Arquitectura financiera canónica — visión consolidada (FASE-5)

Resumen de la arquitectura financiera canónica construida en FASE 0–4. Este
documento es el índice de alto nivel; cada capa tiene su doc detallada enlazada.

- Capa financiera: [financial-canonical-layer.md](./financial-canonical-layer.md)
- Capa bancaria: [canonical-bank-movements.md](./canonical-bank-movements.md)
- Migración Tesorería: [treasury-canonical-migration.md](./treasury-canonical-migration.md)

## 1. Fuentes de verdad

| Dominio | Fuente canónica | Tabla(s) base |
| --- | --- | --- |
| Ventas emitidas | `buildCanonicalSalesMetrics` | `proto_invoices` (issue_date) |
| Cobrado registrado | `buildCanonicalRegisteredCollectionsMetrics` | `proto_receipts` (receipt_date) |
| Cobrado aplicado | `buildCanonicalCollectionsSnapshot` | recibos aplicados hasta cutoff |
| Deuda / saldo | `buildCanonicalDebtSnapshot` / `buildCanonicalDebtUnits` | facturas + cuotas |
| Aging operativo | `buildCanonicalAgingMetrics` | unidades de deuda vs due_date |
| Banco | `buildCanonicalBankSnapshot` | `bank_movements` |
| Caja / proyección | `buildTreasuryProjection` | manual cash + obligaciones (+ banco legacy vía adaptador) |

Todos los consumidores importan desde los barrels `@/lib/financial/canonical` y
`@/lib/bank/canonical`. Ningún módulo recalcula lógica financiera por su cuenta.

## 2. Métricas y su definición

| Métrica | Fecha rectora | Nota |
| --- | --- | --- |
| Ventas emitidas | `issue_date` | del período |
| Cobrado registrado | `receipt_date` | recibos contables del período |
| Cobrado aplicado | `cutoff` | aplicado a facturas hasta el corte |
| Saldo pendiente | — | emitido − aplicado |
| Saldo al día / atrasado | `due_date` | aging operativo |
| Saldo sin vencimiento | `due_date` nulo | `no_issue_date` / sin vencimiento |
| % cobranza aplicado | — | aplicado / emitido |

**Aplicado ≠ Registrado por diseño** (FASE-2): son métricas distintas; su diferencia
es esperada y se reporta explícitamente, no es un defecto.

## 3. Reglas de moneda y fecha

- **UYU y USD siempre separados.** No se suman sin tipo de cambio explícito.
- **`MIN_FINANCIAL_DATE = '2026-01-01'`**: pre-2026 excluido por hard filter en todas
  las queries financieras.
- **`BANK_OPERATIONAL_START_DATE = '2026-07-01'`**: banco < corte = histórico
  (visible pero fuera de métricas/tareas operativas). Ver capa bancaria.

## 4. Responsabilidades por módulo

| Módulo | Responsable de | NO responsable de |
| --- | --- | --- |
| Banco | movimientos importados, conciliación, política histórica | caja |
| Tesorería | posición de caja, proyección, compromisos, recurrentes | extracto bancario |
| Finanzas | KPIs financieros canónicos | operación diaria |
| Cobranza | facturas, recibos, deuda, cobrado | proyección de caja |
| Hoy / Cartera / Cliente 360 | vistas sobre las capas canónicas | recomputar métricas |

## 5. Banco ≠ Caja

- `bank_movements` es la fuente **operativa bancaria** (importación Santander).
- La **caja** de Tesorería NO se calcula desde movimientos bancarios: opening desde
  manual cash + obligaciones. El banco legacy entra al cashflow SOLO por el punto
  único `lib/treasury/canonical/treasury-bank-source` (compatibilidad), y la única
  fila legacy real está `ignored` ⇒ aporte 0. Sin doble conteo.

## 6. Consistencia cross-module (verificada)

Tests: `lib/financial/canonical/cross-module-consistency.test.ts`,
`lib/copilot/cartera-operating-aging.consistency.test.ts`,
`lib/copilot-financial-reconciliation.test.ts` (206 tests verdes).

Diffs reales read-only (FASE-5): deuda → total Pending conservado (NO_DIFFERENCE),
redistribución de buckets = EXPECTED_SEMANTIC_CHANGE (migración a aging operativo);
colecciones → aplicado vs registrado = distinción esperada; banco → 57 op / 894 hist
/ 951 total, 0 duplicados; tesorería → NO_DIFFERENCE. Ningún IMPLEMENTATION_DEFECT.

## 7. Limitaciones Zeta

Zeta no se consulta en vivo por request; base local + sync incremental. Recibos
VARIOS / pending_review y shadows se reconcilian en el pipeline. Ver `docs/vendors/z/`.

## 8. Legacy restante (plan de retiro)

| Legacy | Consumidores | Motivo | Fase de retiro |
| --- | --- | --- | --- |
| `bank_reconciliation_movements` | `treasury-bank-source` (único para cash) + subsistema conciliación (CRUD/import/panel/4 rutas API) | compatibilidad + feature propia | tras redefinir Banco≠Caja y migrar conciliación a `bank_movements` |
| Campos `collected` legacy / buckets contables | vistas antiguas | compatibilidad de contrato | tras confirmar consumidores en canónico |
| `dominantAgingRange`, `no_issue_date`, portfolio legacy fields | Cartera/Cliente 360 | compatibilidad aditiva | cuando todos los consumidores lean aging operativo |
| `collection-aging-model` | reportes legacy | compatibilidad | fase de reportes canónicos |

Ninguno se retira en FASE-5 (todos con consumidores activos).

## 9. Scripts de auditoría (read-only)

`scripts/audit-canonical-debt-diff.ts`, `audit-canonical-collections-diff.ts`,
`audit-canonical-bank-diff.ts`, `audit-treasury-canonical-diff.ts`,
`audit-debt-rollup-consistency.ts`. Todos SELECT-only, sin DML, sin secretos en
output, funcionan con `.env.local` (NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE_KEY).
