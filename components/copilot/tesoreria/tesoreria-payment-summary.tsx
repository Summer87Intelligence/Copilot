"use client";

import { useMemo } from "react";

import { premiumCardClass } from "@/components/copilot/ui/copilot-visual-system";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import { addDaysYmd, summarizeScheduledOutflows } from "@/lib/treasury/treasury-scheduled-payments";

type Props = {
  workspace: TreasuryWorkspace;
  asOfDate: string;
};

export function TesoreriaPaymentSummary({ workspace, asOfDate }: Props) {
  const horizonEnd = addDaysYmd(asOfDate, 30);
  const summaries = useMemo(() => {
    const paidObligations = workspace.obligations.filter(
      (o) => effectivePlannedObligationStatus(o.status, o.dueDate, asOfDate) === "paid"
    );
    return summarizeScheduledOutflows(
      [...workspace.overdue, ...workspace.upcoming30, ...paidObligations],
      { asOfDate, horizonEndDate: horizonEnd }
    );
  }, [workspace.overdue, workspace.upcoming30, workspace.obligations, asOfDate, horizonEnd]);

  if (summaries.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">Resumen de pagos</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {summaries.map((s) => (
          <div key={s.currency} className={`${premiumCardClass} p-5`}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
              {s.currency}
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--copilot-ink-muted)]">Pagos próximos 30 días</dt>
                <dd className="font-semibold tabular-nums text-[var(--copilot-ink)]">
                  {formatTreasuryMoney(s.next30Days, s.currency)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--copilot-ink-muted)]">Vencidos</dt>
                <dd className="font-semibold tabular-nums text-rose-700">
                  {formatTreasuryMoney(s.overdue, s.currency)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[var(--copilot-ink-muted)]">Pagados del período</dt>
                <dd className="font-semibold tabular-nums text-emerald-700">
                  {formatTreasuryMoney(s.paidInPeriod, s.currency)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
