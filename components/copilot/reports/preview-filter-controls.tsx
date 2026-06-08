"use client";

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function nowYear() {
  return new Date().getFullYear();
}

const selectClass =
  "mt-1 w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2.5 py-1.5 text-sm text-[var(--copilot-ink)]";

const pillBase = "rounded-full px-3 py-1 text-xs font-medium transition";
const pillActive =
  "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]";
const pillIdle =
  "bg-[var(--copilot-card-bg)]/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-[var(--copilot-panel-bg)]";

type Props = {
  year: number;
  month: number;
  currency: "UYU" | "USD";
  onYear: (y: number) => void;
  onMonth: (m: number) => void;
  onCurrency: (c: "UYU" | "USD") => void;
  extraSlot?: React.ReactNode;
};

export function PreviewFilterControls({
  year,
  month,
  currency,
  onYear,
  onMonth,
  onCurrency,
  extraSlot,
}: Props) {
  const yearOptions = Array.from(
    { length: Math.max(1, nowYear() - 2026 + 1) },
    (_, i) => 2026 + i
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block text-xs text-[var(--copilot-ink-muted)]">
        Mes
        <select
          value={month}
          onChange={(e) => onMonth(Number(e.target.value))}
          className={selectClass}
        >
          {MONTH_NAMES_ES.map((name, i) => (
            <option key={i + 1} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-[var(--copilot-ink-muted)]">
        Año
        <select
          value={year}
          onChange={(e) => onYear(Number(e.target.value))}
          className={selectClass}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Moneda
        </p>
        <div className="mt-1 flex gap-2">
          {(["UYU", "USD"] as const).map((cur) => (
            <button
              key={cur}
              type="button"
              onClick={() => onCurrency(cur)}
              className={`${pillBase} ${currency === cur ? pillActive : pillIdle}`}
            >
              {cur === "UYU" ? "Pesos" : "Dólares"}
            </button>
          ))}
        </div>
      </div>

      {extraSlot}
    </div>
  );
}
