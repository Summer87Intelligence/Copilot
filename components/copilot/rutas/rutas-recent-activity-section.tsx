"use client";

import { CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { useRutasOperationalFeedSnapshot } from "@/components/copilot/rutas/rutas-operational-feed-context";

const EVENT_HUMAN_LABEL: Record<string, string> = {
  workflow_completed: "Se completó una tarea",
  workflow_auto_completed: "El sistema cerró una tarea automáticamente",
  workflow_escalated: "Una tarea subió de prioridad",
  workflow_blocked: "Una tarea quedó bloqueada",
  workflow_unblocked: "Se desbloqueó una tarea",
  workflow_created: "Se abrió una tarea nueva",
  workflow_cancelled: "Se canceló una tarea",
  step_completed: "Se avanzó en una tarea",
  action_resolved: "Se resolvió un seguimiento",
  action_created: "Se creó un seguimiento",
  action_blocked: "Un seguimiento quedó bloqueado",
  automation_triggered: "El sistema aplicó una acción automática",
  snapshot_rebuilt: "El sistema actualizó el estado general",
};

function humanizeEventLabel(eventType: string, entityLabel: string | null): string {
  const base = EVENT_HUMAN_LABEL[eventType];
  if (base) return entityLabel ? `${base}: ${entityLabel}` : base;
  return entityLabel ?? eventType;
}

function formatRelativeTime(iso: string): string {
  try {
    const deltaMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.round(deltaMs / 60_000);
    if (minutes < 1) return "ahora";
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    return `hace ${days} d`;
  } catch {
    return iso;
  }
}

function severityDot(severity: string): string {
  if (severity === "critical" || severity === "error") return "bg-rose-400";
  if (severity === "warning" || severity === "high") return "bg-amber-400";
  if (severity === "success") return "bg-emerald-400";
  return "bg-[var(--copilot-border)]";
}

export function RutasRecentActivitySection() {
  const { operationalEvents, loading } = useRutasOperationalFeedSnapshot();

  const events = operationalEvents.slice(0, 6);

  if (!loading && events.length === 0) return null;

  return (
    <section className="space-y-1">
      <CopilotSectionTitle
        title="Actividad reciente"
        subtitle="Lo que pasó en las últimas horas."
      />

      {loading && events.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-[var(--copilot-border)]/15" />
          ))}
        </div>
      ) : (
        <ul className="space-y-1">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-start gap-2.5 rounded-lg border border-[var(--copilot-border)]/50 bg-[var(--copilot-card-bg)]/70 px-2.5 py-2"
            >
              <span
                className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${severityDot(event.severity)}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium leading-snug text-[var(--copilot-ink)]">
                  {humanizeEventLabel(event.eventType, event.entityLabel)}
                </p>
                {event.actorLabel ? (
                  <p className="text-[10px] text-[var(--copilot-ink-muted)]">{event.actorLabel}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-[10px] text-[var(--copilot-ink-muted)]">
                {formatRelativeTime(event.occurredAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
