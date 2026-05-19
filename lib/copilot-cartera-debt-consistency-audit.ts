/**
 * Auditoría de consistencia entre KPIs de moneda y filas del Explorador.
 * Sin recálculo financiero: solo suma `staleClients.pendingByCurrency`.
 */

import type {
  FinancialConsistencyReport,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";
import { buildCurrencyIndex } from "@/lib/copilot-cartera-cards-source";

const ROUND_EPSILON = 0.02;

export type CurrencyDebtConsistencyRow = {
  currency: ReconciliationCurrencyCode;
  /** Suma de `pendingByCurrency[currency]` en todos los staleClients. */
  sumClientPending: number;
  /** `report.currencies[].pendingAtCutoff` (cards superiores). */
  pendingAtCutoff: number;
  /** `report.currencies[].totalPending` (solo facturas emitidas en el período). */
  totalPendingInPeriod: number;
  /** `previousPending` derivado en cards (pre-período con saldo vivo). */
  previousPending: number;
  /** `openingBalance` ledger del motor. */
  openingBalance: number;
  deltaClientSumVsCutoff: number;
  clientSumMatchesCutoff: boolean;
};

export type CarteraDebtConsistencyAudit = {
  currencies: CurrencyDebtConsistencyRow[];
  /** Cliente concreto para comparar fila Explorer vs totales de moneda. */
  findClient: (companyId: string) => {
    companyId: string;
    companyName: string | null;
    pendingByCurrency: Partial<Record<ReconciliationCurrencyCode, number>>;
  } | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function auditCarteraDebtConsistency(
  report: FinancialConsistencyReport
): CarteraDebtConsistencyAudit {
  const index = buildCurrencyIndex(report.currencies);
  const codes: ReconciliationCurrencyCode[] = ["UYU", "USD"];

  const currencies: CurrencyDebtConsistencyRow[] = codes.map((currency) => {
    const metrics = index.get(currency);
    const sumClientPending = roundMoney(
      report.staleClients.reduce(
        (sum, c) => sum + (c.pendingByCurrency[currency] ?? 0),
        0
      )
    );
    const pendingAtCutoff = metrics?.pendingAtCutoff ?? 0;
    const delta = roundMoney(sumClientPending - pendingAtCutoff);
    return {
      currency,
      sumClientPending,
      pendingAtCutoff,
      totalPendingInPeriod: metrics?.totalPending ?? 0,
      previousPending: metrics?.previousPending ?? 0,
      openingBalance: metrics?.openingBalance ?? 0,
      deltaClientSumVsCutoff: delta,
      clientSumMatchesCutoff: Math.abs(delta) <= ROUND_EPSILON,
    };
  });

  return {
    currencies,
    findClient: (companyId) => {
      const id = companyId.trim();
      const row = report.staleClients.find((c) => c.companyId === id);
      if (!row) return null;
      return {
        companyId: row.companyId,
        companyName: row.companyName,
        pendingByCurrency: row.pendingByCurrency,
      };
    },
  };
}
