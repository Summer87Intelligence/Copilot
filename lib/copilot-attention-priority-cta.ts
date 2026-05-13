import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import {
  snapshotCoverageRatio,
  snapshotLiquidityBalance,
  snapshotRiskBand,
} from "@/lib/copilot-financial-snapshot-selectors";
import type { FiscalAlertItem } from "@/lib/copilot-tax-alerts";

export function pickPrimaryAttentionCta(
  primary: FiscalAlertItem,
  snapshot: FinancialSnapshotApiV1 | null
): { label: string; href: string } {
  const coverageStress =
    snapshot != null &&
    (snapshotCoverageRatio(snapshot) < 1 ||
      snapshotLiquidityBalance(snapshot) < 0 ||
      snapshotRiskBand(snapshot) === "high" ||
      snapshotRiskBand(snapshot) === "critical");
  if (
    primary.type === "cobertura" ||
    primary.type === "liquidez" ||
    coverageStress
  ) {
    return {
      label: "Ver plan de cobertura",
      href: "/copilot/finanzas?mode=cobertura&from=atencion-prioritaria#copilot-finanzas-cobertura",
    };
  }
  return {
    label: "Resolver ahora",
    href: "/copilot/finanzas#copilot-finanzas-fiscal",
  };
}
