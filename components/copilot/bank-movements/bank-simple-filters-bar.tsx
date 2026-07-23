"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotInputClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { FilterField, FilterSelect } from "@/components/copilot/ui/filter-bar";
import {
  BANK_MOVEMENT_DUPLICATES_OPTIONS,
  BANK_MOVEMENT_SOURCE_OPTIONS,
  BANK_MOVEMENT_VISIBILITY_OPTIONS,
  bankMovementsListFilterChipDefaults,
  countBankMovementsListFilterChips,
  DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
  parseSimpleStatesFilter,
  type BankMovementsListFilters,
} from "@/lib/bank-movements/bank-movements-filters";
import {
  BANK_PERIOD_PRESET_OPTIONS,
  bankPeriodSelectValue,
  listBankMonthOptions,
  parseBankPeriodSelectValue,
  type BankPeriodState,
} from "@/lib/bank-movements/bank-period";
import { BANK_MOVEMENT_STATUS_LABELS } from "@/lib/bank-movements/bank-movements-types";
import {
  SIMPLE_MOVEMENT_STATE_LABEL,
  SIMPLE_MOVEMENT_STATES,
  type SimpleMovementState,
} from "@/lib/bank-movements/simple-movement-association";

export type BankSimpleFiltersBarMode = "movements" | "conciliation" | "historial";

export type BankSimpleFiltersBarProps = {
  mode: BankSimpleFiltersBarMode;
  period: BankPeriodState;
  onPeriodChange: (period: BankPeriodState) => void;
  filters: BankMovementsListFilters;
  onFiltersChange: (filters: BankMovementsListFilters) => void;
  onClear: () => void;
  periodLabel: string;
  hideDirectionFilter?: boolean;
  canManageVisibility?: boolean;
};

const CURRENCY_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "UYU", label: "UYU" },
  { value: "USD", label: "USD" },
] as const;

const DIRECTION_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "inflow", label: "Ingreso" },
  { value: "outflow", label: "Egreso" },
] as const;

const MOVEMENT_STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: BANK_MOVEMENT_STATUS_LABELS.pending },
  { value: "matched", label: BANK_MOVEMENT_STATUS_LABELS.matched },
  { value: "ignored", label: BANK_MOVEMENT_STATUS_LABELS.ignored },
] as const;

const CLIENT_PRESENCE_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "with", label: "Con cliente" },
  { value: "without", label: "Sin cliente" },
] as const;

const SIMPLE_STATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos" },
  ...SIMPLE_MOVEMENT_STATES.map((state) => ({
    value: state,
    label: SIMPLE_MOVEMENT_STATE_LABEL[state],
  })),
];

type FilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function periodSelectOptions(): Array<{ value: string; label: string }> {
  return [
    ...BANK_PERIOD_PRESET_OPTIONS.map((o) => ({ value: `preset:${o.value}`, label: o.label })),
    ...listBankMonthOptions().map((o) => ({ value: o.value, label: o.label })),
    { value: "custom", label: "Personalizado…" },
  ];
}

