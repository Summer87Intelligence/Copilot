/**
 * Modelo reusable de reporte de actividad bancaria (FASE-3).
 *
 * NO construye pantalla ni PDF: expone un modelo puro derivado del snapshot para
 * un futuro reporte. Entradas/salidas operativas, neto bancario, conciliados,
 * pendientes e históricos excluidos — por moneda, sin mezclar UYU/USD.
 */
import type {
  BankActivityReportModel,
  BankActivityReportCurrencyRow,
  CanonicalBankSnapshot,
} from "@/lib/bank/canonical/types";

export function buildBankActivityReportModel(
  snapshot: CanonicalBankSnapshot
): BankActivityReportModel {
  const rows: BankActivityReportCurrencyRow[] = snapshot.byCurrency.map((block) => ({
    currency: block.currency,
    operationalInflows: block.operational.inflows,
    operationalOutflows: block.operational.outflows,
    operationalNet: block.operational.net,
    reconciledCount: block.operational.reconciledCount,
    pendingCount: block.operational.pendingCount,
    historicalExcludedCount: block.historical.movementCount,
  }));

  return { cutoff: snapshot.period.cutoff, rows };
}
