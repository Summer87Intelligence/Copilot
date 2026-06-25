"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, Filter, X } from "lucide-react";

import { TreasuryObligationsPanel } from "@/components/copilot/tesoreria/treasury-obligations-panel";
import { TreasuryProgramadosPanel } from "@/components/copilot/tesoreria/treasury-programados-panel";
import { TreasuryRecurringPaymentsPanel } from "@/components/copilot/tesoreria/treasury-recurring-payments-panel";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import { addDaysYmd, summarizeScheduledOutflows } from "@/lib/treasury/treasury-scheduled-payments";
import { getEndOfCurrentMonth } from "@/lib/copilot-operational-period";
import { isRecurringGeneratedObligation } from "@/lib/treasury/treasury-recurring-payments";
import type { PlannedObligationType, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

// ─── Types ────────────────────────────────────────────────────────────────────

type TypeFilter = "all" | "scheduled" | "recurring";
type StatusFilter = "all" | "pending" | "paid" | "cancelled" | "overdue";
type CurrencyFilter = "all" | TreasuryCurrencyCode;
type CategoryFilter = "all" | PlannedObligationType;
type PeriodPreset = "mes_actual" | "proximo_mes" | "30d" | "90d" | "custom";

const CATEGORY_OPTIONS: { value: PlannedObligationType; label: string }[] = [
  { value: "dgi", label: "DGI" },
  { value: "bps", label: "BPS" },
  { value: "salary", label: "Sueldos" },
  { value: "supplier", label: "Proveedores" },
  { value: "rent", label: "Alquiler" },
  { value: "loan", label: "Préstamos" },
  { value: "service", label: "Servicios" },
  { value: "other", label: "Otros" },
];

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "mes_actual", label: "Este mes" },
  { value: "proximo_mes", label: "Próximo mes" },
  { value: "30d", label: "Próximos 30 días" },
  { value: "90d", label: "Próximos 90 días" },
  { value: "custom", label: "Personalizado" },
];

type Props = {
  workspace: TreasuryWorkspace;
  asOfDate: string;
};

// ─── Period date helper ───────────────────────────────────────────────────────

