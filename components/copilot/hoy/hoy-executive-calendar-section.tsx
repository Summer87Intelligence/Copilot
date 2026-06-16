"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import type { TreasuryScheduledPayment } from "@/lib/treasury/treasury-scheduled-payments";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";
import { formatCopilotDate } from "@/lib/copilot-format";
import { copilotCurrencyClass } from "@/components/copilot/ui/copilot-visual-system";

// ─── Types ─────────────────────────────────────────────────────────────────────

type TabId = "this_month" | "next_month" | "next_90";

type EntryType = "payment" | "promise" | "followup";

type CalendarEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  type: EntryType;
  label: string;
  amount?: number;
  currency?: "UYU" | "USD";
  status?: string;
  href: string;
  count?: number;
};

type DateGroup = {
  date: string;
  entries: CalendarEntry[];
};

// ─── Date helpers ───────────────────────────────────────────────────────────────

function addDaysIso(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function isoYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getMonthBoundaries(today: string) {
  const [y, m] = today.split("-").map(Number);
  return {
    thisMonthStart: `${y}-${String(m).padStart(2, "0")}-01`,
    thisMonthEnd: isoYMD(new Date(Date.UTC(y, m, 0))),
    nextMonthStart: isoYMD(new Date(Date.UTC(y, m, 1))),
    nextMonthEnd: isoYMD(new Date(Date.UTC(y, m + 1, 0))),
  };
}

function periodRange(tab: TabId, today: string): { start: string; end: string } {
  const { thisMonthStart, thisMonthEnd, nextMonthStart, nextMonthEnd } =
    getMonthBoundaries(today);
  if (tab === "this_month") return { start: thisMonthStart, end: thisMonthEnd };
  if (tab === "next_month") return { start: nextMonthStart, end: nextMonthEnd };
  return { start: today, end: addDaysIso(today, 90) };
}

// ─── Data builders ──────────────────────────────────────────────────────────────

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  scheduled: "Pendiente",
  overdue: "Vencido",
  paid: "Pagado",
  cancelled: "Cancelado",
};

