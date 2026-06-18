"use client";

import { useState } from "react";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { buildUsdEquivalentNoticeCopy, normalizeFxRate } from "@/lib/currency-display-mode";

export function UsdEquivalentActiveNotice() {
  const { mode, fxRate } = useDisplayCurrency();
  if (mode !== "usd_equivalent") return null;

  const copy = buildUsdEquivalentNoticeCopy(fxRate);

  return (
    <div
      className="flex items-center justify-center border-b border-amber-200/60 bg-amber-50/70 px-4 py-1 dark:border-amber-800/40 dark:bg-amber-950/20"
      title={copy.full}
      role="status"
      aria-live="polite"
    >
      <p className="truncate text-[11px] font-medium text-amber-700 dark:text-amber-400">
        <span className="hidden sm:inline">{copy.full}</span>
        <span className="sm:hidden">{copy.short}</span>
      </p>
    </div>
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
    <div className="flex items-center gap-1.5 text-xs text-[var(--copilot-ink-muted)]">
      <button
        onClick={handleToggle}
        title={isUsdMode ? "Volver a monedas nativas (UYU / USD)" : "Ver totales en USD equivalente"}
        className={[
          "flex items-center gap-1 rounded px-2 py-0.5 transition-colors",
          isUsdMode
            ? "bg-[var(--copilot-accent)] text-[var(--copilot-accent-fg)] font-medium"
            : "bg-[var(--copilot-surface-2)] hover:bg-[var(--copilot-surface-3)]",
        ].join(" ")}
      >
        <span>USD est.</span>
      </button>

      {isUsdMode && (
        editingRate ? (
          <input
            autoFocus
            className="w-16 rounded border border-[var(--copilot-border)] bg-[var(--copilot-surface-1)] px-1.5 py-0.5 text-xs text-[var(--copilot-ink)] focus:outline-none"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            onBlur={handleRateCommit}
            onKeyDown={handleRateKeyDown}
            placeholder="TC"
            aria-label="Tipo de cambio UYU por USD"
          />
        ) : (
          <button
            onClick={handleRateClick}
            title="Editar tipo de cambio"
            className="rounded px-1 py-0.5 hover:bg-[var(--copilot-surface-3)]"
          >
            TC {fxRate}
          </button>
        )
      )}
    </div>
  );
}
