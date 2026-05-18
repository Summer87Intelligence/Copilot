"use client";

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Clock,
  Wifi,
  WifiOff,
  Radio,
  Loader2,
} from "lucide-react";

import type { PipelineHealthSummary, PipelineHealthStatus } from "@/lib/data/zeta-pipeline-health";
import { ZETA_PIPELINE_NAMES } from "@/lib/data/zeta-pipeline-run-types";
import {
  derivePipelineAlerts,
  type RealtimeConnectionStatus,
} from "@/lib/copilot-pipeline-health-realtime";
import { getZetaPipelineDisplayLabel } from "@/lib/integrations/zeta/zeta-sync-resource-keys";

const INTERVAL_LABELS: Record<string, string> = {
  [ZETA_PIPELINE_NAMES.SALDOS]: "cada 3 h",
  [ZETA_PIPELINE_NAMES.VOUCHERS]: "cada 6 h",
  [ZETA_PIPELINE_NAMES.CONTACTS]: "diario",
  [ZETA_PIPELINE_NAMES.VENDOR_PAYMENTS]: "diario",
  [ZETA_PIPELINE_NAMES.COLLECTION_RECEIPTS]: "cada 6 h",
};

function statusConfig(status: PipelineHealthStatus): {
  icon: React.ReactNode;
  label: string;
  pill: string;
} {
  switch (status) {
    case "healthy":
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />,
        label: "Saludable",
        pill: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      };
    case "degraded":
      return {
        icon: <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />,
        label: "Degradado",
        pill: "bg-amber-50 text-amber-700 border border-amber-200",
      };
    case "stalled":
      return {
        icon: <XCircle className="h-4 w-4 text-rose-500" aria-hidden />,
        label: "Detenido",
        pill: "bg-rose-50 text-rose-700 border border-rose-200",
      };
    default:
      return {
        icon: <HelpCircle className="h-4 w-4 text-slate-400" aria-hidden />,
        label: "Sin datos",
        pill: "bg-slate-50 text-slate-500 border border-slate-200",
      };
  }
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  return `hace ${diffD} d`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min`;
}

function realtimeStatusConfig(status: RealtimeConnectionStatus): {
  icon: React.ReactNode;
  label: string;
  hint: string;
  bar: string;
} {
  switch (status) {
    case "connected":
      return {
        icon: <Radio className="h-3 w-3 text-emerald-600" aria-hidden />,
        label: "Realtime activo",
        hint: "Actualizaciones automáticas activadas · polling cada 60 s",
        bar: "bg-emerald-50 border-emerald-200 text-emerald-800",
      };
    case "degraded":
      return {
        icon: <Wifi className="h-3 w-3 text-amber-500" aria-hidden />,
        label: "Fallback activo",
        hint: "Realtime degradado · polling cada 15 s",
        bar: "bg-amber-50 border-amber-200 text-amber-800",
      };
    case "disconnected":
      return {
        icon: <WifiOff className="h-3 w-3 text-rose-500" aria-hidden />,
        label: "Sin conexión realtime",
        hint: "Polling cada 15 s como fallback",
        bar: "bg-rose-50 border-rose-200 text-rose-800",
      };
    default:
      return {
        icon: <Radio className="h-3 w-3 text-slate-400 animate-pulse" aria-hidden />,
        label: "Conectando…",
        hint: "Estableciendo conexión realtime",
        bar: "bg-slate-50 border-slate-200 text-slate-600",
      };
  }
}

function ConnectionStatusBar({
  realtimeStatus,
  lastUpdatedAt,
  isRefreshing,
  refreshError,
}: {
  realtimeStatus: RealtimeConnectionStatus;
  lastUpdatedAt: Date | null;
  isRefreshing: boolean;
  refreshError: boolean;
}) {
  const cfg = realtimeStatusConfig(realtimeStatus);
  const lastUpdatedStr = lastUpdatedAt
    ? formatRelativeTime(lastUpdatedAt.toISOString())
    : "—";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${cfg.bar}`}
      aria-live="polite"
    >
      <div className="flex items-center gap-1.5">
        {cfg.icon}
        <span className="font-semibold">{cfg.label}</span>
        <span className="hidden text-[11px] opacity-70 sm:inline">· {cfg.hint}</span>
      </div>
      <div className="flex items-center gap-2">
        {isRefreshing && (
          <Loader2 className="h-3 w-3 animate-spin opacity-60" aria-hidden />
        )}
        {refreshError && (
          <span className="text-rose-700">Error al refrescar</span>
        )}
        {!refreshError && lastUpdatedAt && (
          <span className="opacity-70">Actualizado {lastUpdatedStr}</span>
        )}
      </div>
    </div>
  );
}

