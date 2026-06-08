import type { InitiativeRow } from "@/lib/ai/initiative-types";

import { CopilotBadge } from "@/components/copilot/copilot-ui";

function formatScore(score: number): string {
  return score.toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function statusTone(
  status: string
): "neutral" | "warning" | "danger" | "success" {
  const s = status.toLowerCase();
  if (s === "new") return "success";
  if (s.includes("progress") || s === "en_curso") return "warning";
  if (s.includes("reject") || s.includes("closed")) return "neutral";
  return "neutral";
}

export function OpportunitiesList({
  items,
  emptyMessage = "Todavía no hay oportunidades. Generá un lote para comenzar.",
}: {
  items: InitiativeRow[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 px-5 py-8 text-center text-sm text-[var(--copilot-ink-muted)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((row) => (
        <li
          key={row.id}
          className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/85 px-4 py-4 shadow-sm sm:px-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--copilot-ink)]">
                {row.company_name}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                {row.source}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
                {row.trigger}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
              <span className="text-lg font-semibold tabular-nums text-[var(--copilot-accent)]">
                {formatScore(Number(row.score))}
              </span>
              <CopilotBadge tone={statusTone(row.status)}>{row.status}</CopilotBadge>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
