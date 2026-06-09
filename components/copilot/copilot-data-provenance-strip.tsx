"use client";

import {
  buildCopilotProvenanceLine,
  type CopilotDataProvenanceInput,
} from "@/lib/copilot-data-provenance";

/**
 * Tira compacta de confianza: fuente, frescura y período.
 */
export function CopilotDataProvenanceStrip({
  source,
  updatedAt,
  periodFrom,
  periodTo,
  periodLabel,
  syncStates,
  className = "",
}: CopilotDataProvenanceInput & { className?: string }) {
  const line = buildCopilotProvenanceLine({
    source,
    updatedAt,
    periodFrom,
    periodTo,
    periodLabel,
    syncStates,
  });

  return (
    <p
      className={`text-[11px] leading-snug text-[var(--copilot-ink-muted)] ${className}`.trim()}
    >
      <span className="font-semibold text-[var(--copilot-ink)]">Fuente:</span> {line.source}
      <span aria-hidden="true"> · </span>
      <span className="font-semibold text-[var(--copilot-ink)]">Actualizado:</span>{" "}
      {line.updatedLabel}
      {line.periodLabel ? (
        <>
          <span aria-hidden="true"> · </span>
          <span className="font-semibold text-[var(--copilot-ink)]">Período:</span>{" "}
          {line.periodLabel}
        </>
      ) : null}
    </p>
  );
}
