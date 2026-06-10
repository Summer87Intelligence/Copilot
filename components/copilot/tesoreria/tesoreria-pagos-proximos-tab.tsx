"use client";

import { useMemo, useState } from "react";

import { TreasuryObligationsPanel } from "@/components/copilot/tesoreria/treasury-obligations-panel";
import { TreasuryProgramadosPanel } from "@/components/copilot/tesoreria/treasury-programados-panel";
import { TreasuryRecurringPaymentsPanel } from "@/components/copilot/tesoreria/treasury-recurring-payments-panel";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import { summarizeScheduledOutflows, addDaysYmd } from "@/lib/treasury/treasury-scheduled-payments";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";
import { TESORERIA_FIELD_CLASS, TESORERIA_SELECT_CLASS } from "./tesoreria-ui";

type TypeFilter = "all" | "scheduled" | "recurring";
type StatusFilter = "all" | "pending" | "paid" | "cancelled" | "overdue";
type CurrencyFilter = "all" | TreasuryCurrencyCode;

type Props = {
  workspace: TreasuryWorkspace;
  asOfDate: string;
};

export function TesoreriaPagosProximosTab({ workspace, asOfDate }: Props) {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currency, setCurrency] = useState<CurrencyFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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

  const showScheduled = typeFilter === "all" || typeFilter === "scheduled";
  const showRecurring = typeFilter === "all" || typeFilter === "recurring";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {summaries.map((s) => (
          <div
            key={s.currency}
            className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Próximos 30 días · {s.currency}
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--copilot-ink-muted)]">Egresos</dt>
                <dd className="font-semibold tabular-nums">{formatTreasuryMoney(s.next30Days, s.currency)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--copilot-ink-muted)]">Vencidos</dt>
                <dd className="font-semibold tabular-nums text-rose-700">{formatTreasuryMoney(s.overdue, s.currency)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">Filtros</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Desde</span>
            <input type="date" className={TESORERIA_FIELD_CLASS} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Hasta</span>
            <input type="date" className={TESORERIA_FIELD_CLASS} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label className="block text-sm sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Buscar</span>
            <input
              type="search"
              className={TESORERIA_FIELD_CLASS}
              placeholder="Concepto, proveedor o notas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Moneda</span>
            <select className={TESORERIA_SELECT_CLASS} value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyFilter)}>
              <option value="all">Todas</option>
              <option value="UYU">UYU</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Tipo</span>
            <select className={TESORERIA_SELECT_CLASS} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
              <option value="all">Todos</option>
              <option value="scheduled">Programado</option>
              <option value="recurring">Recurrente</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Estado</span>
            <select className={TESORERIA_SELECT_CLASS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="all">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="overdue">Vencido</option>
              <option value="paid">Pagado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>
        </div>
      </section>

      {showScheduled ? (
        <TreasuryObligationsPanel
          workspace={workspace}
          asOfDate={asOfDate}
          hideSummary
          hideCreate
          filterSearch={search}
          filterDateFrom={dateFrom}
          filterDateTo={dateTo}
          filterCurrency={currency}
          filterStatus={statusFilter}
        />
      ) : null}

      {showRecurring ? (
        <TreasuryRecurringPaymentsPanel
          workspace={workspace}
          hideCreate
          filterSearch={search}
          filterCurrency={currency}
        />
      ) : null}

      <TreasuryProgramadosPanel workspace={workspace} asOfDate={asOfDate} historialOnly />
    </div>
  );
}
