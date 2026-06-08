"use client";

import { Check, Loader2, RefreshCw } from "lucide-react";

import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

export type TesoreriaCurrencyFilter = TreasuryCurrencyCode | "all";

const inputClass =
  "h-9 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 text-sm text-[var(--copilot-ink)] shadow-sm transition focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20 disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]";

type Props = {
  draftStart: string;
  draftEnd: string;
  currency: TesoreriaCurrencyFilter;
  onDraftStartChange: (value: string) => void;
  onDraftEndChange: (value: string) => void;
  onCurrencyChange: (value: TesoreriaCurrencyFilter) => void;
  hasPendingChanges: boolean;
  onConfirmDraft: () => void;
  onRefresh: () => void;
  loading: boolean;
  canRefresh: boolean;
};

export function TesoreriaControlBar({
  draftStart,
  draftEnd,
  currency,
  onDraftStartChange,
  onDraftEndChange,
  onCurrencyChange,
  hasPendingChanges,
  onConfirmDraft,
  onRefresh,
  loading,
  canRefresh,
}: Props) {
  const draftInvalid =
    draftStart !== "" && draftEnd !== "" && draftStart > draftEnd;

  return (
    <div className="sticky top-0 z-20 -mx-6 mb-4 border-b border-[var(--copilot-border)] bg-[rgba(248,246,242,0.88)] px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Desde
          <input
            type="date"
            value={draftStart}
            onChange={(e) => onDraftStartChange(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Hasta
          <input
            type="date"
            value={draftEnd}
            onChange={(e) => onDraftEndChange(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Moneda
          <select
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value as TesoreriaCurrencyFilter)}
            className={inputClass}
          >
            <option value="all">Todas</option>
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onConfirmDraft}
          disabled={!hasPendingChanges || draftInvalid}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--copilot-accent)] px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
        >
          <Check className="h-4 w-4" />
          Confirmar
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!canRefresh || loading}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-4 text-sm font-medium text-[var(--copilot-ink)] shadow-sm transition hover:bg-[var(--copilot-panel-bg)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refrescar
        </button>
      </div>
    </div>
  );
}
