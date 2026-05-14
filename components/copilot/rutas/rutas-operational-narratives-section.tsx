"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { useTreasuryHoySignals } from "@/hooks/use-treasury-hoy-signals";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { buildGroupedOperationalFeed } from "@/lib/copilot-operational-feed-groups";
import type {
  OperationalFeedGroup,
  OperationalFeedItem,
} from "@/lib/copilot-operational-feed-types";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import {
  snapshotCoverageRatio,
  snapshotLiquidityBalance,
} from "@/lib/copilot-financial-snapshot-selectors";
import {
  buildOperationalNarratives,
  buildTreasuryNarrativeContext,
} from "@/lib/copilot-operational-narrative";
import type { OperationalNarrative } from "@/lib/copilot-operational-narrative-types";

type RutasOperationalNarrativesSectionProps = {
  snapshot: FinancialSnapshotApiV1 | null;
};

const SEVERITY_LABEL: Record<OperationalNarrative["severity"], string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
};

const CATEGORY_LABEL: Record<OperationalNarrative["category"], string> = {
  cashflow: "Caja",
  collections: "Cobranza",
  treasury: "Tesorería",
  risk: "Riesgo",
  operations: "Operaciones",
};

function severityTone(
  severity: OperationalNarrative["severity"]
): "neutral" | "warning" | "danger" | "success" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  return "neutral";
}

function NarrativeCard({ narrative }: { narrative: OperationalNarrative }) {
  return (
    <CopilotCard className="border-[rgba(31,107,74,0.16)] bg-white/95 p-2.5 shadow-sm">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <CopilotBadge tone={severityTone(narrative.severity)}>
            {SEVERITY_LABEL[narrative.severity]}
          </CopilotBadge>
          <CopilotBadge tone="neutral">{CATEGORY_LABEL[narrative.category]}</CopilotBadge>
          <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-[var(--copilot-ink)]">
            {narrative.title}
          </p>
        </div>
        {narrative.cta?.href ? (
          <Link
            href={narrative.cta.href}
            className="shrink-0 text-[11px] font-medium text-[var(--copilot-ink-muted)] underline-offset-2 transition hover:text-[var(--copilot-ink)] hover:underline"
          >
            {narrative.cta.label}
          </Link>
        ) : null}
      </div>
      <dl className="mt-1.5 grid gap-x-2 gap-y-1 text-[11px] leading-snug sm:grid-cols-3">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink)]">
            Por qué
          </dt>
          <dd className="mt-px text-[var(--copilot-ink-muted)]">{narrative.cause}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink)]">
            Impacto
          </dt>
          <dd className="mt-px text-[var(--copilot-ink-muted)]">{narrative.impact}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink)]">
            Qué hacer ahora
          </dt>
          <dd className="mt-px text-[var(--copilot-ink-muted)]">{narrative.recommendation}</dd>
        </div>
      </dl>
    </CopilotCard>
  );
}

export function RutasOperationalNarrativesSection({
  snapshot,
}: RutasOperationalNarrativesSectionProps) {
  const { loading: treasuryLoading, signals } = useTreasuryHoySignals();
  const [items, setItems] = useState<OperationalFeedItem[]>([]);
  const [priorities, setPriorities] = useState<OperationalFeedGroup[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const feedRes = await copilotApiFetch("/api/copilot/operational-feed");
      const feedJson = (await feedRes.json()) as {
        items?: OperationalFeedItem[];
        groups?: OperationalFeedGroup[];
        priorities?: OperationalFeedGroup[];
        error?: string;
      };
      if (!feedRes.ok) {
        setItems([]);
        setPriorities([]);
        setFeedError(feedJson.error ?? "No se pudo leer el centro operativo.");
        return;
      }
      const nextItems = feedJson.items ?? [];
      const grouped =
        feedJson.groups && feedJson.priorities
          ? { groups: feedJson.groups, priorities: feedJson.priorities }
          : buildGroupedOperationalFeed(nextItems);
      setItems(nextItems);
      setPriorities(grouped.priorities);
    } catch {
      setItems([]);
      setPriorities([]);
      setFeedError("Error de red al leer el centro operativo.");
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const narratives = useMemo(
    () =>
      buildOperationalNarratives({
        items,
        priorities,
        treasury: buildTreasuryNarrativeContext(signals),
        finance: snapshot
          ? {
              coverageRatio: snapshotCoverageRatio(snapshot),
              liquidityBalance: snapshotLiquidityBalance(snapshot),
            }
          : null,
      }),
    [items, priorities, signals, snapshot]
  );

  const loading = feedLoading || treasuryLoading;

  if (!loading && narratives.length === 0 && !feedError) {
    return null;
  }

  return (
    <section className="space-y-1.5">
      <CopilotSectionTitle
        title="Lectura ejecutiva"
        subtitle="Qué pasa, por qué, impacto y prioridad inmediata."
        action={
          <CopilotGhostLink
            href="/copilot/tesoreria"
            className="border-transparent bg-transparent px-0 py-0 text-xs font-medium text-[var(--copilot-ink-muted)] shadow-none hover:bg-transparent hover:text-[var(--copilot-ink)] hover:underline"
          >
            Ver caja
          </CopilotGhostLink>
        }
      />

      {feedError ? (
        <p className="text-xs text-rose-800" role="alert">
          {feedError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Preparando lectura ejecutiva…
        </div>
      ) : (
        <ul className="space-y-1.5">
          {narratives.map((narrative) => (
            <li key={narrative.id}>
              <NarrativeCard narrative={narrative} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
