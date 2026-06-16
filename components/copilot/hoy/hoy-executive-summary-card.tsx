"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { CopilotButton, CopilotButtonLink } from "@/components/copilot/ui/copilot-button";

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
};

function primaryCtaVariant(status: PulseStatus): "primary" | "danger" {
  return status === "critical" ? "danger" : "primary";
}

// Card de "Resumen del día" premium: fondo neutro siempre.
// El estado se transmite con: dot semáforo + badge + borde sutil acentuado.
const STATUS_CONFIG: Record<PulseStatus, StatusConfig> = {
  healthy: {
    dot: "bg-[var(--copilot-status-ok-dot)]",
    badge: "Al día",
    badgeClass:
      "bg-[var(--copilot-badge-success-bg)] text-[var(--copilot-badge-success-text)] ring-1 ring-[var(--copilot-border)]",
    cardBg: "from-[var(--copilot-card-bg)] to-[var(--copilot-card-bg)]",
    cardBorder: "border-[var(--copilot-border)]",
  },
  attention: {
    dot: "bg-[var(--copilot-status-warn-dot)]",
    badge: "Requiere atención",
    badgeClass:
      "bg-[var(--copilot-badge-warning-bg)] text-[var(--copilot-badge-warning-text)] ring-1 ring-[var(--copilot-border)]",
    cardBg: "from-[var(--copilot-card-bg)] to-[var(--copilot-card-bg)]",
    cardBorder: "border-[var(--copilot-border)]",
  },
  critical: {
    dot: "bg-[var(--copilot-status-critical-dot)]",
    badge: "Atención crítica",
    badgeClass:
      "bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-badge-danger-text)] ring-1 ring-[var(--copilot-border)]",
    cardBg: "from-[var(--copilot-card-bg)] to-[var(--copilot-card-bg)]",
    cardBorder: "border-[var(--copilot-border)]",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function HoyExecutiveSummaryCard({
  hero,
  attentionClientsCount,
  debtorClientsCount,
  cashAfterPaymentsCritical,
  onScrollToCriticalClients,
  onScrollToUpcomingPayments,
}: {
  hero: CockpitHero;
  attentionClientsCount: number;
  /** Total de clientes con cualquier deuda activa (incluye al día). */
  debtorClientsCount: number;
  cashAfterPaymentsCritical: boolean;
  onScrollToCriticalClients?: () => void;
  onScrollToUpcomingPayments?: () => void;
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
      debtorClientsCount,
      agendaOverdueCount:
        (agenda?.summary.overdueFollowupsCount ?? 0) +
        (agenda?.summary.overduePromisesCount ?? 0),
      agendaDueTodayCount: agenda?.summary.dueTodayCount ?? 0,
      cashAfterPaymentsCritical,
    });
  }, [agendaLoaded, attentionClientsCount, debtorClientsCount, agenda, cashAfterPaymentsCritical]);

  const [showSignals, setShowSignals] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSignals) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowSignals(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSignals]);

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
      className={`rounded-xl border bg-[var(--copilot-card-bg)] px-3 py-2 shadow-sm ${cfg.cardBorder}`}
    >
      {/* ── Eyebrow ── */}
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
        Resumen del día
      </p>

      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-2">
        {/* Left: status badge (clickable) + headline + description + metrics + priorities */}
        <div className="min-w-0 flex-1">
          {/* Status indicator — clickable, shows signals popover */}
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setShowSignals((v) => !v)}
              className="flex items-center gap-1.5"
              aria-expanded={showSignals}
              aria-label="Ver señales del estado del negocio"
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot}`} aria-hidden />
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badgeClass}`}>
                {cfg.badge}
                <ChevronDown className={`h-3 w-3 transition-transform ${showSignals ? "rotate-180" : ""}`} aria-hidden />
              </span>
            </button>
            {showSignals ? (
              <div className="absolute left-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-3 shadow-lg">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Señales del sistema</p>
                <ul className="mt-2 space-y-2">
                  {attentionClientsCount > 0 ? (
                    <li className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-[var(--copilot-ink)]">
                        Atrasado — {attentionClientsCount} {attentionClientsCount === 1 ? "cliente" : "clientes"}
                      </span>
                      <CopilotButtonLink
                        href="/copilot/cartera"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSignals(false)}
                        className="shrink-0 !h-auto !px-2 !py-1"
                      >
                        Ver Cartera
                      </CopilotButtonLink>
                    </li>
                  ) : null}
                  {cashAfterPaymentsCritical ? (
                    <li className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-[var(--copilot-ink)]">
                        Cobertura de pagos ajustada
                      </span>
                      <CopilotButtonLink
                        href="/copilot/tesoreria"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSignals(false)}
                        className="shrink-0 !h-auto !px-2 !py-1"
                      >
                        Ver Tesorería
                      </CopilotButtonLink>
                    </li>
                  ) : null}
                  {!attentionClientsCount && !cashAfterPaymentsCritical ? (
                    <li className="text-[12px] text-[var(--copilot-ink-muted)]">Sin alertas críticas activas</li>
                  ) : null}
                </ul>
                {metricsLine ? (
                  <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">{metricsLine}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--copilot-border)] pt-2.5">
                  <CopilotButtonLink href="/copilot/finanzas" variant="ghost" size="sm" onClick={() => setShowSignals(false)}>
                    Ver Finanzas
                  </CopilotButtonLink>
                  <CopilotButtonLink href="/copilot/acciones" variant="ghost" size="sm" onClick={() => setShowSignals(false)}>
                    Ver acciones
                  </CopilotButtonLink>
                </div>
              </div>
            ) : null}
          </div>
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
          <nav
            className="mt-2 flex flex-wrap gap-x-4 gap-y-1"
            aria-label="Atajos ejecutivos"
          >
            {onScrollToCriticalClients ? (
              <button
                type="button"
                onClick={onScrollToCriticalClients}
                className="text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
              >
                Ver clientes con deuda
              </button>
            ) : null}
            {onScrollToUpcomingPayments ? (
              <button
                type="button"
                onClick={onScrollToUpcomingPayments}
                className="text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
              >
                Ver pagos próximos
              </button>
            ) : null}
          </nav>
          {/* Qué resolver hoy — up to 3 executive priorities */}
        </div>

        {/* Right: CTAs */}
        {priority ? (
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-col sm:items-end">
            {primaryIsScroll ? (
              <CopilotButton
                type="button"
                variant={primaryCtaVariant(hero.status)}
                size="sm"
                onClick={onScrollToCriticalClients}
              >
                {priority.primaryCta.label}
              </CopilotButton>
            ) : priority.primaryCta.action.type === "link" ? (
              <CopilotButtonLink
                href={priority.primaryCta.action.href}
                variant={primaryCtaVariant(hero.status)}
                size="sm"
              >
                {priority.primaryCta.label}
              </CopilotButtonLink>
            ) : null}
            {priority.secondaryCta ? (
              <CopilotButtonLink href={priority.secondaryCta.href} variant="secondary" size="sm">
                {priority.secondaryCta.label}
              </CopilotButtonLink>
            ) : null}
          </div>
        ) : (
          // Skeleton while agenda loads
          <div className="flex flex-col items-end gap-2">
            <div className="h-8 w-32 animate-pulse rounded-xl bg-[var(--copilot-soft-bg)]" />
          </div>
        )}
      </div>
    </section>
  );
}
