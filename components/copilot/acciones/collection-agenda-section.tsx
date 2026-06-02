"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, Clock, AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";

import type { CollectionAgenda, CollectionAgendaItem } from "@/lib/collection/build-collection-agenda";
import {
  actionCardClass,
  dangerFinancialCardClass,
  metricValueClass,
  neutralFinancialCardClass,
  softCalloutClass,
  warningFinancialCardClass,
} from "@/components/copilot/ui/copilot-visual-system";

// ─── Filter types ─────────────────────────────────────────────────────────────

type AgendaFilter =
  | "all"
  | "overdue"
  | "today"
  | "upcoming"
  | "promises"
  | "contacts";

const FILTER_LABELS: { id: AgendaFilter; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "overdue", label: "Vencidos" },
  { id: "today", label: "Hoy" },
  { id: "upcoming", label: "Próximos" },
  { id: "promises", label: "Promesas" },
  { id: "contacts", label: "Contactados" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityBadgeCls(severity: CollectionAgendaItem["severity"]): string {
  switch (severity) {
    case "critical":
      return "bg-rose-100 text-rose-800 ring-1 ring-rose-200";
    case "high":
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
    case "medium":
      return "bg-sky-100 text-sky-800 ring-1 ring-sky-200";
    default:
      return "bg-[var(--copilot-accent-soft)] text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)]";
  }
}

function typeBadgeCls(type: CollectionAgendaItem["type"]): {
  bg: string;
  label: string;
} {
  switch (type) {
    case "promise_overdue":
      return { bg: "bg-rose-50 text-rose-700 border-rose-200", label: "Promesa vencida" };
    case "promise_upcoming":
      return { bg: "bg-blue-50 text-blue-700 border-blue-200", label: "Promesa futura" };
    case "followup_overdue":
      return { bg: "bg-rose-50 text-rose-700 border-rose-200", label: "Seguimiento vencido" };
    case "followup_today":
      return { bg: "bg-amber-50 text-amber-700 border-amber-200", label: "Seguimiento hoy" };
    case "followup_upcoming":
      return { bg: "bg-sky-50 text-sky-700 border-sky-200", label: "Próx. seguimiento" };
    case "recent_contact":
      return { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Contactado" };
  }
}

function filterItems(
  agenda: CollectionAgenda,
  filter: AgendaFilter
): CollectionAgendaItem[] {
  switch (filter) {
    case "overdue":
      return [...agenda.overduePromises, ...agenda.overdueFollowups];
    case "today":
      return agenda.dueTodayFollowups;
    case "upcoming":
      return agenda.upcomingFollowups;
    case "promises":
      return [...agenda.overduePromises, ...agenda.upcomingPromises];
    case "contacts":
      return agenda.recentContacts;
    case "all":
    default:
      return [
        ...agenda.overduePromises,
        ...agenda.overdueFollowups,
        ...agenda.dueTodayFollowups,
        ...agenda.upcomingFollowups,
        ...agenda.upcomingPromises,
        ...agenda.recentContacts,
      ];
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AgendaSummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "danger" | "warning" | "info" | "neutral";
}) {
  const cls =
    tone === "danger" && value > 0
      ? dangerFinancialCardClass
      : tone === "warning" && value > 0
      ? warningFinancialCardClass
      : tone === "info" && value > 0
      ? "border-sky-200 bg-gradient-to-br from-white to-sky-50/70"
      : neutralFinancialCardClass;
  const valCls =
    tone === "danger" && value > 0
      ? "text-rose-700"
      : tone === "warning" && value > 0
      ? "text-amber-700"
      : tone === "info" && value > 0
      ? "text-sky-700"
      : "text-[var(--copilot-ink)]";
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      <p className={`mt-1 text-lg ${metricValueClass} ${valCls}`}>{value}</p>
    </div>
  );
}

function AgendaItemCard({
  item,
  onArchived,
}: {
  item: CollectionAgendaItem;
  onArchived: (actionId: string) => void;
}) {
  const { canWrite } = useCopilotPermissions();
  const { bg, label: typeLabel } = typeBadgeCls(item.type);
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const handleArchive = async () => {
    setArchiveError(null);
    setArchiving(true);
    try {
      const res = await copilotApiFetch(
        `/api/copilot/data/collection-actions/${item.actionId}/archive`,
        { method: "POST" }
      );
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (json?.ok) {
        onArchived(item.actionId);
      } else {
        setArchiveError(json?.message ?? "No se pudo cancelar. Intentá de nuevo.");
        setConfirming(false);
      }
    } catch {
      setArchiveError("Error de red al cancelar.");
      setConfirming(false);
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className={`${actionCardClass} px-4 py-3.5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${bg}`}
          >
            {typeLabel}
          </span>
          {item.channelLabel ? (
            <span className="text-[11px] text-[var(--copilot-ink-muted)]">
              {item.channelLabel}
            </span>
          ) : null}
        </div>
        {item.amountLabel ? (
          <span className={`text-sm ${metricValueClass}`}>
            {item.amountLabel}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm font-semibold text-[var(--copilot-ink)]">
        {item.clientName}
      </p>
      <p className="mt-0.5 text-xs text-[var(--copilot-accent)] font-medium">
        {item.dateLabel}
      </p>

      {item.outcomeLabel ? (
        <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
          Resultado: {item.outcomeLabel}
        </p>
      ) : null}

      {item.note ? (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
          {item.note}
        </p>
      ) : null}

      {archiveError ? (
        <p className="mt-2 text-xs text-rose-600">{archiveError}</p>
      ) : null}

      {confirming ? (
        <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2.5">
          <p className="text-xs font-medium text-amber-900">
            Esto quitará este seguimiento de la agenda. No borra la deuda ni modifica facturas.
          </p>
          <div className="mt-2 flex gap-2">
            {canWrite ? (
              <button
                type="button"
                onClick={() => void handleArchive()}
                disabled={archiving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-amber-800"
              >
                {archiving ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                {archiving ? "Cancelando…" : "Sí, cancelar"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-[var(--copilot-border)] bg-white/70 px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-white"
            >
              No
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-nowrap items-center gap-1.5 overflow-x-auto">
          <Link
            href={item.href}
            className="inline-flex shrink-0 items-center rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Ver cliente
          </Link>
          <Link
            href={`${item.href}#gestion-cobranza`}
            className="inline-flex shrink-0 items-center rounded-lg border border-[var(--copilot-border)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-white"
          >
            Gestionar
          </Link>
          {canWrite ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              title="Cancelar seguimiento"
              aria-label="Cancelar seguimiento"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:border-rose-200 hover:bg-rose-50/60 hover:text-rose-700"
            >
              <X className="h-3 w-3" aria-hidden />
              Cancelar
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function EmptyState({ filter }: { filter: AgendaFilter }) {
  const messages: Record<AgendaFilter, string> = {
    all: "No hay seguimientos registrados.",
    overdue: "No hay seguimientos vencidos.",
    today: "No hay seguimientos para hoy.",
    upcoming: "No hay seguimientos próximos.",
    promises: "No hay promesas de pago registradas.",
    contacts: "No hay contactos recientes registrados.",
  };
  return (
    <div className={`${softCalloutClass} px-4 py-6 text-center`}>
      <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" aria-hidden />
      <p className="text-sm font-medium text-[var(--copilot-ink)]">
        {messages[filter]}
      </p>
      <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
        Los seguimientos aparecen cuando registrás gestiones en las fichas de los clientes.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CollectionAgendaSection({
  agenda,
  loading,
}: {
  agenda: CollectionAgenda | null;
  loading: boolean;
}) {
  const [filter, setFilter] = useState<AgendaFilter>("all");
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  const handleArchived = (actionId: string) => {
    setArchivedIds((prev) => new Set([...prev, actionId]));
  };

  const filterItemsActive = (raw: CollectionAgendaItem[]) =>
    raw.filter((i) => !archivedIds.has(i.actionId));

  const items = useMemo(() => {
    if (!agenda) return [];
    return filterItems(agenda, filter).filter((i) => !archivedIds.has(i.actionId));
  }, [agenda, filter, archivedIds]);

  const totalItems = agenda
    ? filterItemsActive([
        ...agenda.overdueFollowups,
        ...agenda.dueTodayFollowups,
        ...agenda.upcomingFollowups,
        ...agenda.overduePromises,
        ...agenda.upcomingPromises,
        ...agenda.recentContacts,
      ]).length
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
          Agenda de cobranza
        </h2>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          Seguimientos, promesas y contactos recientes registrados en las fichas de clientes.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="ml-2 text-sm">Cargando agenda…</span>
        </div>
      ) : agenda === null ? (
        <div className={`${dangerFinancialCardClass} rounded-xl border px-4 py-3 text-sm text-rose-900`}>
          No se pudo cargar la agenda. Intentá actualizar la página.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {totalItems > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <AgendaSummaryCard
                label="Vencidos"
                value={filterItemsActive([...agenda.overdueFollowups, ...agenda.overduePromises]).length}
                tone="danger"
              />
              <AgendaSummaryCard
                label="Hoy"
                value={filterItemsActive(agenda.dueTodayFollowups).length}
                tone="warning"
              />
              <AgendaSummaryCard
                label="Próximos"
                value={filterItemsActive(agenda.upcomingFollowups).length}
                tone="info"
              />
              <AgendaSummaryCard
                label="Promesas"
                value={filterItemsActive(agenda.upcomingPromises).length}
                tone="neutral"
              />
              <AgendaSummaryCard
                label="Contactados"
                value={filterItemsActive(agenda.recentContacts).length}
                tone="neutral"
              />
            </div>
          ) : null}

          {/* Filter pills */}
          {totalItems > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {FILTER_LABELS.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      active
                        ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                        : "bg-white/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
              {filter !== "all" || items.length < totalItems ? (
                <span className="text-[11px] text-[var(--copilot-ink-muted)]">
                  Mostrando {items.length} de {totalItems} seguimientos
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Items */}
          {totalItems === 0 ? (
            <EmptyState filter={filter} />
          ) : items.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <ul className="space-y-2.5">
              {items.map((item) => (
                <li key={`${item.actionId}-${item.type}`}>
                  <AgendaItemCard item={item} onArchived={handleArchived} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
