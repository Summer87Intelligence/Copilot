"use client";

import { useState } from "react";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { buildUsdEquivalentNoticeCopy, normalizeFxRate } from "@/lib/currency-display-mode";

export function UsdEquivalentActiveNotice() {
  const { mode, fxRate, setMode } = useDisplayCurrency();
  if (mode !== "usd_equivalent") return null;

  const copy = buildUsdEquivalentNoticeCopy(fxRate);

  return (
    <div
      className="flex items-center justify-center gap-3 border-b border-amber-200/60 bg-amber-50/70 px-4 py-1 dark:border-amber-800/40 dark:bg-amber-950/20"
      role="status"
      aria-live="polite"
    >
      <p className="truncate text-[11px] font-medium text-amber-700 dark:text-amber-400">
        <span className="hidden sm:inline">{copy.full}</span>
        <span className="sm:hidden">{copy.short}</span>
      </p>
      <button
        type="button"
        onClick={() => setMode("native")}
        className="shrink-0 rounded text-[11px] font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-200"
      >
        <span className="hidden sm:inline">Volver a moneda original</span>
        <span className="sm:hidden">Cambiar</span>
      </button>
    </div>
  );
}

function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-[1.125rem] w-8 shrink-0 items-center rounded-full transition-colors duration-150 ${on ? "bg-[var(--copilot-accent)]" : "bg-[var(--copilot-subtle)]"}`}
      aria-hidden
    >
      <span
        className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-150 ${on ? "translate-x-[1.0625rem]" : "translate-x-px"}`}
      />
    </span>
  );
}

export function CurrencyDisplayToggle() {
  const { mode, fxRate, setMode, setFxRate } = useDisplayCurrency();
  const isUsdMode = mode === "usd_equivalent";

  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState("");

  function handleToggle() {
    setMode(isUsdMode ? "native" : "usd_equivalent");
  }

  function handleRateClick(e: React.MouseEvent) {
    e.stopPropagation();
    setRateInput(String(fxRate));
    setEditingRate(true);
  }

  function handleRateCommit() {
    const parsed = normalizeFxRate(rateInput);
    setFxRate(parsed);
    setEditingRate(false);
  }

  function handleRateKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleRateCommit();
    if (e.key === "Escape") setEditingRate(false);
  }

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--copilot-ink-muted)]">
      <button
        type="button"
        role="switch"
        aria-checked={isUsdMode}
        onClick={handleToggle}
        title="Convierte UYU a USD solo para visualización. Los datos originales no cambian."
        className="flex items-center gap-1.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]"
      >
        <SwitchTrack on={isUsdMode} />
        <span className={`transition-colors ${isUsdMode ? "font-medium text-[var(--copilot-ink)]" : "text-[var(--copilot-ink-muted)]"}`}>
          {isUsdMode ? "Todo en USD" : "Moneda original"}
        </span>
      </button>

      {isUsdMode && (
        <>
          <span className="select-none text-[var(--copilot-border)]" aria-hidden>·</span>
          <span className="text-[var(--copilot-ink-muted)]">TC</span>
          {editingRate ? (
            <input
              autoFocus
              className="w-12 rounded border border-[var(--copilot-border)] bg-[var(--copilot-surface-1)] px-1.5 py-0.5 text-xs text-[var(--copilot-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--copilot-accent)]"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={handleRateCommit}
              onKeyDown={handleRateKeyDown}
              placeholder="40"
              aria-label="Tipo de cambio UYU por USD"
            />
          ) : (
            <button
              type="button"
              onClick={handleRateClick}
              title="Editar tipo de cambio"
              className="rounded px-1 py-0.5 font-medium text-[var(--copilot-ink)] underline-offset-2 hover:bg-[var(--copilot-surface-3)] hover:underline"
            >
              {fxRate}
            </button>
          )}
        </>
      )}
    </div>
  );
}