function AlertsBar({ summaries }: { summaries: PipelineHealthSummary[] }) {
  const alerts = derivePipelineAlerts(summaries);
  if (alerts.length === 0) return null;

  const pipelineLabel = getZetaPipelineDisplayLabel;

  return (
    <div
      className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3"
      aria-label="Alertas operativas de pipelines"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
        Alertas operativas
      </p>
      <ul className="space-y-1">
        {alerts.map((a, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-amber-800">
            <AlertTriangle
              className="mt-0.5 h-3 w-3 shrink-0 text-amber-500"
              aria-hidden
            />
            <span>
              <span className="font-medium">{pipelineLabel(a.pipeline_name)}:</span>{" "}
              {a.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PipelineCard({ summary }: { summary: PipelineHealthSummary }) {
  const { icon, label, pill } = statusConfig(summary.status);
  const pipelineLabel = getZetaPipelineDisplayLabel(summary.pipeline_name);
  const intervalLabel = INTERVAL_LABELS[summary.pipeline_name] ?? "—";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-[var(--copilot-ink)]">{pipelineLabel}</span>
          <span className="text-xs text-[var(--copilot-ink-muted)]">· {intervalLabel}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill}`}>
          {label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric
          label="Procesadas"
          value={summary.last_run_rows_processed != null ? String(summary.last_run_rows_processed) : "—"}
        />
        <Metric
          label="Actualizadas"
          value={summary.last_run_rows_updated != null ? String(summary.last_run_rows_updated) : "—"}
        />
        <Metric
          label="Errores"
          value={summary.last_run_rows_failed != null ? String(summary.last_run_rows_failed) : "—"}
          danger={(summary.last_run_rows_failed ?? 0) > 0}
        />
      </div>

      <div className="space-y-1 text-xs text-[var(--copilot-ink-muted)]">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 shrink-0" aria-hidden />
          <span>
            Última corrida:{" "}
            <span className="font-medium text-[var(--copilot-ink)]">{formatRelativeTime(summary.last_run_at)}</span>
            {summary.last_run_duration_ms != null && (
              <span className="ml-1 text-[var(--copilot-ink-muted)]">
                · {formatDuration(summary.last_run_duration_ms)}
              </span>
            )}
          </span>
        </div>
        {summary.consecutive_failures > 0 && (
          <p className="text-amber-700">
            {summary.consecutive_failures} fallo{summary.consecutive_failures !== 1 ? "s" : ""} consecutivo{summary.consecutive_failures !== 1 ? "s" : ""}
          </p>
        )}
        {summary.is_overdue && summary.last_run_at && (
          <p className="text-amber-700">Fuera de ventana esperada</p>
        )}
        {summary.last_error_summary && (
          <p className="truncate text-rose-600" title={summary.last_error_summary}>
            {summary.last_error_summary}
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50/80 px-3 py-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${danger ? "text-rose-600" : "text-[var(--copilot-ink)]"}`}>
        {value}
      </p>
    </div>
  );
}

export type PipelineHealthPanelProps = {
  summaries: PipelineHealthSummary[];
  loading: boolean;
  error: string | null;
  /** Realtime connection status. When undefined, status bar is hidden. */
  realtimeStatus?: RealtimeConnectionStatus;
  /** Timestamp of the last successful data fetch. */
  lastUpdatedAt?: Date | null;
  /**
   * True mientras un refresh interno (realtime trigger o fallback polling) está
   * en curso. Se muestra como spinner sutil dentro del `ConnectionStatusBar`,
   * sin botón manual de actualizar.
   */
  isRefreshing?: boolean;
};

export function PipelineHealthPanel({
  summaries,
  loading,
  error,
  realtimeStatus,
  lastUpdatedAt,
  isRefreshing = false,
}: PipelineHealthPanelProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {realtimeStatus !== undefined && (
          <div className="h-8 animate-pulse rounded-lg bg-slate-100/70" />
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-xl border border-[var(--copilot-border)] bg-slate-100/70"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        {realtimeStatus !== undefined && (
          <ConnectionStatusBar
            realtimeStatus={realtimeStatus}
            lastUpdatedAt={lastUpdatedAt ?? null}
            isRefreshing={isRefreshing}
            refreshError
          />
        )}
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          {error}
        </div>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <p className="py-4 text-sm text-[var(--copilot-ink-muted)]">
        Sin datos de pipelines disponibles.
      </p>
    );
  }

  const allHealthy = summaries.every((s) => s.status === "healthy");

  return (
    <div className="space-y-4">
      {realtimeStatus !== undefined && (
        <ConnectionStatusBar
          realtimeStatus={realtimeStatus}
          lastUpdatedAt={lastUpdatedAt ?? null}
          isRefreshing={isRefreshing}
          refreshError={false}
        />
      )}

      <AlertsBar summaries={summaries} />

      {allHealthy && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
          Todos los pipelines operativos
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {summaries.map((s) => (
          <PipelineCard key={s.pipeline_name} summary={s} />
        ))}
      </div>
    </div>
  );
}
