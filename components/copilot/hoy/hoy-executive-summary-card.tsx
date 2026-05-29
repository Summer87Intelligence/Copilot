"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  buildCollectionAgenda,
  type CollectionAgenda,
} from "@/lib/collection/build-collection-agenda";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import type { CockpitHero } from "@/lib/copilot-hoy-cockpit-view";
import type { PulseStatus } from "@/lib/copilot-today-business-pulse";
import {
  resolveHoyTodayPriority,
  type HoyTodayPriority,
} from "@/lib/copilot-hoy-today-priority";

// ─── Status theme ─────────────────────────────────────────────────────────────

type StatusConfig = {
  dot: string;
  badge: string;
  badgeClass: string;
  cardBg: string;
  cardBorder: string;
  primaryBtn: string;
  secondaryBtn: string;
};

const STATUS_CONFIG: Record<PulseStatus, StatusConfig> = {
  healthy: {
    dot: "bg-emerald-500",
    badge: "Al día",
    badgeClass: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80",
    cardBg: "from-white to-slate-50/40",
    cardBorder: "border-[var(--copilot-border)]",
    primaryBtn: "bg-[var(--copilot-accent)] text-white hover:opacity-90",
    secondaryBtn: "border-[var(--copilot-border)] bg-white/80 text-[var(--copilot-ink)] hover:bg-white",
  },
  attention: {
    dot: "bg-amber-400",
    badge: "Requiere atención",
    badgeClass: "bg-amber-100 text-amber-800 ring-1 ring-amber-200/80",
    cardBg: "from-white to-amber-50/45",
    cardBorder: "border-amber-200/70",
    primaryBtn: "bg-[var(--copilot-accent)] text-white hover:opacity-90",
    secondaryBtn: "border-amber-200/60 bg-white/80 text-[var(--copilot-ink)] hover:bg-white",
  },
  critical: {
    dot: "bg-rose-500",
    badge: "Atención crítica",
    badgeClass: "bg-rose-100 text-rose-800 ring-1 ring-rose-200/80",
    cardBg: "from-white to-rose-50/35",
    cardBorder: "border-rose-200/70",
    primaryBtn: "bg-rose-600 text-white hover:opacity-90",
    secondaryBtn: "border-rose-200/60 bg-white/80 text-[var(--copilot-ink)] hover:bg-white",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function HoyExecutiveSummaryCard({
  hero,
  attentionClientsCount,
  cashAfterPaymentsCritical,
  onScrollToCriticalClients,
}: {
  hero: CockpitHero;
  attentionClientsCount: number;
  cashAfterPaymentsCritical: boolean;
  onScrollToCriticalClients?: () => void;
}) {
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
        // Agenda optional — card still renders with hero data
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
      agendaOverdueCount:
        (agenda?.summary.overdueFollowupsCount ?? 0) +
        (agenda?.summary.overduePromisesCount ?? 0),
      agendaDueTodayCount: agenda?.summary.dueTodayCount ?? 0,
      cashAfterPaymentsCritical,
    });
  }, [agendaLoaded, attentionClientsCount, agenda, cashAfterPaymentsCritical]);

  const cfg = STATUS_CONFIG[hero.status];
  const primaryIsScroll = priority?.primaryCta.action.type === "scroll_critical";

  // Headline: use priority title once loaded, fall back to hero headline
  const headline = priority?.title ?? hero.headline;
  // Description from priority; metrics from hero
  const description = priority?.description ?? null;
  const metricsLine = hero.metricsLine;

  return (
    <section
      aria-label="Resumen del día"
      className={`rounded-2xl border bg-gradient-to-br px-5 py-4 shadow-sm ${cfg.cardBg} ${cfg.cardBorder}`}
    >
      {/* ── Eyebrow ── */}
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--copilot-ink-muted)]">
        Resumen del día
      </p>

      {/* ── Main row: status + headline + CTAs ── */}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        {/* Left: dot + badge + headline + description + metrics */}
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span
            className={`mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot}`}
            aria-hidden
          />
          <div className="min-w-0">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badgeClass}`}
            >
              {cfg.badge}
            </span>
            <p className="mt-1.5 text-[15px] font-semibold leading-snug text-[var(--copilot-ink)] sm:text-base">
              {headline}
            </p>
            {description ? (
              <p className="mt-1 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                {description}
              </p>
            ) : null}
            {metricsLine ? (
              <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                {metricsLine}
              </p>
            ) : null}
          </div>
        </div>

        {/* Right: CTAs */}
        {priority ? (
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-col sm:items-end">
            {primaryIsScroll ? (
              <button
                type="button"
                onClick={onScrollToCriticalClients}
                className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition ${cfg.primaryBtn}`}
              >
                {priority.primaryCta.label}
              </button>
            ) : priority.primaryCta.action.type === "link" ? (
              <Link
                href={priority.primaryCta.action.href}
                className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition ${cfg.primaryBtn}`}
              >
                {priority.primaryCta.label}
              </Link>
            ) : null}
            {priority.secondaryCta ? (
              <Link
                href={priority.secondaryCta.href}
                className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition ${cfg.secondaryBtn}`}
              >
                {priority.secondaryCta.label}
              </Link>
            ) : null}
          </div>
        ) : (
          // Skeleton while agenda loads
          <div className="flex flex-col items-end gap-2">
            <div className="h-8 w-32 animate-pulse rounded-xl bg-[rgba(44,40,37,0.08)]" />
          </div>
        )}
      </div>
    </section>
  );
}
