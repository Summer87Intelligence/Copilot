"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Filter } from "lucide-react";

import { TreasuryObligationsPanel } from "@/components/copilot/tesoreria/treasury-obligations-panel";
import { TreasuryProgramadosPanel } from "@/components/copilot/tesoreria/treasury-programados-panel";
import { TreasuryRecurringPaymentsPanel } from "@/components/copilot/tesoreria/treasury-recurring-payments-panel";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import { summarizeScheduledOutflows, addDaysYmd } from "@/lib/treasury/treasury-scheduled-payments";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

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
  const [filtersOpen, setFiltersOpen] = useState(false);

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
            className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-4 shadow-sm"
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
                <dt className="text-[var(--copilot-ink-muted)]">Atrasados</dt>
                <dd className="font-semibold tabular-nums text-[var(--copilot-danger-text)]">{formatTreasuryMoney(s.overdue, s.currency)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      {(() => {
        const activeFiltersCount =
          (dateFrom ? 1 : 0) +
          (dateTo ? 1 : 0) +
          (search.trim() ? 1 : 0) +
          (currency !== "all" ? 1 : 0) +
          (typeFilter !== "all" ? 1 : 0) +
          (statusFilter !== "all" ? 1 : 0);
        const inputCls =
          "h-8 w-full rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2 text-xs text-[var(--copilot-ink)] placeholder:text-[var(--copilot-ink-muted)] focus:border-[var(--copilot-accent)] focus:outline-none";
        return (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2.5 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-panel-bg)]"
            >
              <Filter className="h-3 w-3" aria-hidden />
              Filtros
              {activeFiltersCount > 0 ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--copilot-accent)] px-1 text-[10px] font-semibold text-[var(--copilot-on-accent)]">
                  {activeFiltersCount}
                </span>
              ) : null}
              <ChevronDown
                className={`h-3 w-3 shrink-0 transition ${filtersOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {filtersOpen ? (
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)]/40 p-2 sm:grid-cols-6">
                <input
                  type="date"
                  aria-label="Desde"
                  className={inputCls}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <input
                  type="date"
                  aria-label="Hasta"
                  className={inputCls}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
                <input
                  type="search"
                  aria-label="Buscar"
                  placeholder="Buscar concepto/proveedor"
                  className={`${inputCls} col-span-2`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="Moneda"
                  className={inputCls}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyFilter)}
                >
                  <option value="all">Moneda · Todas</option>
                  <option value="UYU">UYU</option>
                  <option value="USD">USD</option>
                </select>
                <select
                  aria-label="Tipo"
                  className={inputCls}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                >
                  <option value="all">Tipo · Todos</option>
                  <option value="scheduled">Programado</option>
                  <option value="recurring">Recurrente</option>
                </select>
                <select
                  aria-label="Estado"
                  className={`${inputCls} col-span-2 sm:col-span-1`}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                >
                  <option value="all">Estado · Todos</option>
                  <option value="pending">Pendiente</option>
                  <option value="overdue">Atrasado</option>
                  <option value="paid">Pagado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
            ) : null}
          </section>
        );
      })()}

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
