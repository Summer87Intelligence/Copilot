"use client";

import { softCalloutClass } from "@/components/copilot/ui/copilot-visual-system";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { TreasuryExecutiveForecastPanel } from "./treasury-executive-forecast-panel";
import { TesoreriaCashDetail } from "./tesoreria-cash-detail";

type Props = {
  workspace: TreasuryWorkspace;
  asOfDate: string;
};

export function TreasuryCashPanel({ workspace, asOfDate }: Props) {
  return (
    <div className="space-y-6">
      <TreasuryExecutiveForecastPanel workspace={workspace} asOfDate={asOfDate} />

      <div className="border-t border-dashed border-[var(--copilot-border)] pt-6">
        <TesoreriaCashDetail workspace={workspace} />
      </div>

      <div className={softCalloutClass}>
        <p className="text-center text-[11px] text-[var(--copilot-ink-muted)]">
          Tesorería muestra caja disponible. Cartera muestra facturación y deuda de clientes.
        </p>
      </div>
    </div>
  );
}