function buildPaymentEntries(
  payments: readonly TreasuryScheduledPayment[],
  start: string,
  end: string
): CalendarEntry[] {
  const grouped = new Map<string, CalendarEntry>();

  for (const p of payments) {
    if (p.status === "paid" || p.status === "cancelled") continue;
    if (p.dueDate < start || p.dueDate > end) continue;

    const label = (p.recurringCategoryLabel?.trim() || p.name.trim() || p.category).slice(0, 80);
    const key = `${p.dueDate}|${label}|${p.currency}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.amount = (existing.amount ?? 0) + p.amount;
      existing.count = (existing.count ?? 1) + 1;
    } else {
      grouped.set(key, {
        id: key,
        date: p.dueDate,
        type: "payment",
        label,
        amount: p.amount,
        currency: p.currency,
        status: PAYMENT_STATUS_LABEL[p.status] ?? p.status,
        href: "/copilot/tesoreria?section=obligations",
        count: 1,
      });
    }
  }

  return [...grouped.values()];
}

function latestActiveByCompany(actions: CollectionAction[]): Map<string, CollectionAction> {
  const byCompany = new Map<string, CollectionAction>();
  for (const a of actions) {
    if (a.isActive === false) continue;
    const existing = byCompany.get(a.companyId);
    if (!existing || a.createdAt > existing.createdAt) {
      byCompany.set(a.companyId, a);
    }
  }
  return byCompany;
}

function buildPromiseEntries(
  actions: CollectionAction[],
  start: string,
  end: string,
  clientNames?: Record<string, string>
): CalendarEntry[] {
  const byCompany = latestActiveByCompany(actions);
  const entries: CalendarEntry[] = [];
  for (const [companyId, a] of byCompany) {
    if (a.status !== "promised_payment") continue;
    const date = a.promiseDate;
    if (!date || date < start || date > end) continue;
    entries.push({
      id: `promise|${a.id}|${date}`,
      date,
      type: "promise",
      label: clientNames?.[companyId] ?? "Promesa de pago",
      amount: a.promiseAmount ?? undefined,
      currency: (a.promiseCurrency as "UYU" | "USD") ?? undefined,
      status: "Promesa",
      href: `/copilot/clientes/${companyId}`,
    });
  }
  return entries;
}

function buildFollowupEntries(
  actions: CollectionAction[],
  start: string,
  end: string,
  clientNames?: Record<string, string>
): CalendarEntry[] {
  const byCompany = latestActiveByCompany(actions);
  const entries: CalendarEntry[] = [];
  for (const [companyId, a] of byCompany) {
    if (a.status === "paid") continue;
    const date = a.nextActionDate;
    if (!date || date < start || date > end) continue;
    entries.push({
      id: `followup|${a.id}|${date}`,
      date,
      type: "followup",
      label: clientNames?.[companyId] ?? "Seguimiento",
      status: "Seguimiento",
      href: `/copilot/clientes/${companyId}`,
    });
  }
  return entries;
}

function groupByDate(entries: CalendarEntry[]): DateGroup[] {
  const map = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const existing = map.get(entry.date);
    if (existing) existing.push(entry);
    else map.set(entry.date, [entry]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      entries: items.sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label)),
    }));
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<EntryType, { label: string; cls: string }> = {
  payment: {
    label: "Pago",
    cls: "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]",
  },
  promise: {
    label: "Promesa",
    cls: "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]",
  },
  followup: {
    label: "Seguimiento",
    cls: "bg-[var(--copilot-badge-warning-bg)] text-[var(--copilot-warning-text-strong)]",
  },
};

function TypeBadge({ type }: { type: EntryType }) {
  const { label, cls } = TYPE_BADGE[type];
  return (
    <span className={`inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function CalendarRow({ entry }: { entry: CalendarEntry }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0">
      <TypeBadge type={entry.type} />
      <p className="min-w-0 flex-1 truncate text-sm text-[var(--copilot-ink)]">
        {entry.label}
        {entry.count && entry.count > 1 ? (
          <span className="ml-1 text-[10px] text-[var(--copilot-ink-muted)]">
            {entry.count} pagos
          </span>
        ) : null}
      </p>
      <div className="flex shrink-0 items-center gap-3">
        {entry.amount != null && entry.currency ? (
          <p className={`text-sm font-semibold tabular-nums ${copilotCurrencyClass(entry.currency)}`}>
            {fmtCurrencyAmount(entry.amount, entry.currency)}
          </p>
        ) : null}
        {entry.status ? (
          <p className="hidden text-[11px] text-[var(--copilot-ink-muted)] sm:block">
            {entry.status}
          </p>
        ) : null}
        <Link
          href={entry.href}
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[var(--copilot-accent)] hover:underline"
        >
          Ver
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function DateGroupBlock({ group, today }: { group: DateGroup; today: string }) {
  const isToday = group.date === today;
  const isPast = group.date < today;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <p
          className={`text-[11px] font-bold tabular-nums uppercase tracking-[0.1em] ${
            isToday
              ? "text-[var(--copilot-accent)]"
              : isPast
              ? "text-[var(--copilot-danger-text)]"
              : "text-[var(--copilot-ink-muted)]"
          }`}
        >
          {formatCopilotDate(group.date, "compact")}
          {isToday ? " · Hoy" : isPast ? " · Vencido" : ""}
        </p>
      </div>
      <div className="divide-y divide-[var(--copilot-border)]/60 rounded-lg border border-[var(--copilot-border)]/70 bg-[var(--copilot-soft-bg)]/30 px-3">
        {group.entries.map((entry) => (
          <CalendarRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

// ─── Tab bar ───────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "this_month", label: "Este mes" },
  { id: "next_month", label: "Próximo mes" },
  { id: "next_90", label: "90 días" },
];

function TabBar({
  active,
  onChange,
  counts,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  counts: Record<TabId, number>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Período del calendario"
      className="flex gap-0.5 rounded-lg bg-[var(--copilot-soft-bg)] p-0.5"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition sm:px-3 ${
              isActive
                ? "bg-[var(--copilot-card-bg)] text-[var(--copilot-ink)] shadow-sm"
                : "text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
            }`}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.label.replace("Próximo mes", "Próx. mes")}</span>
            {counts[tab.id] > 0 ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                  isActive
                    ? "bg-[var(--copilot-accent)] text-white"
                    : "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]"
                }`}
              >
                {counts[tab.id]}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function HoyExecutiveCalendarSection({
  payments,
  today,
  clientNames,
}: {
  payments: readonly TreasuryScheduledPayment[];
  today: string;
  clientNames?: Record<string, string>;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("this_month");
  const [collectionActions, setCollectionActions] = useState<CollectionAction[] | null>(null);

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
          setCollectionActions(json.actions);
        }
      } catch {
        // Non-critical: calendar works with payments only
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allEntries = useMemo(() => {
    const tabs: Record<TabId, CalendarEntry[]> = {
      this_month: [],
      next_month: [],
      next_90: [],
    };
    for (const tab of TABS) {
      const { start, end } = periodRange(tab.id, today);
      const paymentEntries = buildPaymentEntries(payments, start, end);
      const promiseEntries = collectionActions
        ? buildPromiseEntries(collectionActions, start, end, clientNames)
        : [];
      const followupEntries = collectionActions
        ? buildFollowupEntries(collectionActions, start, end, clientNames)
        : [];
      tabs[tab.id] = [...paymentEntries, ...promiseEntries, ...followupEntries];
    }
    return tabs;
  }, [payments, today, collectionActions, clientNames]);

  const counts: Record<TabId, number> = {
    this_month: allEntries.this_month.length,
    next_month: allEntries.next_month.length,
    next_90: allEntries.next_90.length,
  };

  const currentEntries = allEntries[activeTab];
  const groups = useMemo(() => groupByDate(currentEntries), [currentEntries]);

  const PREVIEW_GROUPS = 5;
  const visibleGroups = groups.slice(0, PREVIEW_GROUPS);
  const hiddenCount = groups.length - visibleGroups.length;

  return (
    <div className="w-full">
      <CopilotCard>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-[var(--copilot-accent)]" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Agenda ejecutiva</h2>
              <p className="text-[11px] text-[var(--copilot-ink-muted)]">
                Pagos, compromisos y seguimientos por período.
              </p>
            </div>
          </div>
          <Link
            href="/copilot/tesoreria?section=obligations"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
          >
            Ver Tesorería
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <div className="mt-3">
          <TabBar active={activeTab} onChange={setActiveTab} counts={counts} />
        </div>

        {visibleGroups.length === 0 ? (
          <div className="mt-4 py-4 text-center">
            <p className="text-sm text-[var(--copilot-ink-muted)]">
              Sin compromisos en este período.
            </p>
            <Link
              href="/copilot/tesoreria?section=obligations"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
            >
              Agregar pago programado
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {visibleGroups.map((group) => (
              <DateGroupBlock key={group.date} group={group} today={today} />
            ))}
            {hiddenCount > 0 ? (
              <p className="text-[11px] text-[var(--copilot-ink-muted)]">
                +{hiddenCount} fecha{hiddenCount === 1 ? "" : "s"} más. Revisá Tesorería para el detalle completo.
              </p>
            ) : null}
          </div>
        )}
      </CopilotCard>
    </div>
  );
}
