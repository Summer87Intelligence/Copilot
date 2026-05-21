import type { OicPipelineRunEvent } from "@/lib/operacional/types";

const statusCls: Record<OicPipelineRunEvent["status"], string> = {
  completed: "bg-emerald-100/70 text-emerald-900",
  failed:    "bg-rose-100/80 text-rose-900",
  partial:   "bg-amber-100/80 text-amber-900",
  running:   "bg-blue-100/70 text-blue-900",
};

const statusLabel: Record<OicPipelineRunEvent["status"], string> = {
  completed: "OK",
  failed:    "Fallo",
  partial:   "Parcial",
  running:   "Corriendo",
};

function fmt(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

export function OicRunEventRow({ event }: { event: OicPipelineRunEvent }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 hover:bg-[var(--copilot-accent-soft)]/40">
      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${statusCls[event.status]}`}>
        {statusLabel[event.status]}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{event.pipelineName}</p>
        {event.errorMessage ? (
          <p className="truncate text-xs text-rose-700">{event.errorMessage}</p>
        ) : null}
      </div>
      <span className="whitespace-nowrap text-xs tabular-nums text-[var(--copilot-ink-muted)]">
        {fmt(event.durationMs)}
      </span>
      <span className="whitespace-nowrap text-xs tabular-nums text-[var(--copilot-ink-muted)]">
        {event.rowsProcessed != null ? `${event.rowsProcessed} filas` : "—"}
      </span>
      <span className="whitespace-nowrap text-xs text-[var(--copilot-ink-muted)]">
        {shortDate(event.startedAt)} {shortTime(event.startedAt)}
      </span>
    </div>
  );
}
