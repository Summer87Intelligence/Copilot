"use client";

import type { SnapshotHealth } from "@/lib/copilot-rutas-snapshot-types";

const STATUS_LABEL: Record<SnapshotHealth["status"], string> = {
  ok: "Lectura operativa al día",
  partial: "Lectura parcial",
  degraded: "Lectura degradada",
  stale: "Lectura en caché",
  error: "Lectura no disponible",
};

type RutasSnapshotHealthNoticeProps = {
  health: SnapshotHealth | null;
};

export function RutasSnapshotHealthNotice({ health }: RutasSnapshotHealthNoticeProps) {
  if (!health || health.status === "ok") return null;

  const toneClass =
    health.status === "error"
      ? "border-rose-200/80 bg-rose-50/80 text-rose-950"
      : health.status === "stale"
        ? "border-[var(--copilot-border)]/80 bg-[var(--copilot-card-bg)]/80 text-[var(--copilot-ink)]"
        : "border-amber-200/80 bg-amber-50/70 text-amber-950";

  return (
    <div className={`rounded-lg border px-2.5 py-2 text-[11px] ${toneClass}`} role="status">
      <p className="font-semibold">{STATUS_LABEL[health.status]}</p>
      {health.warnings.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {health.warnings.slice(0, 3).map((warning) => (
            <li key={`${warning.source}:${warning.code}`}>{warning.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
