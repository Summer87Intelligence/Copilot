"use client";

import type { CopilotTraceViewModel } from "@/lib/copilot-trace-meta";
import { traceDataStateLabelEs } from "@/lib/copilot-trace-meta";

/**
 * Trazabilidad compacta (Bloque 13). Una línea + opcional nota de cautela.
 */
export function CopilotTraceMeta({
  trace,
  className = "",
  dense = false,
  variant = "default",
}: {
  trace: CopilotTraceViewModel;
  className?: string;
  /** Menos padding vertical cuando va dentro de tarjetas densas. */
  dense?: boolean;
  /** `embed`: sin borde superior (dentro de tarjetas que ya delimitan bloques). */
  variant?: "default" | "embed";
}) {
  const state = traceDataStateLabelEs(trace.dataState);
  const pad = dense ? "pt-2" : "pt-3";
  const topRule =
    variant === "embed"
      ? ""
      : "border-t border-[var(--copilot-border)]/80";

  return (
    <div className={`${topRule} ${pad} ${className}`.trim()}>
      <p className="text-[11px] leading-snug text-[var(--copilot-ink-muted)]">
        <span className="font-semibold text-[var(--copilot-ink)]">Origen</span>{" "}
        {trace.sourceLabel}
        <span aria-hidden="true"> · </span>
        <span className="font-semibold text-[var(--copilot-ink)]">Lectura</span>{" "}
        {trace.refreshedLabel}
        <span aria-hidden="true"> · </span>
        <span className="font-semibold text-[var(--copilot-ink)]">Estado</span> {state}
        <span aria-hidden="true"> · </span>
        {trace.coverageLabel}
      </p>
      {trace.cautelaNote ? (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--copilot-ink-muted)]">
          {trace.cautelaNote}
        </p>
      ) : null}
    </div>
  );
}
