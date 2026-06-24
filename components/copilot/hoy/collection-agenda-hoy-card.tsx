"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, ArrowRight } from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  buildCollectionAgenda,
  type CollectionAgenda,
} from "@/lib/collection/build-collection-agenda";
import type { CollectionAction } from "@/lib/copilot-collection-types";

// ─── Status helpers ───────────────────────────────────────────────────────────

type AgendaStatus = "critical" | "attention" | "normal" | "empty";

function deriveStatus(agenda: CollectionAgenda): AgendaStatus {
  if (
    agenda.summary.overdueFollowupsCount > 0 ||
    agenda.summary.overduePromisesCount > 0
  ) {
    return "critical";
  }
  if (agenda.summary.dueTodayCount > 0) {
    return "attention";
  }
  if (agenda.summary.upcomingCount > 0 || agenda.upcomingPromises.length > 0) {
    return "normal";
  }
  return "empty";
}

// Patrón premium: card neutra + borde acentuado por estado, sin teñir todo el fondo.
const STATUS_STYLES: Record<AgendaStatus, { border: string; bg: string; badge: string; badgeText: string }> = {
  critical: {
    border: "border-[var(--copilot-danger-border)]",
    bg: "bg-[var(--copilot-card-bg)]",
    badge: "bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-danger-text-strong)] ring-1 ring-[var(--copilot-danger-border)]",
    badgeText: "Requiere atención",
  },
  attention: {
    border: "border-[var(--copilot-warning-border)]",
    bg: "bg-[var(--copilot-card-bg)]",
    badge: "bg-[var(--copilot-badge-warning-bg)] text-[var(--copilot-warning-text-strong)] ring-1 ring-[var(--copilot-warning-border)]",
    badgeText: "Seguimiento hoy",
  },
  normal: {
    border: "border-[var(--copilot-border)]",
    bg: "bg-[var(--copilot-card-bg)]",
    badge: "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[var(--copilot-accent-soft)]",
    badgeText: "Al día",
  },
  empty: {
    border: "border-[var(--copilot-border)]",
    bg: "bg-[var(--copilot-card-bg)]/70",
    badge: "",
    badgeText: "",
  },
};

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "warning" | "info" | "neutral";
}) {
  if (value === 0) return null;
  const cls =
    tone === "danger"
      ? "text-[var(--copilot-danger-text)] font-semibold"
      : tone === "warning"
      ? "text-[var(--copilot-warning-text)] font-semibold"
      : tone === "info"
      ? "text-sky-700 font-medium"
      : "text-[var(--copilot-ink-muted)] font-medium";
  return (
    <span className="flex items-baseline gap-1">
      <span className={`text-base tabular-nums ${cls}`}>{value}</span>
      <span className="text-[11px] text-[var(--copilot-ink-muted)]">{label}</span>
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CollectionAgendaHoyCard() {
  const [agenda, setAgenda] = useState<CollectionAgenda | null>(null);
  const [loading, setLoading] = useState(true);

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
        // Partial failure: don't surface error in Hoy — just hide the card
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 px-4 py-3 h-20" />
    );
  }

  if (!agenda) return null;

  const status = deriveStatus(agenda);
  const styles = STATUS_STYLES[status];
  const overdueCount =
    agenda.summary.overdueFollowupsCount + agenda.summary.overduePromisesCount;

  return (
    <div
      className={`rounded-2xl border px-4 py-3.5 shadow-sm ${styles.border} ${styles.bg}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarCheck
            className="h-4 w-4 shrink-0 text-[var(--copilot-accent)]"
            aria-hidden
          />
          <div>
            <p className="text-sm font-semibold text-[var(--copilot-ink)]">
              Agenda de cobranza
            </p>
            <p className="text-[11px] text-[var(--copilot-ink-muted)]">
              Seguimientos y promesas registradas
            </p>
          </div>
        </div>
        {status !== "empty" && styles.badgeText ? (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles.badge}`}>
            {styles.badgeText}
          </span>
        ) : null}
      </div>

      {status === "empty" ? (
        <p className="mt-3 text-xs text-[var(--copilot-ink-muted)]">
          Sin seguimientos de cobranza. Creá uno en Acciones o desde la ficha del cliente.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-baseline gap-4">
          <StatPill label="atrasados" value={overdueCount} tone="danger" />
          <StatPill label="hoy" value={agenda.summary.dueTodayCount} tone="warning" />
          <StatPill label="próximos" value={agenda.summary.upcomingCount} tone="info" />
          <StatPill label="promesas" value={agenda.upcomingPromises.length} tone="neutral" />
          <StatPill label="contactados" value={agenda.summary.recentContactsCount} tone="neutral" />
        </div>
      )}

      <div className="mt-3">
        <Link
          href="/copilot/cobranza#cobranza-agenda"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
        >
          Ver agenda
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
