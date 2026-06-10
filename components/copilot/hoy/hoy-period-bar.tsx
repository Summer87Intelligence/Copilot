"use client";

import { Check, Loader2, RefreshCw } from "lucide-react";

import { CopilotButton } from "@/components/copilot/ui/copilot-button";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import type { HoyPeriodRange } from "@/lib/copilot-hoy-period";

const inputClass =
  "h-9 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 text-sm text-[var(--copilot-ink)] shadow-sm transition focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20";

type Props = {
  draftFrom: string;
  draftTo: string;
  confirmed: HoyPeriodRange;
  onDraftFromChange: (v: string) => void;
  onDraftToChange: (v: string) => void;
  hasPendingChanges: boolean;
  onConfirm: () => void;
  onMonthToDate: () => void;
  onLast30Days: () => void;
  onRefresh: () => void;
  loading: boolean;
};

export function HoyPeriodBar({
  draftFrom,
  draftTo,
  confirmed,
  onDraftFromChange,
  onDraftToChange,
  hasPendingChanges,
  onConfirm,
  onMonthToDate,
  onLast30Days,
  onRefresh,
  loading,
}: Props) {
  const draftInvalid = draftFrom !== "" && draftTo !== "" && draftFrom > draftTo;

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {HOY_COPY.periodBarTitle}
      </p>
      <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
        Solo afecta facturación, cobros y movimientos manuales del período. No modifica caja ni
        proyección.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[9rem] flex-col gap-1 text-[10px] font-medium text-[var(--copilot-ink-muted)]">
          Desde
          <input
            type="date"
            value={draftFrom}
            onChange={(e) => onDraftFromChange(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[9rem] flex-col gap-1 text-[10px] font-medium text-[var(--copilot-ink-muted)]">
          Hasta
          <input
            type="date"
            value={draftTo}
            onChange={(e) => onDraftToChange(e.target.value)}
            className={inputClass}
          />
        </label>
        <CopilotButton
          type="button"
          onClick={onConfirm}
          disabled={!hasPendingChanges || draftInvalid || loading}
          size="sm"
        >
          <Check className="h-4 w-4" aria-hidden />
          Confirmar
        </CopilotButton>
        <CopilotButton type="button" onClick={onMonthToDate} disabled={loading} variant="secondary" size="sm">
          Mes actual
        </CopilotButton>
        <CopilotButton type="button" onClick={onLast30Days} disabled={loading} variant="secondary" size="sm">
          Últimos 30 días
        </CopilotButton>
        <CopilotButton type="button" onClick={onRefresh} disabled={loading} variant="secondary" size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refrescar
        </CopilotButton>
      </div>
      <p className="mt-2 text-[10px] text-[var(--copilot-ink-muted)]">
        Activo: {confirmed.from} → {confirmed.to}
      </p>
    </div>
  );
}
