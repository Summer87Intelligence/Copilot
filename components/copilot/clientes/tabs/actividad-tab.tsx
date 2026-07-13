"use client";

import { CopilotDataProvenanceStrip } from "@/components/copilot/copilot-data-provenance-strip";
import type { TimelineEvent } from "@/lib/copilot-client-operational-summary";

import { TimelineBlock } from "../client-360-timeline";

export function ActividadTab({
  events,
  lastSyncAt,
}: {
  events: TimelineEvent[];
  lastSyncAt: string | null;
}) {
  return (
    <div className="space-y-4 px-5 py-4">
      <CopilotDataProvenanceStrip updatedAt={lastSyncAt} periodLabel="historial del cliente" />
      <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4 shadow-sm">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
          Actividad reciente
        </p>
        <TimelineBlock events={events} />
      </div>
    </div>
  );
}
