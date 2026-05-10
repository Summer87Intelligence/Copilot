"use client";

/**
 * FinancialControlBar
 * -------------------
 * Barra de control sticky para la sección Cartera. Render-only:
 *  - Recibe el reporte ya generado por el hook (sin recálculos).
 *  - Emite cambios de modo / rango / refresh hacia el contenedor.
 *
 * Filosofía visual:
 *  - Sticky top, blur premium, jerarquía clara.
 *  - Tokens existentes de Copilot (no introducir colores nuevos).
 *  - Live indicator suave: pulso emerald (ok) / amber (stale) / rose (sin sync).
 *  - Sin charts, sin cards gigantes, sin estética ERP.
 */

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RefreshCw, Loader2 } from "lucide-react";

import type {
  FinancialConsistencyReport,
  ReconciliationMode,
  StalenessStatus,
  SyncStateSummary,
} from "@/lib/copilot-financial-reconciliation";

export type FinancialControlBarProps = {
  mode: ReconciliationMode;
  onModeChange: (mode: ReconciliationMode) => void;
  periodStart: string | null;
  periodEnd: string | null;
  onPeriodChange: (range: { start: string | null; end: string | null }) => void;
  onRefresh: () => void;
  loading: boolean;
  error: string | null;
  report: FinancialConsistencyReport | null;
  lastFetchedAt: string | null;
};

const MODE_OPTIONS: ReadonlyArray<{
  id: ReconciliationMode;
  label: string;
  hint: string;
  badge?: string;
}> = [
  {
    id: "period_only",
    label: "Período operativo",
    hint: "Período 2026: solo facturas dentro del rango operativo (01/01/2026 → hoy). Recomendado.",
    badge: "2026",
  },
  {
    id: "all_outstanding",
    label: "Todo el historial",
    hint: "Todas las facturas no anuladas con saldo abierto, incluyendo datos históricos pre-2026.",
  },
];

function pickWorstSyncStatus(syncStates: readonly SyncStateSummary[]): StalenessStatus {
  if (syncStates.length === 0) return "never_synced";
  const order: Record<StalenessStatus, number> = {
    never_synced: 0,
    critical: 1,
    warning: 2,
    ok: 3,
  };
  let worst: StalenessStatus = "ok";
  for (const s of syncStates) {
    if (order[s.status] < order[worst]) worst = s.status;
  }
  return worst;
}

function pickMostRecentSyncIso(syncStates: readonly SyncStateSummary[]): string | null {
  let bestMs: number | null = null;
  let bestIso: string | null = null;
  for (const s of syncStates) {
    if (!s.last_success_at) continue;
    const ms = Date.parse(s.last_success_at);
    if (!Number.isFinite(ms)) continue;
    if (bestMs === null || ms > bestMs) {
      bestMs = ms;
      bestIso = s.last_success_at;
    }
  }
  return bestIso;
}

