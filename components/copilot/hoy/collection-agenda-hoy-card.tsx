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

const STATUS_STYLES: Record<AgendaStatus, { border: string; bg: string; badge: string; badgeText: string }> = {
  critical: {
    border: "border-rose-200",
    bg: "bg-rose-50/70",
    badge: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
    badgeText: "Requiere atención",
  },
  attention: {
    border: "border-amber-200",
    bg: "bg-amber-50/60",
    badge: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
    badgeText: "Seguimiento hoy",
  },
  normal: {
    border: "border-[var(--copilot-border)]",
    bg: "bg-white/85",
    badge: "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]",
    badgeText: "Al día",
  },
  empty: {
    border: "border-[var(--copilot-border)]",
    bg: "bg-white/70",
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
      ? "text-rose-700 font-semibold"
      : tone === "warning"
      ? "text-amber-700 font-semibold"
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
      <div className="animate-pulse rounded-2xl border border-[var(--copilot-border)] bg-white/60 px-4 py-3 h-20" />
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
          No hay seguimientos pendientes.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-baseline gap-4">
          <StatPill label="vencidos" value={overdueCount} tone="danger" />
          <StatPill label="hoy" value={agenda.summary.dueTodayCount} tone="warning" />
          <StatPill label="próximos" value={agenda.summary.upcomingCount} tone="info" />
          <StatPill label="promesas" value={agenda.upcomingPromises.length} tone="neutral" />
          <StatPill label="contactados" value={agenda.summary.recentContactsCount} tone="neutral" />
        </div>
      )}

      <div className="mt-3">
        <Link
          href="/copilot/acciones?tab=agenda"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
        >
          Ver agenda
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
