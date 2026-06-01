"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { TreasuryAccountsPanel } from "@/components/copilot/tesoreria/treasury-accounts-panel";
import { TreasuryBankReconciliationPanel } from "@/components/copilot/tesoreria/treasury-bank-panel";
import { TreasuryOpeningBalancesPanel } from "@/components/copilot/tesoreria/treasury-opening-balances-panel";
import { TreasurySantanderImportPanel } from "@/components/copilot/tesoreria/treasury-santander-import-panel";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";

type Props = {
  workspace: TreasuryWorkspace;
};

function ToolAccordion({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--copilot-ink)]">{title}</span>
          <span className="mt-0.5 block text-xs text-[var(--copilot-ink-muted)]">{subtitle}</span>
        </span>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-[var(--copilot-border)] px-4 py-4">{children}</div> : null}
    </div>
  );
}

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
            Herramientas avanzadas
          </span>
          <span className="mt-0.5 block text-xs text-[var(--copilot-ink-muted)]">
            Importación bancaria, conciliación, cuentas y saldos iniciales.
          </span>
        </span>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition ${sectionOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {sectionOpen ? (
        <div className="space-y-3 border-t border-[var(--copilot-border)] px-4 py-4">
          <ToolAccordion
            title="Importador bancario"
            subtitle="Subí un extracto CSV o XLSX para revisar movimientos y posibles coincidencias."
          >
            <TreasurySantanderImportPanel workspace={workspace} embedded />
          </ToolAccordion>

          <ToolAccordion
            title="Conciliación bancaria"
            subtitle="Revisá movimientos importados y confirmá coincidencias con la caja registrada."
          >
            <TreasuryBankReconciliationPanel workspace={workspace} embedded />
          </ToolAccordion>

          <ToolAccordion title="Cuentas de tesorería" subtitle="Cuentas usadas para organizar movimientos.">
            <TreasuryAccountsPanel workspace={workspace} embedded />
          </ToolAccordion>

          <ToolAccordion
            title="Saldos iniciales"
            subtitle="Definen desde qué saldo empieza Copilot a calcular caja disponible."
          >
            <TreasuryOpeningBalancesPanel workspace={workspace} embedded />
          </ToolAccordion>
        </div>
      ) : null}
    </section>
  );
}