function buildFilterChips(
  filters: BankMovementsListFilters,
  mode: BankSimpleFiltersBarMode,
  onPatch: (patch: Partial<BankMovementsListFilters>) => void
): FilterChip[] {
  const d = DEFAULT_BANK_MOVEMENTS_LIST_FILTERS;
  const chips: FilterChip[] = [];

  if (filters.text.trim()) {
    chips.push({
      key: "text",
      label: `Búsqueda: ${filters.text.trim()}`,
      onRemove: () => onPatch({ text: "" }),
    });
  }
  if (filters.currency !== d.currency) {
    chips.push({
      key: "currency",
      label: `Moneda: ${filters.currency}`,
      onRemove: () => onPatch({ currency: d.currency }),
    });
  }
  if (filters.direction !== d.direction) {
    chips.push({
      key: "direction",
      label: `Dirección: ${filters.direction === "inflow" ? "Ingreso" : "Egreso"}`,
      onRemove: () => onPatch({ direction: d.direction }),
    });
  }
  if (mode !== "conciliation" && filters.status !== d.status) {
    chips.push({
      key: "status",
      label: `Estado: ${MOVEMENT_STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? filters.status}`,
      onRemove: () => onPatch({ status: d.status }),
    });
  }
  for (const state of parseSimpleStatesFilter(filters.simpleStates)) {
    chips.push({
      key: `simple:${state}`,
      label: SIMPLE_MOVEMENT_STATE_LABEL[state],
      onRemove: () => {
        const rest = parseSimpleStatesFilter(filters.simpleStates).filter((s) => s !== state);
        onPatch({ simpleStates: rest.join(",") });
      },
    });
  }
  if (filters.amountMin.trim()) {
    chips.push({
      key: "amountMin",
      label: `Desde ${filters.amountMin.trim()}`,
      onRemove: () => onPatch({ amountMin: "" }),
    });
  }
  if (filters.amountMax.trim()) {
    chips.push({
      key: "amountMax",
      label: `Hasta ${filters.amountMax.trim()}`,
      onRemove: () => onPatch({ amountMax: "" }),
    });
  }
  if (filters.amount.trim()) {
    chips.push({
      key: "amount",
      label: `Monto ${filters.amount.trim()}`,
      onRemove: () => onPatch({ amount: "" }),
    });
  }
  if (filters.clientPresence !== d.clientPresence) {
    chips.push({
      key: "clientPresence",
      label: CLIENT_PRESENCE_OPTIONS.find((o) => o.value === filters.clientPresence)?.label ?? filters.clientPresence,
      onRemove: () => onPatch({ clientPresence: d.clientPresence }),
    });
  }
  if (filters.duplicates !== d.duplicates) {
    chips.push({
      key: "duplicates",
      label: BANK_MOVEMENT_DUPLICATES_OPTIONS.find((o) => o.value === filters.duplicates)?.label ?? filters.duplicates,
      onRemove: () => onPatch({ duplicates: d.duplicates }),
    });
  }
  if (filters.source !== d.source) {
    chips.push({
      key: "source",
      label: BANK_MOVEMENT_SOURCE_OPTIONS.find((o) => o.value === filters.source)?.label ?? filters.source,
      onRemove: () => onPatch({ source: d.source }),
    });
  }
  if (filters.visibility !== d.visibility) {
    chips.push({
      key: "visibility",
      label: BANK_MOVEMENT_VISIBILITY_OPTIONS.find((o) => o.value === filters.visibility)?.label ?? filters.visibility,
      onRemove: () => onPatch({ visibility: d.visibility }),
    });
  }

  return chips;
}

export function countBankSimpleFiltersActiveChips(filters: BankMovementsListFilters): number {
  return countBankMovementsListFilterChips(filters);
}

export { bankMovementsListFilterChipDefaults };

