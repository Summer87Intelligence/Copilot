"use client";

import { softCalloutClass } from "@/components/copilot/ui/copilot-visual-system";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { TesoreriaCashDetail } from "./tesoreria-cash-detail";

type Props = {
  workspace: TreasuryWorkspace;
  asOfDate: string;
};

export function TreasuryCashPanel({ workspace }: Props) {
  return (
    <div className="space-y-6">
      <TesoreriaCashDetail workspace={workspace} />

      <div className={softCalloutClass}>
        <p className="text-center text-[11px] text-[var(--copilot-ink-muted)]">
          Tesorería muestra caja disponible. Cartera muestra facturación y deuda de clientes.
        </p>
      </div>
    </div>
  );
}
