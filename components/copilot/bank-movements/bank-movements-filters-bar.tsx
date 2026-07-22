"use client";

import { copilotCaptionClass } from "@/components/copilot/ui/copilot-visual-system";
import {
  FilterBar,
  FilterField,
  FilterSelect,
  FilterSearchInput,
} from "@/components/copilot/ui/filter-bar";
import type { FilterValues } from "@/lib/ui/filter-bar-model";
import {
  BANK_MOVEMENT_DUPLICATES_OPTIONS,
  BANK_MOVEMENT_PERIOD_OPTIONS,
  BANK_MOVEMENT_SCOPE_OPTIONS,
  BANK_MOVEMENT_SOURCE_OPTIONS,
  BANK_MOVEMENT_VISIBILITY_OPTIONS,
  DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
  DEFAULT_RECONCILIATION_VIEW_FILTERS,
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
  showWithSuggestionHint?: boolean;
  /** Write/admin Banco: ve Ocultos/Todos. Read-only solo Visibles. */
  canManageVisibility?: boolean;
  /** `inflow_readonly`: dirección forzada a ingresos server-side; el filtro no aporta nada. */
  hideDirectionFilter?: boolean;
};

const MOVEMENT_STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: BANK_MOVEMENT_STATUS_LABELS.pending },
  { value: "matched", label: BANK_MOVEMENT_STATUS_LABELS.matched },
  { value: "ignored", label: BANK_MOVEMENT_STATUS_LABELS.ignored },
] as const;

const RECONCILIATION_SUGGESTION_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "with_suggestion", label: "Con sugerencia" },
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

