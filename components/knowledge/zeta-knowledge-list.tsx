"use client";

import { FileText } from "lucide-react";

import { CopilotBadge } from "@/components/copilot/copilot-ui";

export type ZetaListItem = {
  title: string;
  output_md: string;
  url_original: string | null;
  url_final: string | null;
  snippet?: string;
  score?: number;
  folder?: string | null;
  /** Primer segmento bajo `/ayuda/` (índice markdown); alineado con filtro de rama. */
  ayuda_branch?: string | null;
};

export function ZetaKnowledgeList({
  items,
  activePath,
  onSelect,
}: {
  items: ZetaListItem[];
  activePath: string | null;
  onSelect: (outputMd: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--copilot-border)] bg-white/50 p-8 text-center">
        <p className="text-sm font-medium text-[var(--copilot-ink)]">Sin resultados</p>
        <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
          Probá otra búsqueda, otro modo de búsqueda o cambiá el filtro de rama.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex max-h-[min(52vh,560px)] flex-col gap-1 overflow-y-auto pr-1">
      {items.map((row) => {
        const active = row.output_md === activePath;
        return (
          <li key={row.output_md}>
            <button
              type="button"
              onClick={() => onSelect(row.output_md)}
              className={`flex w-full flex-col gap-1 rounded-xl border px-3 py-3 text-left transition ${
                active
                  ? "border-[var(--copilot-accent)] bg-[rgba(44,40,37,0.04)] shadow-sm"
                  : "border-transparent bg-white/60 hover:border-[var(--copilot-border)] hover:bg-white"
              }`}
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-[var(--copilot-ink)]">{row.title}</p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--copilot-ink-muted)]">
                    {row.output_md.replace(/^docs\/zeta\/markdown\//, "")}
                  </p>
                </div>
                {row.score != null ? (
                  <CopilotBadge tone="neutral">{Math.round(row.score)}</CopilotBadge>
                ) : null}
              </div>
              {row.snippet ? (
                <p className="line-clamp-2 pl-6 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                  {row.snippet}
                </p>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
