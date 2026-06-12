"use client";

import {
  Bot,
  Calendar,
  CheckCircle2,
  GitBranch,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";

import type { ExecutiveTimelineEvent, ExecutiveTimelineEventKind } from "@/lib/decision-engine/executive-timeline-builder";

const KIND_ICON: Record<ExecutiveTimelineEventKind, React.ReactNode> = {
  action_registered:   <MessageSquare className="h-3 w-3" />,
  followup_created:    <Calendar className="h-3 w-3" />,
  automation_executed: <Bot className="h-3 w-3" />,
  state_changed:       <GitBranch className="h-3 w-3" />,
  sla_breach:          <ShieldAlert className="h-3 w-3" />,
  recovery_detected:   <CheckCircle2 className="h-3 w-3" />,
};

const KIND_COLOR: Record<ExecutiveTimelineEventKind, string> = {
  action_registered:   "bg-[var(--copilot-tone-neutral-bg)] text-[var(--copilot-accent)]",
  followup_created:    "bg-violet-100 text-violet-700",
  automation_executed: "bg-[var(--copilot-soft-bg)] text-[var(--copilot-ink-muted)]",
  state_changed:       "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  sla_breach:          "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]",
  recovery_detected:   "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]",
};

function formatRelative(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  return `${Math.floor(hrs / 24)} d`;
}

type Props = {
  events: ExecutiveTimelineEvent[];
};

export function ExecutiveTimeline({ events }: Props) {
  if (events.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[var(--copilot-border)]/60 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)] mb-1.5">
        Actividad reciente
      </p>
      <ol className="space-y-1">
        {events.map((event) => (
          <li key={event.id} className="flex items-start gap-2">
            <span
              className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${KIND_COLOR[event.kind]}`}
            >
              {KIND_ICON[event.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-[var(--copilot-text-secondary)] leading-tight truncate">
                {event.label}
              </p>
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-[var(--copilot-text-muted)]">
              {formatRelative(event.at)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
