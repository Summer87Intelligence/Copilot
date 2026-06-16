"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";
import { formatCopilotDate } from "@/lib/copilot-format";
import type { TreasuryScheduledPayment } from "@/lib/treasury/treasury-scheduled-payments";
import { copilotCurrencyClass } from "@/components/copilot/ui/copilot-visual-system";

type CommitmentGroup = {
  dueDate: string;
  label: string;
  currency: "UYU" | "USD";
  totalAmount: number;
  count: number;
};

function addDaysIso(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function groupUpcomingCommitments(
  payments: readonly TreasuryScheduledPayment[],
  today: string
): CommitmentGroup[] {
  const end = addDaysIso(today, 30);
  const map = new Map<string, CommitmentGroup>();

  for (const p of payments) {
    if (p.status === "paid" || p.status === "cancelled") continue;
    if (p.dueDate < today || p.dueDate > end) continue;

    const label = (p.recurringCategoryLabel?.trim() || p.name.trim() || p.category).slice(0, 80);
    const key = `${p.dueDate}|${label}|${p.currency}`;
    const existing = map.get(key);
    if (existing) {
      existing.totalAmount += p.amount;
      existing.count += 1;
    } else {
      map.set(key, {
        dueDate: p.dueDate,
        label,
        currency: p.currency,
        totalAmount: p.amount,
        count: 1,
      });
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      a.label.localeCompare(b.label) ||
      a.currency.localeCompare(b.currency)
  );
}

export function HoyUpcomingCommitmentsSection({
  payments,
  today,
}: {
  payments: readonly TreasuryScheduledPayment[];
  today: string;
}) {
  const groups = useMemo(
    () => groupUpcomingCommitments(payments, today),
    [payments, today]
  );

  if (groups.length === 0) {
    return (
      <div id="pagos-proximos" className="scroll-mt-24">
        <CopilotCard>
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
            {HOY_COPY.upcomingCommitmentsTitle}
          </h2>
          <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
            {HOY_COPY.upcomingCommitmentsEmpty}
          </p>
          <Link
            href="/copilot/tesoreria?section=obligations"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
          >
            {HOY_COPY.upcomingCommitmentsCta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </CopilotCard>
      </div>
    );
  }

  const preview = groups.slice(0, 6);

  return (
    <div id="pagos-proximos" className="scroll-mt-24">
      <CopilotCard>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">
            {HOY_COPY.upcomingCommitmentsTitle}
          </h2>
          <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
            {HOY_COPY.upcomingCommitmentsTip}
          </p>
        </div>
        <Link
          href="/copilot/tesoreria?section=obligations"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
        >
          {HOY_COPY.upcomingCommitmentsCta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <ul className="mt-3 divide-y divide-[var(--copilot-border)]/70">
        {preview.map((g) => (
          <li
            key={`${g.dueDate}|${g.label}|${g.currency}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold tabular-nums text-[var(--copilot-ink)]">
                {formatCopilotDate(g.dueDate, "compact")}
              </p>
              <p className="truncate text-sm text-[var(--copilot-ink)]">{g.label}</p>
              {g.count > 1 ? (
                <p className="text-[10px] text-[var(--copilot-ink-muted)]">
                  {g.count} pagos
                </p>
              ) : null}
            </div>
            <p
              className={`shrink-0 text-sm font-semibold tabular-nums ${copilotCurrencyClass(g.currency)}`}
            >
              {fmtCurrencyAmount(g.totalAmount, g.currency)}
            </p>
          </li>
        ))}
      </ul>

      {groups.length > preview.length ? (
        <p className="mt-2 text-[10px] text-[var(--copilot-ink-muted)]">
          +{groups.length - preview.length} compromiso
          {groups.length - preview.length === 1 ? "" : "s"} más en Tesorería.
        </p>
      ) : null}
      </CopilotCard>
    </div>
  );
}
