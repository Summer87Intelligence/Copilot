/**
 * Selectores de lectura del snapshot financiero — **vía recomendada** para código nuevo.
 *
 * Prioriza el contrato canónico v1 (`realized` / `expected` / `projected`) y cae a KPI planos
 * (`FinancialSnapshot`) solo por **compatibilidad** hasta retirada acordada del JSON legacy.
 * Misma semántica numérica que antes de la migración progresiva.
 *
 * **Deprecación controlada:** no simplifiqués ni eliminéis estos fallbacks (`??`) mientras el
 * payload HTTP siga incluyendo campos planos; los builders y `mergeFinancialSnapshotApiV1` en
 * `copilot-financial-engine` dependen de esa convivencia.
 */

import type {
  FinancialSnapshot,
  FinancialSnapshotApiV1,
} from "@/lib/copilot-financial-engine";

export function snapshotCashNet(s: FinancialSnapshotApiV1): number {
  return s.realized?.cash_net ?? s.available_cash;
}

export function snapshotReceivablesRiskWeighted(s: FinancialSnapshotApiV1): number {
  return s.expected?.receivables_risk_weighted ?? s.expected_inflows;
}

export function snapshotExpectedOutflowsTotal(s: FinancialSnapshotApiV1): number {
  const e = s.expected;
  if (
    e &&
    typeof e.outflows_operational_scheduled === "number" &&
    typeof e.outflows_fiscal_due === "number"
  ) {
    return e.outflows_operational_scheduled + e.outflows_fiscal_due;
  }
  return s.expected_outflows;
}

export function snapshotLiquidityBalance(s: FinancialSnapshotApiV1): number {
  return s.projected?.liquidity_balance ?? s.projected_balance;
}

export function snapshotCoverageRatio(s: FinancialSnapshotApiV1): number {
  return s.projected?.coverage_ratio ?? s.coverage_ratio;
}

export function snapshotRiskBand(s: FinancialSnapshotApiV1): FinancialSnapshot["risk_level"] {
  return (s.projected?.risk_band ?? s.risk_level) as FinancialSnapshot["risk_level"];
}
