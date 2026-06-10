"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { CopilotButton } from "@/components/copilot/ui/copilot-button";
import { softCalloutClass } from "@/components/copilot/ui/copilot-visual-system";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { TesoreriaCashDetail } from "./tesoreria-cash-detail";
import { TesoreriaPaymentSummary } from "./tesoreria-payment-summary";
import { QuickMovementForm } from "./treasury-cash-panel-forms";

type FormPreset = Partial<{
  movementType: "income" | "expense";
  mode: "now" | "scheduled";
}>;

type Props = {
  workspace: TreasuryWorkspace;
  asOfDate: string;
  formRequest?: { key: number; preset?: FormPreset } | null;
  onFormRequestHandled?: () => void;
};

export function TreasuryCashPanel({
  workspace,
  asOfDate,
  formRequest,
  onFormRequestHandled,
}: Props) {
  const { canWrite } = useCopilotPermissions();
  const [showForm, setShowForm] = useState(false);
  const [formPreset, setFormPreset] = useState<FormPreset | undefined>(undefined);

  useEffect(() => {
    if (!formRequest) return;
    setFormPreset(formRequest.preset);
    setShowForm(true);
    onFormRequestHandled?.();
  }, [formRequest, onFormRequestHandled]);

  const openForm = (preset: FormPreset) => {
    setFormPreset(preset);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setFormPreset(undefined);
  };

  return (
    <div className="space-y-6">
      <TesoreriaCashDetail workspace={workspace} />

      {canWrite ? (
        <section className="space-y-3">
          <p className="text-sm font-semibold text-[var(--copilot-ink)]">Registro rápido</p>
          <div className="flex flex-wrap gap-2">
            <CopilotButton type="button" size="sm" onClick={() => openForm({ movementType: "income", mode: "now" })}>
              Cargar ingreso
            </CopilotButton>
            <CopilotButton
              type="button"
              variant="danger"
              size="sm"
              onClick={() => openForm({ movementType: "expense", mode: "now" })}
            >
              Cargar egreso
            </CopilotButton>
            {!showForm ? (
              <CopilotButton type="button" variant="secondary" size="sm" onClick={() => openForm({})}>
                <Plus className="h-4 w-4" aria-hidden />
                Otro movimiento
              </CopilotButton>
            ) : null}
          </div>
        </section>
      ) : null}

      {showForm ? (
        <QuickMovementForm workspace={workspace} initial={formPreset} onClose={closeForm} />
      ) : null}

      <TesoreriaPaymentSummary workspace={workspace} asOfDate={asOfDate} />

      <div className={softCalloutClass}>
        <p className="text-center text-[11px] text-[var(--copilot-ink-muted)]">
          Tesorería muestra caja disponible. Cartera muestra facturación y deuda de clientes.
        </p>
      </div>
    </div>
  );
}
