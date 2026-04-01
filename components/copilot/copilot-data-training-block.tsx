"use client";

import type { CopilotSeverity } from "@/lib/copilot-alerts-evidence-mock";
import { CopilotSeverityBadge } from "@/components/copilot/copilot-severity-badge";

/**
 * Bloque de capacitación obligatorio en flujos de datos sensibles.
 * `severity` actúa como semáforo de atención (baja → crítica).
 */
export function CopilotDataTrainingBlock({
  title = "Qué tenés que saber",
  severity,
  paragraphs,
  className = "",
}: {
  title?: string;
  severity: CopilotSeverity;
  paragraphs: readonly string[];
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--copilot-border)] bg-[rgba(31,107,74,0.06)] p-4 ${className}`}
      role="note"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CopilotSeverityBadge severity={severity} />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          {title}
        </span>
      </div>
      <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-[var(--copilot-ink)]">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
}

/** Leyenda rápida de riesgo para eliminaciones (verde / ámbar / rojo). */
export function CopilotDataDeleteRiskLegend() {
  const items: { severity: CopilotSeverity; label: string; hint: string }[] = [
    {
      severity: "low",
      label: "Más seguro",
      hint: "Registro sin bloqueos automáticos; igual conviene revisar el contexto.",
    },
    {
      severity: "medium",
      label: "Revisar",
      hint: "Abrí el panel lateral y verificá vínculos antes de borrar.",
    },
    {
      severity: "critical",
      label: "Alto riesgo",
      hint: "Con recibos, pagos o documentos, el sistema suele bloquear para no romper caja ni trazabilidad.",
    },
  ];
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li
          key={item.severity}
          className="flex flex-wrap items-start gap-2 rounded-lg border border-[var(--copilot-border)] bg-white/80 px-3 py-2"
        >
          <CopilotSeverityBadge severity={item.severity} compact />
          <div className="min-w-0 flex-1 text-xs text-[var(--copilot-ink-muted)]">
            <span className="font-semibold text-[var(--copilot-ink)]">{item.label}.</span>{" "}
            {item.hint}
          </div>
        </li>
      ))}
    </ul>
  );
}
