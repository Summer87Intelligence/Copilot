"use client";

import { type ReactNode } from "react";
import { Search, X } from "lucide-react";

import { countActiveFilters, type FilterValues } from "@/lib/ui/filter-bar-model";

/**
 * FilterBar (DS-Core) — patrón de filtros ÚNICO.
 *
 * Unifica los paradigmas dispersos (Cartera select+date, Banco selects,
 * Cobranza/Alertas chips). Composición: `FilterBar` contiene `FilterField`s
 * (label + control) más `FilterSearchInput` / `FilterSelect`; muestra el conteo
 * de filtros activos y un botón "Limpiar".
 */

const CONTROL_CLASS =
  "h-9 w-full min-w-0 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)] shadow-sm outline-none transition placeholder:text-[var(--copilot-ink-muted)] focus:border-[var(--copilot-accent)] focus:ring-2 focus:ring-[var(--copilot-accent)]/20";

export function FilterBar({
  children,
  values,
  defaults,
  onClear,
  className = "",
}: {
  children: ReactNode;
  /** Si se provee, calcula y muestra el conteo de filtros activos. */
  values?: FilterValues;
  defaults?: FilterValues;
  onClear?: () => void;
  className?: string;
}) {
  const active = values ? countActiveFilters(values, defaults ?? {}) : 0;

  return (
    <div
      className={`flex flex-wrap items-end gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-2.5 shadow-sm ${className}`}
      role="search"
    >
      {children}
      {active > 0 ? (
        <div className="ml-auto flex items-center gap-2 self-center">
          <span className="text-[11px] font-semibold text-[var(--copilot-ink-muted)]">
            {active} filtro{active !== 1 ? "s" : ""} activo{active !== 1 ? "s" : ""}
          </span>
          {onClear ? <ClearFiltersButton onClick={onClear} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function FilterField({
  label,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export type FilterOption = { value: string; label: string };

export function FilterSelect({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly FilterOption[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${CONTROL_CLASS} appearance-none ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FilterSearchInput({
  id,
  value,
  onChange,
  placeholder = "Buscar…",
  ariaLabel,
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className="relative min-w-0">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--copilot-ink-muted)]"
        aria-hidden
      />
      <input
        id={id}
        type="search"
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${CONTROL_CLASS} pl-8 ${className}`}
      />
    </div>
  );
}

export function ClearFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2.5 text-[11px] font-semibold text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-hover-bg)]"
    >
      <X className="h-3 w-3" aria-hidden />
      Limpiar
    </button>
  );
}
