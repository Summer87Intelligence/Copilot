"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Target } from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  buildCollectionAgenda,
  type CollectionAgenda,
} from "@/lib/collection/build-collection-agenda";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import {
  resolveHoyTodayPriority,
  type HoyTodayPriority,
} from "@/lib/copilot-hoy-today-priority";
import { actionCardClass } from "@/components/copilot/ui/copilot-visual-system";

type HoyTodayPriorityCardProps = {
  attentionClientsCount: number;
  debtorClientsCount: number;
  cashAfterPaymentsCritical: boolean;
  onScrollToCriticalClients?: () => void;
};

export function HoyTodayPriorityCard({
  attentionClientsCount,
  debtorClientsCount,
  cashAfterPaymentsCritical,
  onScrollToCriticalClients,
}: HoyTodayPriorityCardProps) {
  const [agenda, setAgenda] = useState<CollectionAgenda | null>(null);
  const [agendaLoaded, setAgendaLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await copilotApiFetch("/api/copilot/collection-actions");
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          actions?: CollectionAction[];
        } | null;
        if (!cancelled && json?.actions) {
          setAgenda(buildCollectionAgenda({ actions: json.actions }));
        }
      } catch {
        // Agenda opcional: prioridad sigue con el resto de señales
      } finally {
        if (!cancelled) setAgendaLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const priority: HoyTodayPriority | null = useMemo(() => {
    if (!agendaLoaded) return null;
    return resolveHoyTodayPriority({
      attentionClientsCount,
      debtorClientsCount,
      agendaOverdueCount:
        (agenda?.summary.overdueFollowupsCount ?? 0) +
        (agenda?.summary.overduePromisesCount ?? 0),
      agendaDueTodayCount: agenda?.summary.dueTodayCount ?? 0,
      cashAfterPaymentsCritical,
    });
  }, [
    agendaLoaded,
    attentionClientsCount,
    debtorClientsCount,
    agenda,
    cashAfterPaymentsCritical,
  ]);

  if (!priority) {
    return (
      <div
        className={`${actionCardClass} animate-pulse px-4 py-3.5`}
        aria-hidden
      >
        <div className="h-4 w-40 rounded bg-[rgba(44,40,37,0.08)]" />
        <div className="mt-2 h-3 w-full max-w-md rounded bg-[rgba(44,40,37,0.06)]" />
      </div>
    );
  }

  const primaryIsScroll = priority.primaryCta.action.type === "scroll_critical";

  return (
    <section
      className={`${actionCardClass} border-[rgba(31,107,74,0.22)] bg-gradient-to-br from-[var(--copilot-card-bg)] to-[rgba(31,107,74,0.06)] px-4 py-3.5 sm:px-5`}
      aria-labelledby="hoy-today-priority-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]">
            <Target className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p
              id="hoy-today-priority-title"
              className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--copilot-accent)]"
            >
              Tu día en una frase
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--copilot-ink)]">
              {priority.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
              {priority.description}
            </p>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {primaryIsScroll ? (
            <button
              type="button"
              onClick={onScrollToCriticalClients}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--copilot-accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              {priority.primaryCta.label}
            </button>
          ) : priority.primaryCta.action.type === "link" ? (
            <Link
              href={priority.primaryCta.action.href}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--copilot-accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              {priority.primaryCta.label}
            </Link>
          ) : null}
          {priority.secondaryCta ? (
            <Link
              href={priority.secondaryCta.href}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-3 py-2 text-xs font-semibold text-[var(--copilot-ink)] hover:bg-[var(--copilot-panel-bg)]"
            >
              {priority.secondaryCta.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