/** Valores/defaults para el conteo de filtros activos del FilterBar. */
function filterState(
  mode: "movements" | "reconciliation",
  filters: BankMovementsListFilters | ReconciliationViewFilters
): { values: FilterValues; defaults: FilterValues } {
  if (mode === "movements") {
    const f = filters as BankMovementsListFilters;
    const d = DEFAULT_BANK_MOVEMENTS_LIST_FILTERS;
    return {
      values: {
        period: f.period,
        scope: f.scope,
        currency: f.currency,
        status: f.status,
        direction: f.direction,
        text: f.text,
        amount: f.amount,
        amountMin: f.amountMin,
        amountMax: f.amountMax,
        duplicates: f.duplicates,
        source: f.source,
        visibility: f.visibility,
      },
      defaults: {
        period: d.period,
        scope: d.scope,
        currency: d.currency,
        status: d.status,
        direction: d.direction,
        text: d.text,
        amount: d.amount,
        amountMin: d.amountMin,
        amountMax: d.amountMax,
        duplicates: d.duplicates,
        source: d.source,
        visibility: d.visibility,
      },
    };
  }
  const f = filters as ReconciliationViewFilters;
  const d = DEFAULT_RECONCILIATION_VIEW_FILTERS;
  return {
    values: {
      period: f.period,
      currency: f.currency,
      suggestion: f.suggestion,
      direction: f.direction,
      text: f.text,
      amount: f.amount,
    },
    defaults: {
      period: d.period,
      currency: d.currency,
      suggestion: d.suggestion,
      direction: d.direction,
      text: d.text,
      amount: d.amount,
    },
  };
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
  showWithSuggestionHint = false,
  canManageVisibility = false,
  hideDirectionFilter = false,
}: BankMovementsFiltersBarProps) {
  const update = (patch: Partial<BankMovementsListFilters & ReconciliationViewFilters>) => {
    onChange({ ...filters, ...patch });
  };
  const { values, defaults } = filterState(mode, filters);

  return (
    <div className="space-y-2">
      <FilterBar values={values} defaults={defaults} onClear={onClear}>
        <FilterField label="Mes" htmlFor="bank-filter-period">
          <FilterSelect
            id="bank-filter-period"
            value={filters.period}
            onChange={(v) => update({ period: v as BankMovementsListFilters["period"] })}
            options={BANK_MOVEMENT_PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            ariaLabel="Filtrar por mes"
          />
        </FilterField>

        {mode === "movements" ? (
          <FilterField label="Alcance" htmlFor="bank-filter-scope">
            <FilterSelect
              id="bank-filter-scope"
              value={(filters as BankMovementsListFilters).scope}
              onChange={(v) => update({ scope: v as BankMovementsListFilters["scope"] })}
              options={BANK_MOVEMENT_SCOPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              ariaLabel="Filtrar por alcance"
            />
          </FilterField>
        ) : null}

        <FilterField label="Moneda" htmlFor="bank-filter-currency">
          <FilterSelect
            id="bank-filter-currency"
            value={filters.currency}
            onChange={(v) => update({ currency: v as BankMovementsListFilters["currency"] })}
            options={CURRENCY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            ariaLabel="Filtrar por moneda"
          />
        </FilterField>

        {mode === "movements" ? (
          <FilterField label="Estado" htmlFor="bank-filter-status">
            <FilterSelect
              id="bank-filter-status"
              value={(filters as BankMovementsListFilters).status}
              onChange={(v) => update({ status: v as BankMovementsListFilters["status"] })}
              options={MOVEMENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              ariaLabel="Filtrar por estado"
            />
          </FilterField>
        ) : (
          <FilterField label="Confianza / estado" htmlFor="bank-filter-suggestion">
            <FilterSelect
              id="bank-filter-suggestion"
              value={(filters as ReconciliationViewFilters).suggestion}
              onChange={(v) => update({ suggestion: v as ReconciliationViewFilters["suggestion"] })}
              options={RECONCILIATION_SUGGESTION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              ariaLabel="Filtrar por confianza o estado"
            />
          </FilterField>
        )}

        {hideDirectionFilter ? null : (
          <FilterField label="Dirección" htmlFor="bank-filter-direction">
            <FilterSelect
              id="bank-filter-direction"
              value={filters.direction}
              onChange={(v) => update({ direction: v as BankMovementDirection | "all" })}
              options={DIRECTION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              ariaLabel="Filtrar por dirección"
            />
          </FilterField>
        )}

        <FilterField label="Búsqueda" htmlFor="bank-filter-text" className="min-w-[180px] flex-1">
          <FilterSearchInput
            id="bank-filter-text"
            value={filters.text}
            onChange={(v) => update({ text: v })}
            placeholder={
              mode === "movements"
                ? "Nombre, descripción o referencia…"
                : "Movimiento o sugerencia…"
            }
            ariaLabel="Buscar movimiento"
          />
        </FilterField>

        <FilterField label="Monto exacto" htmlFor="bank-filter-amount">
          <FilterSearchInput
            id="bank-filter-amount"
            value={filters.amount}
            onChange={(v) => update({ amount: v })}
            placeholder="Ej. 3548"
            ariaLabel="Buscar por monto exacto"
          />
        </FilterField>

        {mode === "movements" ? (
          <>
            <FilterField label="Importe mín." htmlFor="bank-filter-amount-min">
              <FilterSearchInput
                id="bank-filter-amount-min"
                value={(filters as BankMovementsListFilters).amountMin}
                onChange={(v) => update({ amountMin: v })}
                placeholder="Desde"
                ariaLabel="Filtrar por importe mínimo"
              />
            </FilterField>
            <FilterField label="Importe máx." htmlFor="bank-filter-amount-max">
              <FilterSearchInput
                id="bank-filter-amount-max"
                value={(filters as BankMovementsListFilters).amountMax}
                onChange={(v) => update({ amountMax: v })}
                placeholder="Hasta"
                ariaLabel="Filtrar por importe máximo"
              />
            </FilterField>
            <FilterField label="Duplicados" htmlFor="bank-filter-duplicates">
              <FilterSelect
                id="bank-filter-duplicates"
                value={(filters as BankMovementsListFilters).duplicates}
                onChange={(v) => update({ duplicates: v as BankMovementsListFilters["duplicates"] })}
                options={BANK_MOVEMENT_DUPLICATES_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                ariaLabel="Filtrar duplicados de importación"
              />
            </FilterField>
            <FilterField label="Fuente" htmlFor="bank-filter-source">
              <FilterSelect
                id="bank-filter-source"
                value={(filters as BankMovementsListFilters).source}
                onChange={(v) => update({ source: v as BankMovementsListFilters["source"] })}
                options={BANK_MOVEMENT_SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                ariaLabel="Filtrar por fuente PDF Excel o CSV"
              />
            </FilterField>
            {canManageVisibility ? (
              <FilterField label="Visibilidad" htmlFor="bank-filter-visibility">
                <FilterSelect
                  id="bank-filter-visibility"
                  value={(filters as BankMovementsListFilters).visibility}
                  onChange={(v) => update({ visibility: v as BankMovementsListFilters["visibility"] })}
                  options={BANK_MOVEMENT_VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  ariaLabel="Filtrar por visibilidad Visibles Ocultos o Todos"
                />
              </FilterField>
            ) : null}
          </>
        ) : null}
      </FilterBar>

      <p className={copilotCaptionClass}>
        Mostrando {showingCount} de {totalCount} {countLabel}
      </p>

      {showPeriodHint ? (
        <p className={copilotCaptionClass}>
          Mostrando movimientos del mes actual. Cambiá el filtro para ver meses anteriores.
        </p>
      ) : null}

      {showWithSuggestionHint ? (
        <p className={copilotCaptionClass}>
          Con sugerencia muestra los movimientos que Copilot pudo relacionar con pagos de Tesorería.
        </p>
      ) : null}
    </div>
  );
}