function formatRelative(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "sin registro";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "sin registro";
  const deltaMin = Math.max(0, Math.round((now - ms) / 60000));
  if (deltaMin < 1) return "hace instantes";
  if (deltaMin < 60) return `hace ${deltaMin} min`;
  const h = Math.round(deltaMin / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

function statusTone(status: StalenessStatus): {
  dot: string;
  ring: string;
  label: string;
  text: string;
} {
  switch (status) {
    case "ok":
      return {
        dot: "bg-emerald-500",
        ring: "bg-emerald-500/30",
        label: "En vivo",
        text: "text-emerald-700",
      };
    case "warning":
      return {
        dot: "bg-amber-500",
        ring: "bg-amber-500/25",
        label: "Atrasado",
        text: "text-amber-700",
      };
    case "critical":
      return {
        dot: "bg-rose-500",
        ring: "bg-rose-500/25",
        label: "Crítico",
        text: "text-rose-700",
      };
    case "never_synced":
    default:
      return {
        dot: "bg-[var(--copilot-ink-muted)]",
        ring: "bg-[var(--copilot-ink-muted)]/20",
        label: "Sin sincronizar",
        text: "text-[var(--copilot-ink-muted)]",
      };
  }
}

function LiveIndicator({ status }: { status: StalenessStatus }) {
  const tone = statusTone(status);
  const reduce = useReducedMotion();
  return (
    <span className="relative inline-flex h-2.5 w-2.5 items-center justify-center" aria-hidden>
      <span className={`relative z-10 h-2 w-2 rounded-full ${tone.dot}`} />
      {status === "ok" && !reduce ? (
        <motion.span
          className={`absolute inset-0 rounded-full ${tone.ring}`}
          initial={{ opacity: 0.6, scale: 1 }}
          animate={{ opacity: 0, scale: 2 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
      ) : null}
    </span>
  );
}

const inputClass =
  "h-9 rounded-lg border border-[var(--copilot-border)] bg-white/70 px-3 text-sm text-[var(--copilot-ink)] shadow-sm transition focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20 disabled:opacity-50";

const OPERATIONAL_YEARS = [2026, 2027, 2028, 2029, 2030] as const;
type SelectedYear = (typeof OPERATIONAL_YEARS)[number] | "custom";

function deriveSelectedYear(start: string | null, end: string | null): SelectedYear {
  if (!start || !end) return "custom";
  if (!/^\d{4}-01-01$/.test(start)) return "custom";
  const year = parseInt(start.slice(0, 4), 10);
  if (!(OPERATIONAL_YEARS as readonly number[]).includes(year)) return "custom";
  if (!end.startsWith(`${year}-`)) return "custom";
  return year as (typeof OPERATIONAL_YEARS)[number];
}

export function FinancialControlBar({
  mode,
  onModeChange,
  periodStart,
  periodEnd,
  onPeriodChange,
  onRefresh,
  loading,
  error,
  report,
  lastFetchedAt,
}: FinancialControlBarProps) {
  const syncStatus = useMemo<StalenessStatus>(
    () => (report ? pickWorstSyncStatus(report.syncStates) : "never_synced"),
    [report]
  );
  const lastSyncIso = useMemo<string | null>(
    () => (report ? pickMostRecentSyncIso(report.syncStates) : null),
    [report]
  );

  const tone = statusTone(syncStatus);
  const periodDisabled = mode !== "period_only";
  const selectedYear = deriveSelectedYear(periodStart, periodEnd);

  function handleYearChange(yearStr: string) {
    const year = parseInt(yearStr, 10);
    if (isNaN(year)) return;
    const start = `${year}-01-01`;
    const todayStr = new Date().toISOString().slice(0, 10);
    const end = year === new Date().getFullYear() ? todayStr : `${year}-12-31`;
    onPeriodChange({ start, end });
  }

  return (
    <div className="sticky top-0 z-30 -mx-6 mb-6 border-b border-[var(--copilot-border)] bg-white/70 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/55">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Sync status */}
        <div className="flex min-w-0 items-center gap-3">
          <LiveIndicator status={syncStatus} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold uppercase tracking-[0.12em] ${tone.text}`}>
                {tone.label}
              </span>
              {error ? (
                <span className="text-xs font-medium text-rose-700" title={error}>
                  · error de carga
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[var(--copilot-ink-muted)]">
              Última sync Zeta {formatRelative(lastSyncIso)}
              {lastFetchedAt ? (
                <span className="ml-2">
                  · datos {formatRelative(lastFetchedAt)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Mode selector */}
        <div
          role="tablist"
          aria-label="Modo de reconciliación"
          className="inline-flex items-center rounded-xl border border-[var(--copilot-border)] bg-white/70 p-0.5 shadow-sm"
        >
          {MODE_OPTIONS.map((opt) => {
            const active = opt.id === mode;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                title={opt.hint}
                onClick={() => {
                  if (!active) onModeChange(opt.id);
                }}
                className={[
                  "relative inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition",
                  active
                    ? "bg-[var(--copilot-ink)] text-white shadow"
                    : "text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]",
                ].join(" ")}
              >
                {opt.label}
                {opt.badge ? (
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-emerald-100 text-emerald-800",
                    ].join(" ")}
                  >
                    {opt.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Period range */}
        <div className="flex flex-wrap items-center gap-2">
          {!periodDisabled && (
            <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--copilot-ink-muted)]">
              Año
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                className={`${inputClass} cursor-pointer`}
                aria-label="Año operativo"
              >
                {OPERATIONAL_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
                {selectedYear === "custom" && (
                  <option value="custom">Personalizado</option>
                )}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--copilot-ink-muted)]">
            Desde
            <input
              type="date"
              className={inputClass}
              disabled={periodDisabled}
              value={periodStart ?? ""}
              onChange={(e) =>
                onPeriodChange({ start: e.target.value || null, end: periodEnd })
              }
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--copilot-ink-muted)]">
            Hasta
            <input
              type="date"
              className={inputClass}
              disabled={periodDisabled}
              value={periodEnd ?? ""}
              onChange={(e) =>
                onPeriodChange({ start: periodStart, end: e.target.value || null })
              }
            />
          </label>
        </div>

        {/* Refresh */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
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
      </div>
    </div>
  );
}
