#!/usr/bin/env node
/**
 * Auditoría local de consistencia de fuentes financieras.
 * No modifica datos; documenta qué módulo define cada métrica.
 *
 * Uso: node scripts/qa-financial-consistency.mjs
 */

const rows = [
  {
    metric: "Caja disponible",
    hoy: "Tesorería cash-position (mismo API)",
    tesoreria: "availableCash por moneda",
    cartera: "—",
    reportes: "—",
    finanzas: "buildFinancialPanoramaModel → projection.cashToday*",
    estado: "Debe coincidir si misma fecha de corte y baseline",
  },
  {
    metric: "Deuda total",
    hoy: "Cartera / portfolio",
    tesoreria: "—",
    cartera: "pendingAtCutoff + aging",
    reportes: "Deudores",
    finanzas: "NormalizedCurrencyMetrics.pendingAtCutoff",
    estado: "Misma fuente Cartera",
  },
  {
    metric: "Deuda vencida",
    hoy: "sumCarteraAgingOverdue",
    tesoreria: "—",
    cartera: "buckets 31–60 + 61–90 + 90+",
    reportes: "Deudores (vencido)",
    finanzas: "agingByCurrency → slice.overdue",
    estado: "Misma fuente Cartera",
  },
  {
    metric: "Cobros del mes",
    hoy: "Recibos período",
    tesoreria: "—",
    cartera: "—",
    reportes: "Reporte cobranza (fecha recibo)",
    finanzas: "sumMonth recibos + reconciliation portfolioResolved",
    estado: "Reporte = calendario; Finanzas período = MTD hasta corte",
  },
  {
    metric: "Ventas netas",
    hoy: "Facturas período − NC",
    tesoreria: "—",
    cartera: "—",
    reportes: "Reporte ventas netas",
    finanzas: "issuedInPeriodNet / monthly trends netIssued",
    estado: "Misma fórmula bruto − NC",
  },
  {
    metric: "Proyección 30 días",
    hoy: "Snapshot financiero",
    tesoreria: "Proyección tesorería",
    cartera: "—",
    reportes: "—",
    finanzas: "FinancialSnapshotApiV1 selectores",
    estado: "Operativa; no es caja bancaria",
  },
];

console.log("\n=== QA consistencia financiera (fuentes) ===\n");
console.log(
  "| Métrica | Hoy | Tesorería | Cartera | Reportes | Finanzas | Estado |",
);
console.log(
  "|---|---|---|---|---|---|",
);
for (const r of rows) {
  console.log(
    `| ${r.metric} | ${r.hoy} | ${r.tesoreria} | ${r.cartera} | ${r.reportes} | ${r.finanzas} | ${r.estado} |`,
  );
}
console.log(
  "\nNota: comparar valores reales en runtime con dev tools o /api/copilot/financial-reconciliation y treasury/cash-position.\n",
);