export function BankSimpleFiltersBar({
  mode,
  period,
  onPeriodChange,
  filters,
  onFiltersChange,
  onClear,
  periodLabel,
  hideDirectionFilter = false,
  canManageVisibility = false,
}: BankSimpleFiltersBarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.text);
  const debouncedSearch = useDebouncedValue(searchDraft, 300);

  useEffect(() => {
    setSearchDraft(filters.text);
  }, [filters.text]);

  useEffect(() => {
    if (debouncedSearch !== filters.text) {
      onFiltersChange({ ...filters, text: debouncedSearch });
    }
    // Solo propagar cuando el draft debounced cambia; filters/onFiltersChange son estables en uso normal.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- evita loop al sincronizar desde el padre
  }, [debouncedSearch]);

  const patch = (partial: Partial<BankMovementsListFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const activeChipCount = countBankMovementsListFilterChips(filters);
  const chips = buildFilterChips(filters, mode, patch);

  const parsedSimpleStates = parseSimpleStatesFilter(filters.simpleStates);
  const hasMultipleSimpleStates = parsedSimpleStates.length > 1;
  const simpleStateValue = hasMultipleSimpleStates ? "__multi__" : parsedSimpleStates[0] ?? "";

  const handlePeriodSelect = (value: string) => {
    if (value === "custom") {
      onPeriodChange({ kind: "custom", from: period.kind === "custom" ? period.from : "", to: period.kind === "custom" ? period.to : "" });
      setAdvancedOpen(true);
      return;
    }
    const parsed = parseBankPeriodSelectValue(value);
    if (parsed) onPeriodChange(parsed);
  };

  const periodValue = period.kind === "custom" ? "custom" : bankPeriodSelectValue(period);

  const estadoControl =
    mode === "conciliation" ? (
      <FilterField label="Estado" htmlFor="bank-filter-simple-state">
        <FilterSelect
          id="bank-filter-simple-state"
          value={simpleStateValue}
          onChange={(v) =>
            patch({ simpleStates: v === "__multi__" ? filters.simpleStates : (v as SimpleMovementState | "") })
          }
          options={
            hasMultipleSimpleStates
              ? [
                  { value: "__multi__", label: "Varios (vista KPI)" },
                  ...SIMPLE_STATE_OPTIONS,
                ]
              : SIMPLE_STATE_OPTIONS
          }
          ariaLabel="Filtrar por estado simple"
        />
      </FilterField>
    ) : (
      <FilterField label="Estado" htmlFor="bank-filter-status">
        <FilterSelect
          id="bank-filter-status"
          value={filters.status}
          onChange={(v) => patch({ status: v as BankMovementsListFilters["status"] })}
          options={MOVEMENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          ariaLabel="Filtrar por estado"
        />
      </FilterField>
    );

  const advancedPanel = (
    <div
      className={`grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${advancedOpen ? "" : "hidden"}`}
      data-testid="bank-more-filters-panel"
    >
      <FilterField label="Moneda" htmlFor="bank-adv-currency">
        <FilterSelect
          id="bank-adv-currency"
          value={filters.currency}
          onChange={(v) => patch({ currency: v as BankMovementsListFilters["currency"] })}
          options={CURRENCY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          ariaLabel="Filtrar por moneda"
        />
      </FilterField>

      {hideDirectionFilter ? null : (
        <FilterField label="Dirección" htmlFor="bank-adv-direction">
          <FilterSelect
            id="bank-adv-direction"
            value={filters.direction}
            onChange={(v) => patch({ direction: v as BankMovementsListFilters["direction"] })}
            options={DIRECTION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            ariaLabel="Filtrar por dirección"
          />
        </FilterField>
      )}

      <FilterField label="Importe mín." htmlFor="bank-adv-amount-min">
        <input
          id="bank-adv-amount-min"
          type="text"
          inputMode="decimal"
          value={filters.amountMin}
          onChange={(e) => patch({ amountMin: e.target.value })}
          placeholder="Desde"
          className={copilotInputClass}
          aria-label="Importe mínimo"
        />
      </FilterField>

      <FilterField label="Importe máx." htmlFor="bank-adv-amount-max">
        <input
          id="bank-adv-amount-max"
          type="text"
          inputMode="decimal"
          value={filters.amountMax}
          onChange={(e) => patch({ amountMax: e.target.value })}
          placeholder="Hasta"
          className={copilotInputClass}
          aria-label="Importe máximo"
        />
      </FilterField>

      <FilterField label="Cliente" htmlFor="bank-adv-client">
        <FilterSelect
          id="bank-adv-client"
          value={filters.clientPresence}
          onChange={(v) => patch({ clientPresence: v as BankMovementsListFilters["clientPresence"] })}
          options={CLIENT_PRESENCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          ariaLabel="Filtrar por presencia de cliente"
        />
      </FilterField>

      <FilterField label="Duplicados" htmlFor="bank-adv-duplicates">
        <FilterSelect
          id="bank-adv-duplicates"
          value={filters.duplicates}
          onChange={(v) => patch({ duplicates: v as BankMovementsListFilters["duplicates"] })}
          options={BANK_MOVEMENT_DUPLICATES_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          ariaLabel="Filtrar duplicados"
        />
      </FilterField>

      <FilterField label="Fuente" htmlFor="bank-adv-source">
        <FilterSelect
          id="bank-adv-source"
          value={filters.source}
          onChange={(v) => patch({ source: v as BankMovementsListFilters["source"] })}
          options={BANK_MOVEMENT_SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          ariaLabel="Filtrar por fuente"
        />
      </FilterField>

      {canManageVisibility ? (
        <FilterField label="Visibilidad" htmlFor="bank-adv-visibility">
          <FilterSelect
            id="bank-adv-visibility"
            value={filters.visibility}
            onChange={(v) => patch({ visibility: v as BankMovementsListFilters["visibility"] })}
            options={BANK_MOVEMENT_VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            ariaLabel="Filtrar por visibilidad"
          />
        </FilterField>
      ) : null}

      {period.kind === "custom" ? (
        <>
          <FilterField label="Desde" htmlFor="bank-adv-from">
            <input
              id="bank-adv-from"
              type="date"
              value={period.from}
              onChange={(e) => onPeriodChange({ kind: "custom", from: e.target.value, to: period.to })}
              className={copilotInputClass}
              aria-label="Fecha desde"
            />
          </FilterField>
          <FilterField label="Hasta" htmlFor="bank-adv-to">
            <input
              id="bank-adv-to"
              type="date"
              value={period.to}
              onChange={(e) => onPeriodChange({ kind: "custom", from: period.from, to: e.target.value })}
              className={copilotInputClass}
              aria-label="Fecha hasta"
            />
          </FilterField>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-2" data-testid="bank-simple-filters">
      <p className={copilotCaptionClass}>Período: {periodLabel}</p>

      {/* Mobile: botón compacto */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className={copilotButtonClassName({ variant: "secondary", size: "sm", fullWidth: true })}
          aria-expanded={advancedOpen}
        >
          <SlidersHorizontal className="mr-2 inline h-4 w-4" aria-hidden />
          Filtros ({activeChipCount + (period.kind !== "preset" || period.preset !== "this_month" ? 1 : 0)})
        </button>
        {advancedOpen ? (
          <div className="mt-2 space-y-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-2.5">
            <FilterField label="Período" htmlFor="bank-period-select-mobile">
              <FilterSelect
                id="bank-period-select-mobile"
                value={periodValue}
                onChange={handlePeriodSelect}
                options={periodSelectOptions()}
                ariaLabel="Seleccionar período"
              />
            </FilterField>
            <FilterField label="Buscar" htmlFor="bank-search-input-mobile">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--copilot-ink-muted)]" aria-hidden />
                <input
                  id="bank-search-input-mobile"
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Buscar movimiento, referencia o cliente…"
                  className={`${copilotInputClass} pl-8`}
                  aria-label="Buscar movimientos"
                />
              </div>
            </FilterField>
            {estadoControl}
            <div className="flex gap-2 pt-1">
              {activeChipCount > 0 ? (
                <button
                  type="button"
                  onClick={onClear}
                  className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                  data-testid="bank-clear-filters"
                >
                  Limpiar
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Desktop bar */}
      <div className="hidden flex-wrap items-end gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-2.5 shadow-sm sm:flex">
        <FilterField label="Período" htmlFor="bank-period-select">
          <div data-testid="bank-period-select">
            <FilterSelect
              id="bank-period-select"
              value={periodValue}
              onChange={handlePeriodSelect}
              options={periodSelectOptions()}
              ariaLabel="Seleccionar período"
            />
          </div>
        </FilterField>

        <FilterField label="Buscar" htmlFor="bank-search-input" className="min-w-[160px] flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--copilot-ink-muted)]" aria-hidden />
            <input
              id="bank-search-input"
              data-testid="bank-search-input"
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Buscar movimiento, referencia o cliente…"
              className={`${copilotInputClass} pl-8`}
              aria-label="Buscar movimientos"
            />
          </div>
        </FilterField>

        {estadoControl}

        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          aria-expanded={advancedOpen}
          data-testid="bank-more-filters"
        >
          <SlidersHorizontal className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
          Más filtros
          <ChevronDown
            className={`ml-1 inline h-3.5 w-3.5 transition ${advancedOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        {activeChipCount > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
            data-testid="bank-clear-filters"
          >
            <X className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Limpiar
          </button>
        ) : null}
      </div>

      {advancedPanel}

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" data-testid="bank-filter-chips">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-hover-bg)]"
              aria-label={`Quitar filtro ${chip.label}`}
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