function getPeriodDates(
  preset: PeriodPreset,
  asOfDate: string,
  customFrom: string,
  customTo: string
): { from: string; to: string } {
  if (preset === "custom") return { from: customFrom, to: customTo };
  const [y, m] = asOfDate.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");

  if (preset === "mes_actual") {
    return {
      from: `${y}-${pad(m)}-01`,
      to: `${y}-${pad(m)}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`,
    };
  }
  if (preset === "proximo_mes") {
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    return {
      from: `${ny}-${pad(nm)}-01`,
      to: `${ny}-${pad(nm)}-${String(new Date(ny, nm, 0).getDate()).padStart(2, "0")}`,
    };
  }
  if (preset === "30d") return { from: asOfDate, to: addDaysYmd(asOfDate, 30) };
  if (preset === "90d") return { from: asOfDate, to: addDaysYmd(asOfDate, 90) };
  return { from: "", to: "" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TesoreriaPagosProximosTab({ workspace, asOfDate }: Props) {
  const [search, setSearch] = useState("");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("30d");
  const [currency, setCurrency] = useState<CurrencyFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const recurringRef = useRef<HTMLDivElement>(null);

  const { from: effectiveDateFrom, to: effectiveDateTo } = getPeriodDates(
    periodPreset,
    asOfDate,
    customDateFrom,
    customDateTo
  );

  // KPI summary cards (fin del mes actual)
  const horizonEnd = getEndOfCurrentMonth();
  const summaries = useMemo(() => {
    const paidObligations = workspace.obligations.filter(
      (o) => effectivePlannedObligationStatus(o.status, o.dueDate, asOfDate) === "paid"
    );
    return summarizeScheduledOutflows(
      [...workspace.overdue, ...workspace.upcoming30, ...paidObligations],
      { asOfDate, horizonEndDate: horizonEnd }
    );
  }, [workspace.overdue, workspace.upcoming30, workspace.obligations, asOfDate, horizonEnd]);

  // Filter summary — count + totals for visible obligations after all filters
  const filteredSummary = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = workspace.obligations.filter((o) => {
      if (o.direction !== "outflow") return false;
      if (effectiveDateFrom && o.dueDate < effectiveDateFrom) return false;
      if (effectiveDateTo && o.dueDate > effectiveDateTo) return false;
      if (currency !== "all" && o.currencyCode !== currency) return false;
      if (categoryFilter !== "all" && o.obligationType !== categoryFilter) return false;
      if (typeFilter === "scheduled" && isRecurringGeneratedObligation(o)) return false;
      if (typeFilter === "recurring" && !isRecurringGeneratedObligation(o)) return false;
      if (statusFilter !== "all") {
        const st = effectivePlannedObligationStatus(o.status, o.dueDate, asOfDate);
        if (statusFilter === "pending" && !["planned", "confirmed"].includes(st)) return false;
        if (statusFilter === "overdue" && st !== "overdue") return false;
        if (statusFilter === "paid" && st !== "paid") return false;
        if (statusFilter === "cancelled" && st !== "cancelled") return false;
      }
      if (q && !o.title.toLowerCase().includes(q) && !(o.notes ?? "").toLowerCase().includes(q))
        return false;
      return true;
    });
    const totals: Partial<Record<TreasuryCurrencyCode, number>> = {};
    for (const o of items) {
      totals[o.currencyCode] = (totals[o.currencyCode] ?? 0) + o.amountEstimated;
    }
    return { count: items.length, totals };
  }, [
    workspace.obligations,
    effectiveDateFrom,
    effectiveDateTo,
    currency,
    categoryFilter,
    typeFilter,
    statusFilter,
    search,
    asOfDate,
  ]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    currency !== "all" ||
    categoryFilter !== "all" ||
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    periodPreset !== "30d";

  const activeFiltersCount = [
    search.trim() ? 1 : 0,
    currency !== "all" ? 1 : 0,
    categoryFilter !== "all" ? 1 : 0,
    typeFilter !== "all" ? 1 : 0,
    statusFilter !== "all" ? 1 : 0,
    periodPreset !== "30d" ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  function clearFilters() {
    setSearch("");
    setCustomDateFrom("");
    setCustomDateTo("");
    setPeriodPreset("30d");
    setCurrency("all");
    setCategoryFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
  }

  // "Ver regla" from obligations panel → scroll to recurring templates section
  function handleViewTemplate(_templateId: string) {
    if (typeFilter !== "all") setTypeFilter("all");
    setTimeout(() => {
      recurringRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  // Type filter drives which panel variant to show
  const filterTypeForPanel =
    typeFilter === "scheduled" ? "non_recurring" : typeFilter === "recurring" ? "recurring" : undefined;
  const showRecurringTemplates = typeFilter === "all";

  const inputCls =
    "h-8 w-full rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2 text-xs text-[var(--copilot-ink)] placeholder:text-[var(--copilot-ink-muted)] focus:border-[var(--copilot-accent)] focus:outline-none";

  return (
    <div className="space-y-6">
      {/* KPI summary cards */}
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
                <dd className="font-semibold tabular-nums">
                  {formatTreasuryMoney(s.scheduledTotal, s.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--copilot-ink-muted)]">Atrasados</dt>
                <dd className="font-semibold tabular-nums text-[var(--copilot-danger-text)]">
                  {formatTreasuryMoney(s.overdue, s.currency)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      {/* Filter section */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
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

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)] hover:text-[var(--copilot-ink)]"
            >
              <X className="h-3 w-3" />
              Limpiar filtros
            </button>
          ) : null}
        </div>

        {filtersOpen ? (
          <div className="space-y-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)]/40 p-3">
            {/* Period preset chips */}
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriodPreset(value)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                    periodPreset === value
                      ? "bg-[var(--copilot-accent)] text-[var(--copilot-on-accent)]"
                      : "border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom date range (only when preset = custom) */}
            {periodPreset === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  aria-label="Desde"
                  className={inputCls}
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                />
                <input
                  type="date"
                  aria-label="Hasta"
                  className={inputCls}
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                />
              </div>
            ) : null}

            {/* Main filter row */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <input
                type="search"
                aria-label="Buscar"
                placeholder="Buscar concepto…"
                className={`${inputCls} col-span-2 sm:col-span-1`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Categoría"
                className={inputCls}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
              >
                <option value="all">Categoría · Todas</option>
                {CATEGORY_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
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
                aria-label="Estado"
                className={inputCls}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="all">Estado · Todos</option>
                <option value="pending">Pendiente</option>
                <option value="overdue">Atrasado</option>
                <option value="paid">Pagado</option>
                <option value="cancelled">Cancelado</option>
              </select>
              <select
                aria-label="Tipo"
                className={inputCls}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              >
                <option value="all">Tipo · Todos</option>
                <option value="scheduled">Pago puntual</option>
                <option value="recurring">Recurrente generado</option>
              </select>
            </div>
          </div>
        ) : null}

        {/* Filter summary */}
        {hasActiveFilters && !workspace.loading ? (
          <p className="text-xs text-[var(--copilot-ink-muted)]">
            {filteredSummary.count}{" "}
            {filteredSummary.count === 1 ? "obligación encontrada" : "obligaciones encontradas"}
            {(Object.entries(filteredSummary.totals) as [TreasuryCurrencyCode, number][]).map(
              ([cur, total]) => (
                <span key={cur}>
                  {" · "}
                  <span className="font-medium text-[var(--copilot-ink)]">
                    {formatTreasuryMoney(total, cur)} {cur}
                  </span>
                </span>
              )
            )}
          </p>
        ) : null}
      </section>

      {/* Obligations panel — always visible, filterType narrows the dataset */}
      <TreasuryObligationsPanel
        workspace={workspace}
        asOfDate={asOfDate}
        hideSummary
        hideCreate
        filterSearch={search}
        filterDateFrom={effectiveDateFrom}
        filterDateTo={effectiveDateTo}
        filterCurrency={currency}
        filterStatus={statusFilter}
        filterCategory={categoryFilter !== "all" ? categoryFilter : undefined}
        filterType={filterTypeForPanel}
        onViewTemplate={handleViewTemplate}
      />

      {/* Recurring templates panel — hidden when user filters by type */}
      {showRecurringTemplates ? (
        <div ref={recurringRef}>
          <TreasuryRecurringPaymentsPanel
            workspace={workspace}
            hideCreate
            filterSearch={search}
            filterCurrency={currency}
          />
        </div>
      ) : null}

      <TreasuryProgramadosPanel workspace={workspace} asOfDate={asOfDate} historialOnly />
    </div>
  );
}
