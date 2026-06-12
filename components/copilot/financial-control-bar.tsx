"use client";

/**
 * Barra de control compacta para Cartera — selector de período con presets.
 * Mes actual / anterior / trimestre aplican al instante; personalizado usa Confirmar.
 */

import { Check, ChevronDown, RefreshCw, Loader2 } from "lucide-react";

import type {
  ReconciliationCurrencyCode,
  SyncStateSummary,
} from "@/lib/copilot-financial-reconciliation";
import {
  ZETA_SALDOS_SYNC_INTERVAL_HOURS,
  computeNextZetaSyncAt,
  formatHHmm,
  pickZetaSaldosSyncState,
} from "@/lib/copilot-auto-sync";
import { formatRelativeAgeHours } from "@/lib/copilot-cartera-format";
import type { CarteraPeriodPreset } from "@/lib/copilot-date-range-defaults";

export type CurrencyFilter = "all" | ReconciliationCurrencyCode;

export type FinancialControlBarProps = {
  periodLabel: string;
  periodPreset: CarteraPeriodPreset;
  onPeriodPresetChange: (preset: CarteraPeriodPreset) => void;
  draftStart: string;
  draftEnd: string;
  onDraftStartChange: (value: string) => void;
  onDraftEndChange: (value: string) => void;
  hasPendingChanges: boolean;
  onConfirmDraft: () => void;
  onRefresh: () => void;
  loading: boolean;
  canRefresh: boolean;
  syncStates?: readonly SyncStateSummary[];
};

const PRESET_OPTIONS: { value: CarteraPeriodPreset; label: string }[] = [
  { value: "current_month", label: "Mes actual" },
  { value: "previous_month", label: "Mes anterior" },
  { value: "quarter", label: "Trimestre" },
  { value: "custom", label: "Personalizado" },
];

const inputClass =
  "h-8 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2.5 text-xs text-[var(--copilot-ink)] shadow-sm transition focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20";

function normalizeDateInput(value: string | null | undefined): string {
  return (value ?? "").slice(0, 10);
}

export function FinancialControlBar({
  periodLabel,
  periodPreset,
  onPeriodPresetChange,
  draftStart,
  draftEnd,
  onDraftStartChange,
  onDraftEndChange,
  hasPendingChanges,
  onConfirmDraft,
  onRefresh,
  loading,
  canRefresh,
  syncStates,
}: FinancialControlBarProps) {
  const normalizedDraftStart = normalizeDateInput(draftStart);
  const normalizedDraftEnd = normalizeDateInput(draftEnd);
  const isCustom = periodPreset === "custom";

  const draftInvalid =
    normalizedDraftStart !== "" &&
    normalizedDraftEnd !== "" &&
    normalizedDraftStart > normalizedDraftEnd;

  const draftIncomplete =
    (normalizedDraftStart === "" && normalizedDraftEnd !== "") ||
    (normalizedDraftStart !== "" && normalizedDraftEnd === "");

  const confirmDisabled =
    !isCustom || !hasPendingChanges || draftInvalid || draftIncomplete || loading;

  return (
    <div className="sticky top-0 z-30 -mx-6 mb-4 border-b border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-[var(--copilot-card-bg)]/60">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative inline-flex min-w-0 items-center">
          <select
            value={periodPreset}
            onChange={(e) => onPeriodPresetChange(e.target.value as CarteraPeriodPreset)}
            className={`${inputClass} min-w-[9rem] appearance-none pr-7 font-medium`}
            aria-label="Período de cartera"
          >
            {PRESET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value === "custom" ? "Personalizado" : o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-[var(--copilot-ink-muted)]"
            aria-hidden
          />
        </div>

        <span
          className="hidden truncate text-xs font-semibold capitalize text-[var(--copilot-ink)] sm:inline"
          title={periodLabel}
        >
          {periodLabel}
        </span>

        {isCustom ? (
          <>
            <label className="flex items-center gap-1 text-[10px] font-medium text-[var(--copilot-ink-muted)]">
              Desde
              <input
                type="date"
                className={inputClass}
                value={draftStart}
                max={draftEnd || undefined}
                onChange={(e) => onDraftStartChange(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-1 text-[10px] font-medium text-[var(--copilot-ink-muted)]">
              Hasta
              <input
                type="date"
                className={inputClass}
                value={draftEnd}
                min={draftStart || undefined}
                onChange={(e) => onDraftEndChange(e.target.value)}
              />
            </label>
            {hasPendingChanges ? (
              <button
                type="button"
                onClick={onConfirmDraft}
                disabled={confirmDisabled}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--copilot-accent)] bg-[var(--copilot-accent)] px-2.5 text-[10px] font-semibold text-[var(--copilot-on-accent)] shadow-sm transition hover:opacity-95 disabled:opacity-50"
              >
                <Check className="h-3 w-3" aria-hidden />
                Aplicar
              </button>
            ) : null}
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <AutoSyncIndicator syncStates={syncStates} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || !canRefresh}
            title="Actualizar datos"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2.5 text-[10px] font-semibold text-[var(--copilot-ink)] shadow-sm transition hover:bg-[var(--copilot-panel-bg)] disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3 w-3" aria-hidden />
            )}
            <span className="hidden sm:inline">{loading ? "Actualizando" : "Refrescar"}</span>
          </button>
        </div>

        {isCustom && draftInvalid ? (
          <p role="alert" className="basis-full text-[10px] font-medium text-[var(--copilot-danger-text)]">
            Desde no puede ser posterior a Hasta.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AutoSyncIndicator({
  syncStates,
}: {
  syncStates?: readonly SyncStateSummary[];
}) {
  const saldosSync = syncStates ? pickZetaSaldosSyncState(syncStates) : null;
  const lastSyncRel =
    saldosSync && saldosSync.ageHours !== null
      ? formatRelativeAgeHours(saldosSync.ageHours)
      : null;
  const nextHHmm = formatHHmm(computeNextZetaSyncAt(new Date()));

  return (
    <div
      className="hidden text-right text-[10px] leading-tight text-[var(--copilot-ink-muted)] lg:block"
      aria-label="Actualización automática"
      title={`Cada ${ZETA_SALDOS_SYNC_INTERVAL_HOURS} h · Próxima ${nextHHmm}`}
    >
      {lastSyncRel ? `Sync ${lastSyncRel}` : "Sync pendiente"}
    </div>
  );
}
