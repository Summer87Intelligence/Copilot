/**
 * Helpers de trazabilidad visible para el dueño (fuente, frescura, período).
 */

import { pickMostRecentSync } from "@/lib/copilot-cartera-format";
import type { SyncStateSummary } from "@/lib/copilot-financial-reconciliation";

export type CopilotDataProvenanceInput = {
  source?: string;
  updatedAt?: Date | string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  /** Etiqueta fija cuando no aplica un rango Desde/Hasta. */
  periodLabel?: string | null;
  syncStates?: readonly SyncStateSummary[];
};

/** Etiqueta relativa corta: "hace 2 h", "hace 3 d". */
export function formatCopilotRelativeUpdated(
  value: Date | string | null | undefined
): string {
  if (!value) return "sin registro reciente";
  const ms = typeof value === "string" ? Date.parse(value) : value.getTime();
  if (!Number.isFinite(ms)) return "sin registro reciente";
  const diffHours = (Date.now() - ms) / (1000 * 60 * 60);
  if (diffHours < 1) return "hace minutos";
  if (diffHours < 24) return `hace ${Math.max(1, Math.round(diffHours))} h`;
  const days = Math.max(1, Math.round(diffHours / 24));
  return `hace ${days} d`;
}

function monthYearLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("es-UY", { month: "short", year: "numeric" });
}

/** Período legible para el dueño. */
export function formatCopilotPeriodLabel(
  from?: string | null,
  to?: string | null
): string | null {
  if (!from || !to) return null;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  if (from === monthStart && to === today) return "mes actual";
  if (from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01")) {
    return monthYearLabel(from);
  }
  return `${from.slice(8, 10)}/${from.slice(5, 7)} – ${to.slice(8, 10)}/${to.slice(5, 7)}`;
}

export function resolveCopilotUpdatedAt(input: CopilotDataProvenanceInput): Date | string | null {
  if (input.updatedAt) return input.updatedAt;
  const sync = pickMostRecentSync(input.syncStates ?? []);
  return sync?.last_success_at ?? null;
}

export function buildCopilotProvenanceLine(input: CopilotDataProvenanceInput): {
  source: string;
  updatedLabel: string;
  periodLabel: string | null;
} {
  return {
    source: input.source ?? "Zeta",
    updatedLabel: formatCopilotRelativeUpdated(resolveCopilotUpdatedAt(input)),
    periodLabel:
      input.periodLabel ??
      formatCopilotPeriodLabel(input.periodFrom, input.periodTo),
  };
}
