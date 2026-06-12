"use client";

import {
  buildCopilotProvenanceLine,
  formatCopilotRelativeUpdated,
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
  variant = "full",
}: CopilotDataProvenanceInput & {
  className?: string;
  variant?: "full" | "compact";
}) {
  const line = buildCopilotProvenanceLine({
    source,
    updatedAt,
    periodFrom,
    periodTo,
    periodLabel,
    syncStates,
  });

  if (variant === "compact") {
    const updatedShort = formatCopilotRelativeUpdated(updatedAt ?? null);
    const period = line.periodLabel ?? "período activo";
    const tooltip = [
      `Fuente: ${line.source}`,
      `Actualizado: ${line.updatedLabel}`,
      line.periodLabel ? `Período: ${line.periodLabel}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return (
      <p
        title={tooltip}
        className={`truncate text-[10px] leading-snug text-[var(--copilot-ink-muted)] ${className}`.trim()}
      >
        Datos {updatedShort} · {period}
      </p>
    );
  }

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
