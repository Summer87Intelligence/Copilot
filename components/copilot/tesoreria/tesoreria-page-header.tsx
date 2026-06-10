"use client";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarClock,
  Lock,
  RefreshCw,
  Repeat,
} from "lucide-react";

import { CopilotButton } from "@/components/copilot/ui/copilot-button";
import { premiumCardClass } from "@/components/copilot/ui/copilot-visual-system";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { TesoreriaCashCards } from "./tesoreria-cash-cards";

export type TesoreriaQuickAction = "income" | "expense" | "scheduled" | "recurring";

type Props = {
  workspace: TreasuryWorkspace;
  onQuickAction: (action: TesoreriaQuickAction) => void;
  onRefresh: () => void;
};

const QUICK_ACTIONS: {
  id: TesoreriaQuickAction;
  label: string;
  hint: string;
  detail: string;
  icon: typeof ArrowUpCircle;
}[] = [
  {
    id: "income",
    label: "Cargar ingreso",
    hint: "Plata que entra manualmente.",
    detail: "Ejemplo: aporte, ajuste, ingreso no-Zeta.",
    icon: ArrowUpCircle,
  },
  {
    id: "expense",
    label: "Cargar egreso",
    hint: "Plata que sale manualmente.",
    detail: "Ejemplo: retiro, gasto puntual, pago no programado.",
    icon: ArrowDownCircle,
  },
  {
    id: "scheduled",
    label: "Nuevo pago programado",
    hint: "Pago único con fecha futura.",
    detail: "Ejemplo: BPS Mayo, proveedor puntual, DGI de este mes.",
    icon: CalendarClock,
  },
  {
    id: "recurring",
    label: "Nuevo pago recurrente",
    hint: "Pago que se repite automáticamente.",
    detail: "Ejemplo: Netflix todos los 1 del mes — USD 5. Frecuencia: mensual, semanal o anual.",
    icon: Repeat,
  },
];

export function TesoreriaPageHeader({ workspace, onQuickAction, onRefresh }: Props) {
  const { canWrite } = useCopilotPermissions();

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <CopilotButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={workspace.loading}
        >
          <RefreshCw className={`h-4 w-4 ${workspace.loading ? "animate-spin" : ""}`} aria-hidden />
          Refrescar
        </CopilotButton>
      </div>

      <TesoreriaCashCards workspace={workspace} />

      <div>
        <p className="mb-3 text-sm font-semibold text-[var(--copilot-ink)]">Acciones rápidas</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            if (!canWrite) {
              return (
                <div
                  key={action.id}
                  title="Solo disponible para superadmin."
                  className={`flex min-h-[120px] cursor-not-allowed flex-col gap-2 ${premiumCardClass} p-4 opacity-60`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-[var(--copilot-ink-muted)]" aria-hidden />
                    <Lock className="h-3.5 w-3.5 text-[var(--copilot-ink-muted)]" aria-hidden />
                  </div>
                  <span className="text-sm font-semibold text-[var(--copilot-ink-muted)]">{action.label}</span>
                  <span className="text-xs text-[var(--copilot-ink-muted)]">{action.hint}</span>
                </div>
              );
            }
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => onQuickAction(action.id)}
                className={`flex min-h-[120px] flex-col gap-1.5 text-left transition hover:border-[var(--copilot-accent)]/35 hover:shadow-md ${premiumCardClass} p-4`}
              >
                <Icon className="h-5 w-5 text-[var(--copilot-accent)]" aria-hidden />
                <span className="text-sm font-semibold text-[var(--copilot-ink)]">{action.label}</span>
                <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">{action.hint}</span>
                <span className="text-[11px] leading-snug text-[var(--copilot-ink-muted)]">{action.detail}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
          <strong className="font-semibold">Pago programado:</strong> pago único con fecha futura.{" "}
          <strong className="font-semibold">Pago recurrente:</strong> se repite automáticamente (mensual, semanal o anual).
        </p>
      </div>
    </div>
  );
}
