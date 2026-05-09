"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { DataProvenanceConfig } from "@/lib/copilot-financial-terminology";
import { DATA_SOURCES, PERIOD_SCOPES, RECORD_SCOPES } from "@/lib/copilot-financial-terminology";

/**
 * Badge compacto que expone la proveniencia de un bloque financiero.
 * Muestra Fuente · Período · Alcance y abre un tooltip con la descripción completa.
 *
 * Uso:
 *   <DataProvenanceBadge provenance={PROVENANCE_HOME_DASHBOARD} />
 *   <DataProvenanceBadge provenance={PROVENANCE_CARTERA_OPERATIONAL} compact />
 */
export function DataProvenanceBadge({
  provenance,
  compact = false,
}: {
  provenance: DataProvenanceConfig;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const source = DATA_SOURCES[provenance.source];
  const period = PERIOD_SCOPES[provenance.period];
  const scope = RECORD_SCOPES[provenance.scope];

  return (
    <div className="relative inline-flex items-center gap-1.5">
      {/* Source badge */}
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight ${source.badgeClass}`}
      >
        {source.label}
      </span>

      {!compact && (
        <>
          <span className="text-[10px] text-[var(--copilot-ink-muted)]">·</span>
          {/* Period badge */}
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight ${period.badgeClass}`}
          >
            {period.label}
          </span>
          <span className="text-[10px] text-[var(--copilot-ink-muted)]">·</span>
          {/* Scope */}
          <span className="text-[10px] text-[var(--copilot-ink-muted)]">{scope.label}</span>
        </>
      )}

      {/* Info trigger */}
      <button
        type="button"
        aria-label="Ver fuente de datos"
        className="ml-0.5 flex items-center text-[var(--copilot-ink-muted)] opacity-60 hover:opacity-100 focus:outline-none"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        <Info size={11} />
      </button>

      {/* Tooltip */}
      {open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-[var(--copilot-border)] bg-white p-3 shadow-lg"
        >
          <ProvenanceDetail provenance={provenance} />
        </div>
      )}
    </div>
  );
}

function ProvenanceDetail({ provenance }: { provenance: DataProvenanceConfig }) {
  const source = DATA_SOURCES[provenance.source];
  const period = PERIOD_SCOPES[provenance.period];
  const scope = RECORD_SCOPES[provenance.scope];

  return (
    <div className="space-y-2 text-[11px]">
      <p className="font-semibold text-[var(--copilot-ink)]">Fuente de datos</p>
      <dl className="space-y-1.5">
        <ProvenanceRow
          label="Fuente"
          value={source.label}
          desc={source.description}
          badgeClass={source.badgeClass}
        />
        <ProvenanceRow
          label="Período"
          value={period.label}
          desc={period.description}
          badgeClass={period.badgeClass}
        />
        <div>
          <dt className="font-medium text-[var(--copilot-ink-muted)]">Alcance</dt>
          <dd className="mt-0.5 text-[var(--copilot-ink)]">{scope.description}</dd>
        </div>
      </dl>
      {provenance.note && (
        <p className="mt-1.5 rounded-lg border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.025)] px-2.5 py-2 text-[var(--copilot-ink-muted)]">
          {provenance.note}
        </p>
      )}
    </div>
  );
}

function ProvenanceRow({
  label,
  value,
  desc,
  badgeClass,
}: {
  label: string;
  value: string;
  desc: string;
  badgeClass: string;
}) {
  return (
    <div>
      <dt className="font-medium text-[var(--copilot-ink-muted)]">{label}</dt>
      <dd className="mt-0.5 flex items-start gap-1.5">
        <span
          className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-tight ${badgeClass}`}
        >
          {value}
        </span>
        <span className="text-[var(--copilot-ink)]">{desc}</span>
      </dd>
    </div>
  );
}
