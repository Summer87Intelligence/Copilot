"use client";

import type { ReactNode } from "react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { copilotCaptionClass, copilotInputClass } from "@/components/copilot/ui/copilot-visual-system";
import {
  BANK_MOVEMENT_PERIOD_OPTIONS,
  type BankMovementsListFilters,
  type ReconciliationViewFilters,
} from "@/lib/bank-movements/bank-movements-filters";
import {
  BANK_MOVEMENT_DIRECTION_LABELS,
  BANK_MOVEMENT_STATUS_LABELS,
  type BankMovementDirection,
} from "@/lib/bank-movements/bank-movements-types";

type BankMovementsFiltersBarProps = {
  mode: "movements" | "reconciliation";
  filters: BankMovementsListFilters | ReconciliationViewFilters;
  onChange: (filters: BankMovementsListFilters | ReconciliationViewFilters) => void;
  onClear: () => void;
  showingCount: number;
  totalCount: number;
  countLabel: string;
  showPeriodHint?: boolean;
};

const MOVEMENT_STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: BANK_MOVEMENT_STATUS_LABELS.pending },
  { value: "matched", label: BANK_MOVEMENT_STATUS_LABELS.matched },
  { value: "ignored", label: BANK_MOVEMENT_STATUS_LABELS.ignored },
] as const;

const RECONCILIATION_SUGGESTION_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "high", label: "Alta confianza" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baja" },
  { value: "none", label: "Sin sugerencia" },
  { value: "matched", label: "Conciliados" },
  { value: "ignored", label: "Ignorados" },
] as const;

const CURRENCY_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "UYU", label: "UYU" },
  { value: "USD", label: "USD" },
] as const;

const DIRECTION_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "inflow", label: BANK_MOVEMENT_DIRECTION_LABELS.inflow },
  { value: "outflow", label: BANK_MOVEMENT_DIRECTION_LABELS.outflow },
] as const;

function FilterField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs ${className}`}>
      <span className="text-[var(--copilot-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function BankMovementsFiltersBar({
  mode,
  filters,
  onChange,
  onClear,
  showingCount,
  totalCount,
  countLabel,
  showPeriodHint = false,
}: BankMovementsFiltersBarProps) {
  const update = (patch: Partial<BankMovementsListFilters & ReconciliationViewFilters>) => {
    onChange({ ...filters, ...patch });
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <FilterField label="Mes">
          <select
            value={filters.period}
            onChange={(event) =>
              update({ period: event.target.value as BankMovementsListFilters["period"] })
            }
            className={copilotInputClass}
          >
            {BANK_MOVEMENT_PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Moneda">
          <select
            value={filters.currency}
            onChange={(event) =>
              update({ currency: event.target.value as BankMovementsListFilters["currency"] })
            }
            className={copilotInputClass}
          >
            {CURRENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>

        {mode === "movements" ? (
          <FilterField label="Estado">
            <select
              value={(filters as BankMovementsListFilters).status}
              onChange={(event) =>
                update({
                  status: event.target.value as BankMovementsListFilters["status"],
                })
              }
              className={copilotInputClass}
            >
              {MOVEMENT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
        ) : (
          <FilterField label="Confianza / estado">
            <select
              value={(filters as ReconciliationViewFilters).suggestion}
              onChange={(event) =>
                update({
                  suggestion: event.target.value as ReconciliationViewFilters["suggestion"],
                })
              }
              className={copilotInputClass}
            >
              {RECONCILIATION_SUGGESTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
        )}

        <FilterField label="Dirección">
          <select
            value={filters.direction}
            onChange={(event) =>
              update({ direction: event.target.value as BankMovementDirection | "all" })
            }
            className={copilotInputClass}
          >
            {DIRECTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Búsqueda" className="sm:col-span-2 xl:col-span-1">
          <input
            type="search"
            value={filters.text}
            onChange={(event) => update({ text: event.target.value })}
            placeholder={
              mode === "movements"
                ? "Buscar por nombre, descripción o referencia..."
                : "Buscar movimiento o sugerencia..."
            }
            className={copilotInputClass}
          />
        </FilterField>

        <FilterField label="Monto">
          <input
            type="search"
            inputMode="decimal"
            value={filters.amount}
            onChange={(event) => update({ amount: event.target.value })}
            placeholder="Ej. 3548 o 3.548"
            className={copilotInputClass}
          />
        </FilterField>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={copilotCaptionClass}>
          Mostrando {showingCount} de {totalCount} {countLabel}
        </p>
        <button
          type="button"
          onClick={onClear}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          Limpiar filtros
        </button>
      </div>

      {showPeriodHint ? (
        <p className={copilotCaptionClass}>
          Mostrando movimientos del mes actual. Cambiá el filtro para ver meses anteriores.
        </p>
      ) : null}
    </div>
  );
}
