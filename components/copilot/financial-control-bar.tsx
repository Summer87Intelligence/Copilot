"use client";

/**
 * FinancialControlBar
 * -------------------
 * Barra de control sticky para la sección Cartera.
 *
 * Reglas UX:
 *  - No hay carga automática ni filtro por año.
 *  - La UI sólo expone Desde / Hasta / Confirmar / Refrescar.
 *  - Desde/Hasta son draft; el fetch ocurre únicamente al confirmar.
 *
 * Filosofía visual:
 *  - Sticky top, blur premium, jerarquía clara.
 *  - Tokens existentes de Copilot (no introducir colores nuevos).
 *  - Sin charts, sin cards gigantes, sin estética ERP.
 */

import { Check, Clock3, RefreshCw, Loader2 } from "lucide-react";

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

export type CurrencyFilter = "all" | ReconciliationCurrencyCode;

export type FinancialControlBarProps = {
  /** Rango en edición (no aplicado todavía). Sincronizado con el shell. */
  draftStart: string;
  draftEnd: string;
  onDraftStartChange: (value: string) => void;
  onDraftEndChange: (value: string) => void;
  hasPendingChanges: boolean;
  onConfirmDraft: () => void;
  onRefresh: () => void;
  loading: boolean;
  canRefresh: boolean;
  /**
   * `syncStates` del reporte vigente. Solo se usa para el indicador de
   * auto-sync Zeta. Si está vacío o ausente, el indicador cae al copy
   * estático "Auto-sync Zeta: cada 2 h".
   */
  syncStates?: readonly SyncStateSummary[];
};

const inputClass =
  "h-9 rounded-lg border border-[var(--copilot-border)] bg-white/70 px-3 text-sm text-[var(--copilot-ink)] shadow-sm transition focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20 disabled:opacity-50";

function normalizeDateInput(value: string | null | undefined): string {
  return (value ?? "").slice(0, 10);
}

export function FinancialControlBar({
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

  const draftInvalid =
    normalizedDraftStart !== "" &&
    normalizedDraftEnd !== "" &&
    normalizedDraftStart > normalizedDraftEnd;

  const draftIncomplete =
    (normalizedDraftStart === "" && normalizedDraftEnd !== "") ||
    (normalizedDraftStart !== "" && normalizedDraftEnd === "");

  const confirmDisabled = !hasPendingChanges || draftInvalid || draftIncomplete || loading;

  function handleConfirm() {
    if (draftInvalid) return;
    if (draftIncomplete) return;
    if (!hasPendingChanges) return;
    onConfirmDraft();
  }

  return (
    <div className="sticky top-0 z-30 -mx-6 mb-6 border-b border-[var(--copilot-border)] bg-white/70 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/55">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--copilot-ink-muted)]">
          Desde
          <input
            type="date"
            className={inputClass}
            value={draftStart}
            max={draftEnd || undefined}
            onChange={(e) => onDraftStartChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleConfirm();
              }
            }}
            aria-invalid={draftInvalid || draftIncomplete}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--copilot-ink-muted)]">
          Hasta
          <input
            type="date"
            className={inputClass}
            value={draftEnd}
            min={draftStart || undefined}
            onChange={(e) => onDraftEndChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleConfirm();
              }
            }}
            aria-invalid={draftInvalid || draftIncomplete}
          />
        </label>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirmDisabled}
          aria-label="Confirmar rango de fechas"
          title={
            draftInvalid
              ? "Fecha Desde debe ser anterior o igual a Hasta"
              : draftIncomplete
                ? "Completá Desde y Hasta para confirmar"
                : !hasPendingChanges
                  ? "Sin cambios pendientes"
                  : "Aplicar rango seleccionado"
          }
          className={[
            "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-sm transition",
            confirmDisabled
              ? "border border-[var(--copilot-border)] bg-white/60 text-[var(--copilot-ink-muted)] opacity-60"
              : "border border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600",
          ].join(" ")}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          <span>Confirmar</span>
        </button>

        <div className="ml-auto flex items-center gap-3">
          <AutoSyncIndicator syncStates={syncStates} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || !canRefresh}
            title="Actualiza la vista con los últimos datos disponibles."
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--copilot-border)] bg-white/70 px-3 text-xs font-semibold text-[var(--copilot-ink)] shadow-sm transition hover:bg-white disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>{loading ? "Actualizando" : "Refrescar"}</span>
          </button>
        </div>

        {draftInvalid ? (
          <p
            role="alert"
            className="basis-full text-[11px] font-medium text-rose-700"
          >
            La fecha &ldquo;Desde&rdquo; no puede ser posterior a &ldquo;Hasta&rdquo;.
          </p>
        ) : draftIncomplete ? (
          <p
            role="alert"
            className="basis-full text-[11px] font-medium text-amber-700"
          >
            Completá ambas fechas antes de confirmar.
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AutoSyncIndicator
// ---------------------------------------------------------------------------
//
// Bloque informativo compacto que explica la actualización automática Zeta:
//
//   "Auto-sync Zeta · cada 2 h"
//   "Última: hace Xh"
//   "Próxima ≈ HH:mm"
//
// Reglas:
//  - Si `syncStates` está vacío o no trae timestamps → fallback estático:
//      "Auto-sync Zeta · cada 2 h"
//      "Última sync: no disponible"
//      (sin línea de próxima — el cron sigue corriendo, no se conoce última)
//  - Próxima se calcula del schedule absoluto UTC (`0 *​/2 * * *`), no respecto
//    a la última sync. Esto coincide con el comportamiento real del cron Vercel.
//  - El componente NO usa `useState`/`useEffect`: instancia `new Date()` en
//    render. La pantalla refresca con cada fetch del reporte; la "próxima
//    aproximada" se recalcula entonces.
//  - No agrega network, no toca el cron, no muta estado global.
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

  const nextSyncAt = computeNextZetaSyncAt(new Date());
  const nextHHmm = formatHHmm(nextSyncAt);

  return (
    <div
      className="hidden text-right text-[10px] leading-tight text-[var(--copilot-ink-muted)] sm:block"
      aria-label="Estado de actualización automática"
    >
      <div className="flex items-center justify-end gap-1 font-semibold uppercase tracking-[0.08em]">
        <Clock3 className="h-3 w-3" aria-hidden />
        <span>Actualizaciones cada {ZETA_SALDOS_SYNC_INTERVAL_HOURS} h</span>
      </div>
      <div className="mt-0.5 tabular-nums">
        {lastSyncRel ? (
          <>Última actualización: {lastSyncRel}</>
        ) : (
          <>Última actualización: no disponible</>
        )}
      </div>
      <div className="tabular-nums">Próxima actualización: {nextHHmm}</div>
    </div>
  );
}

