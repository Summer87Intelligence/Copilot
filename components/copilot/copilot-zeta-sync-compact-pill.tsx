"use client";

import { useMemo } from "react";

import {
  computeNextZetaSyncAt,
  formatHHmm,
  ZETA_SALDOS_SYNC_INTERVAL_HOURS,
} from "@/lib/copilot-auto-sync";
import { formatCopilotRelativeUpdated } from "@/lib/copilot-data-provenance";

function formatDataAsOfShort(date: Date): string {
  return date.toLocaleDateString("es-UY", {
    day: "numeric",
    month: "short",
    timeZone: "America/Montevideo",
  });
}

/**
 * Pill discreto para el header global: datos al corte + próxima sync Zeta.
 * El detalle técnico va en tooltip.
 */
export function CopilotZetaSyncCompactPill({
  updatedAt = null,
  className = "",
}: {
  updatedAt?: Date | string | null;
  className?: string;
}) {
  const { pill, tooltip } = useMemo(() => {
    const now = new Date();
    const dataLabel = formatDataAsOfShort(updatedAt ? new Date(updatedAt) : now);
    const nextSync = computeNextZetaSyncAt(now);
    const nextLabel = formatHHmm(nextSync);
    const updatedRel = formatCopilotRelativeUpdated(updatedAt ?? now);

    return {
      pill: `Datos al ${dataLabel} · próx ${nextLabel}`,
      tooltip: [
        `Fuente: Zeta`,
        `Actualizado: ${updatedRel}`,
        `Próxima actualización automática: ${nextLabel}`,
        `Intervalo: cada ${ZETA_SALDOS_SYNC_INTERVAL_HOURS} h`,
      ].join("\n"),
    };
  }, [updatedAt]);

  return (
    <span
      title={tooltip}
      className={`hidden max-w-[14rem] truncate rounded-full border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-2.5 py-0.5 text-[10px] font-medium leading-tight text-[var(--copilot-ink-muted)] md:inline-block lg:max-w-none ${className}`.trim()}
    >
      {pill}
    </span>
  );
}
