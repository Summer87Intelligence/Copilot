"use client";

import Link from "next/link";

import { CopilotCard, CopilotPrimaryLink } from "@/components/copilot/copilot-ui";
import type { OperationalFeedGroup } from "@/lib/copilot-operational-feed-types";
import type { RutasGateMeta } from "@/lib/copilot-rutas-gate";

type RutasExecutiveRailProps = {
  loading: boolean;
  hubLoadedAt: string | null;
  gate: RutasGateMeta | null;
  feedLoading: boolean;
  feedGroups: OperationalFeedGroup[];
};

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function healthLabel(gate: RutasGateMeta | null): { label: string; tone: string } {
  if (!gate) return { label: "…", tone: "text-[var(--copilot-ink-muted)]" };
  if (!gate.recommendations_enabled) {
    return { label: "No apto", tone: "text-rose-800" };
  }
  if (gate.coverage === "partial" || gate.confidence === "medium") {
    return { label: "Parcial", tone: "text-amber-900" };
  }
  return { label: "Validado", tone: "text-emerald-900" };
}

export function RutasExecutiveRail({
  loading,
  hubLoadedAt,
  gate,
  feedLoading,
  feedGroups,
}: RutasExecutiveRailProps) {
  const health = healthLabel(gate);
  const criticalOpen = feedGroups.filter((group) => group.severity === "critical").length;
  const nextGroup = feedGroups[0] ?? null;
  const primaryHref = nextGroup?.primaryItem.href ?? "/copilot/acciones";
  const primaryLabel = nextGroup?.cta?.label ?? "Abrir cola";

  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[220px] xl:w-[232px]">
      <CopilotCard className="border-[var(--copilot-border)]/80 bg-white/85 p-2.5 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Pulso del día
        </p>
        <dl className="mt-1.5 space-y-1.5 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Salud</dt>
            <dd className={`font-semibold ${health.tone}`}>
              {loading ? "…" : health.label}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Críticas abiertas</dt>
            <dd className="font-semibold tabular-nums text-[var(--copilot-ink)]">
              {feedLoading ? "…" : String(criticalOpen)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Próxima acción</dt>
            <dd className="min-w-0 text-right font-medium leading-snug text-[var(--copilot-ink)]">
              {feedLoading ? "…" : nextGroup?.title ?? "Sin seguimientos activos"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Actualizado</dt>
            <dd className="font-medium tabular-nums text-[var(--copilot-ink)]">
              {loading ? "…" : formatUpdatedAt(hubLoadedAt)}
            </dd>
          </div>
        </dl>
        <div className="mt-2.5 border-t border-[var(--copilot-border)]/60 pt-2">
          <CopilotPrimaryLink href={primaryHref} className="w-full justify-center px-2.5 py-1.5 text-xs">
            {primaryLabel}
          </CopilotPrimaryLink>
          {nextGroup?.primaryItem.href ? (
            <Link
              href={nextGroup.primaryItem.href}
              className="mt-1.5 block text-center text-[11px] font-medium text-[var(--copilot-ink-muted)] underline-offset-2 hover:text-[var(--copilot-ink)] hover:underline"
            >
              Abrir prioridad
            </Link>
          ) : null}
        </div>
      </CopilotCard>
    </aside>
  );
}
