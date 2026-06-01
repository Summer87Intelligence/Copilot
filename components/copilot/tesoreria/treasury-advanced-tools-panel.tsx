"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { TreasurySantanderImportPanel } from "@/components/copilot/tesoreria/treasury-santander-import-panel";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";

type Props = {
  workspace: TreasuryWorkspace;
};

export function TreasuryAdvancedToolsPanel({ workspace }: Props) {
  const [sectionOpen, setSectionOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-dashed border-[var(--copilot-border)] bg-[rgba(248,246,242,0.5)]">
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left"
        aria-expanded={sectionOpen}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--copilot-ink)]">
            Importador bancario
          </span>
          <span className="mt-0.5 block text-xs text-[var(--copilot-ink-muted)]">
            Subí un extracto CSV o XLSX para revisar movimientos y posibles coincidencias.
          </span>
        </span>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition ${sectionOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {sectionOpen ? (
        <div className="border-t border-[var(--copilot-border)] px-4 py-4">
          <TreasurySantanderImportPanel workspace={workspace} embedded />
        </div>
      ) : null}
    </section>
  );
}
