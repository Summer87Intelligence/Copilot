"use client";

import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  FileText,
  XCircle,
} from "lucide-react";

import type {
  OperationalHintSeverity,
  TimelineEvent,
} from "@/lib/copilot-client-operational-summary";

import { formatDateShort, formatMoney } from "./client-360-format";

export function timelineIcon(kind: TimelineEvent["kind"], severity: OperationalHintSeverity) {
  if (kind === "receipt") return <CheckCircle2 className="h-4 w-4 text-[var(--copilot-success-text)]" aria-hidden />;
  if (kind === "invoice_overdue") return <XCircle className="h-4 w-4 text-[var(--copilot-danger-text)]" aria-hidden />;
  if (kind === "invoice_issued") return <FileText className="h-4 w-4 text-sky-600" aria-hidden />;
  if (kind === "sync")
    return severity === "warning" ? (
      <AlertTriangle className="h-4 w-4 text-[var(--copilot-warning-text)]" aria-hidden />
    ) : (
      <BadgeCheck className="h-4 w-4 text-[var(--copilot-subtle)]" aria-hidden />
    );
  return <CircleDashed className="h-4 w-4 text-[var(--copilot-subtle)]" aria-hidden />;
}

export function timelineTypeLabel(kind: TimelineEvent["kind"]): string {
  switch (kind) {
    case "invoice_issued":
      return "Factura emitida";
    case "invoice_overdue":
      return "Factura con atraso";
    case "receipt":
      return "Cobro recibido";
    case "sync":
      return "Datos actualizados";
    default:
      return "Evento";
  }
}

function TimelineEventList({ evts }: { evts: TimelineEvent[] }) {
  if (evts.length === 0) return null;
  return (
    <ol className="space-y-2">
      {evts.map((ev) => {
        const medium = ev.kind === "receipt" ? (ev.description ?? null) : null;
        return (
          <li key={ev.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
            <span className="shrink-0">{timelineIcon(ev.kind, ev.severity)}</span>
            <span className="tabular-nums text-[var(--copilot-ink-muted)]">
              {formatDateShort(ev.date)}
            </span>
            <span className="text-[var(--copilot-ink-muted)]" aria-hidden>·</span>
            <span className="font-medium text-[var(--copilot-ink)]">{timelineTypeLabel(ev.kind)}</span>
            {ev.amount != null ? (
              <>
                <span className="text-[var(--copilot-ink-muted)]" aria-hidden>·</span>
                <span className="tabular-nums font-semibold text-[var(--copilot-ink)]">
                  {formatMoney(ev.amount, ev.currency)}
                </span>
              </>
            ) : null}
            {medium ? (
              <>
                <span className="text-[var(--copilot-ink-muted)]" aria-hidden>·</span>
                <span className="text-[var(--copilot-ink-muted)]">{medium}</span>
              </>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function TimelineBlock({
  events,
  maxEvents,
  commercialOnly = false,
}: {
  events: TimelineEvent[];
  maxEvents?: number;
  commercialOnly?: boolean;
}) {
  const filtered = commercialOnly ? events.filter((e) => e.kind !== "sync") : events;
  const commercialEvents = filtered.filter((e) => e.kind !== "sync");
  const syncEvents = commercialOnly ? [] : filtered.filter((e) => e.kind === "sync");
  const limitedCommercial =
    maxEvents != null ? commercialEvents.slice(0, maxEvents) : commercialEvents;

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-[var(--copilot-ink-muted)]">Sin actividad reciente.</p>
    );
  }

  return (
    <div className="space-y-4">
      {limitedCommercial.length > 0 ? (
        <div>
          {!commercialOnly ? (
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
              Actividad comercial
            </p>
          ) : null}
          <TimelineEventList evts={limitedCommercial} />
        </div>
      ) : null}
      {syncEvents.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
            Actualización de datos
          </p>
          <TimelineEventList evts={syncEvents} />
        </div>
      ) : null}
    </div>
  );
}
