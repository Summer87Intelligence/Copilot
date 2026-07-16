"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { SkeletonText } from "@/components/copilot/ui/skeleton";
import {
  copilotCardStandardClass,
  copilotSectionTitleClass,
  copilotCaptionClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type { SalesOverview } from "@/lib/sales/sales-api";
import type { ServiceComparisonRow, ServiceComparisonStatus } from "@/lib/sales/canonical/sales-analytics";
import {
  formatUyuOrDash,
  formatUsdOrDash,
  formatPct,
  formatDelta,
  deltaTone,
} from "@/components/copilot/ventas/ventas-format";

type YearlyMonth = {
  month: string;
  label: string;
  salesByCurrency: { UYU: number; USD: number };
  invoiceCount: number;
  customerCount: number;
  avgTicketByCurrency: { UYU: number; USD: number };
  topServiceName: string | null;
  topSalespersonName: string | null;
  vsPrevious: {
    insights: string[];
    invoiceDelta: number;
    customerDelta: number;
    salesPctByCurrency: { UYU: number | null; USD: number | null };
  } | null;
};

const STATUS_LABEL: Record<ServiceComparisonStatus, string> = {
  grew: "Creció",
  dropped: "Bajó",
  new: "Nuevo",
  stable: "Estable",
  no_sales: "Sin ventas",
};

const STATUS_TONE: Record<ServiceComparisonStatus, "positive" | "danger" | "neutral" | "warning"> = {
  grew: "positive",
  dropped: "danger",
  new: "positive",
  stable: "neutral",
  no_sales: "warning",
};

export function VentasComparativoTab({
  overview,
  comparisonLabel,
  queryString,
}: {
  overview: SalesOverview;
  comparisonLabel: string;
  queryString: string;
}) {
  const cur = overview.comparison.current;
  const prev = overview.comparison.previous;
  const cmp = overview.comparison;
  const defaultYear = parseInt(overview.period.to.slice(0, 4), 10);

  const [year, setYear] = useState(defaultYear);
  const [currency, setCurrency] = useState<"all" | "UYU" | "USD">("all");
  const [serviceKey, setServiceKey] = useState("all");
  const [customerId, setCustomerId] = useState("all");
  const [salespersonId, setSalespersonId] = useState("all");
  const [months, setMonths] = useState<YearlyMonth[]>([]);
  const [serviceRows, setServiceRows] = useState<ServiceComparisonRow[]>(
    (overview.serviceComparison as ServiceComparisonRow[] | undefined) ?? []
  );
  const [loadingYear, setLoadingYear] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const y = defaultYear;
    return [y, y - 1].filter((n) => n >= 2026);
  }, [defaultYear]);

  const serviceOptions = useMemo(
    () =>
      overview.products
        .filter((p) => p.normalizationStatus !== "missing_detail")
        .map((p) => ({ key: p.key, name: p.productName })),
    [overview.products]
  );
  const customerOptions = useMemo(
    () =>
      overview.customers
        .filter((c) => c.customerId)
        .map((c) => ({ id: c.customerId!, name: c.customerName })),
    [overview.customers]
  );
  const salespersonOptions = useMemo(
    () =>
      overview.salespersons.map((s) => ({
        id: s.salespersonId ?? "unassigned",
        name: s.salespersonName,
      })),
    [overview.salespersons]
  );

  const loadYearly = useCallback(async () => {
    setLoadingYear(true);
    setYearError(null);
    try {
      const p = new URLSearchParams(queryString);
      p.set("year", String(year));
      if (currency !== "all") p.set("currencies", currency);
      if (serviceKey !== "all") p.set("productIds", serviceKey);
      if (customerId !== "all") p.set("customerIds", customerId);
      if (salespersonId !== "all") p.set("salespersonIds", salespersonId);
      const res = await fetch(`/api/copilot/sales/yearly?${p.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setYearError(json?.message ?? "No pudimos cargar el comparativo anual.");
        return;
      }
      setMonths((json.data?.yearly?.months as YearlyMonth[]) ?? []);
      let rows = (json.data?.serviceComparison as ServiceComparisonRow[]) ?? [];
      if (serviceKey !== "all") rows = rows.filter((r) => r.key === serviceKey);
      if (currency === "UYU") rows = rows.filter((r) => r.salesCurrent.UYU > 0 || r.salesPrevious.UYU > 0);
      if (currency === "USD") rows = rows.filter((r) => r.salesCurrent.USD > 0 || r.salesPrevious.USD > 0);
      setServiceRows(rows);
    } catch {
      setYearError("No pudimos cargar el comparativo anual.");
    } finally {
      setLoadingYear(false);
    }
  }, [queryString, year, currency, serviceKey, customerId, salespersonId]);

  useEffect(() => {
    void loadYearly();
  }, [loadYearly]);

  const filteredMonths = useMemo(() => {
    if (currency === "all") return months;
    return months.map((m) => ({
      ...m,
      salesByCurrency: {
        UYU: currency === "UYU" ? m.salesByCurrency.UYU : 0,
        USD: currency === "USD" ? m.salesByCurrency.USD : 0,
      },
      avgTicketByCurrency: {
        UYU: currency === "UYU" ? m.avgTicketByCurrency.UYU : 0,
        USD: currency === "USD" ? m.avgTicketByCurrency.USD : 0,
      },
    }));
  }, [months, currency]);

  const monthColumns: CopilotResponsiveTableColumn<YearlyMonth>[] = [
    { key: "mes", header: "Mes", className: "text-left", render: (r) => <span className="font-medium">{r.label}</span> },
    {
      key: "uyu",
      header: "Ventas UYU",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => formatUyuOrDash(r.salesByCurrency.UYU),
    },
    {
      key: "usd",
      header: "Ventas USD",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => formatUsdOrDash(r.salesByCurrency.USD),
    },
    {
      key: "inv",
      header: "Facturas",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => String(r.invoiceCount),
    },
    {
      key: "cust",
      header: "Clientes",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => String(r.customerCount),
    },
    {
      key: "tuyu",
      header: "Ticket promedio UYU",
      className: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => formatUyuOrDash(r.avgTicketByCurrency.UYU),
    },
    {
      key: "tusd",
      header: "Ticket promedio USD",
      className: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => formatUsdOrDash(r.avgTicketByCurrency.USD),
    },
    {
      key: "svc",
      header: "Servicio principal",
      className: "text-left",
      cellClassName: "text-xs",
      render: (r) => r.topServiceName ?? "—",
    },
    {
      key: "sp",
      header: "Comercial principal",
      className: "text-left",
      cellClassName: "text-xs",
      render: (r) => r.topSalespersonName ?? "—",
    },
  ];

  const serviceColumns: CopilotResponsiveTableColumn<ServiceComparisonRow>[] = [
    { key: "svc", header: "Servicio", className: "text-left", render: (r) => r.serviceName },
    {
      key: "invC",
      header: "Facturas actual",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => String(r.invoiceCountCurrent),
    },
    {
      key: "invP",
      header: "Facturas anterior",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => String(r.invoiceCountPrevious),
    },
    {
      key: "custC",
      header: "Clientes actual",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => String(r.customerCountCurrent),
    },
    {
      key: "custP",
      header: "Clientes anterior",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => String(r.customerCountPrevious),
    },
    {
      key: "uyu",
      header: "Ventas UYU actual/anterior",
      className: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => `${formatUyuOrDash(r.salesCurrent.UYU)} / ${formatUyuOrDash(r.salesPrevious.UYU)}`,
    },
    {
      key: "usd",
      header: "Ventas USD actual/anterior",
      className: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => `${formatUsdOrDash(r.salesCurrent.USD)} / ${formatUsdOrDash(r.salesPrevious.USD)}`,
    },
    {
      key: "st",
      header: "Estado",
      className: "text-left",
      render: (r) => <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Año</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Año del comparativo"
            className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)]"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Moneda</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as typeof currency)}
            aria-label="Filtrar moneda"
            className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm"
          >
            <option value="all">Todas</option>
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Servicio</span>
          <select
            value={serviceKey}
            onChange={(e) => setServiceKey(e.target.value)}
            aria-label="Filtrar servicio"
            className="h-9 max-w-[200px] rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm"
          >
            <option value="all">Todos</option>
            {serviceOptions.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Cliente</span>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            aria-label="Filtrar cliente"
            className="h-9 max-w-[200px] rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm"
          >
            <option value="all">Todos</option>
            {customerOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Comercial</span>
          <select
            value={salespersonId}
            onChange={(e) => setSalespersonId(e.target.value)}
            aria-label="Filtrar comercial"
            className="h-9 max-w-[180px] rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm"
          >
            <option value="all">Todos</option>
            {salespersonOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={copilotCaptionClass}>
        Período A (actual) {overview.period.from} → {overview.period.to} · Período B ({comparisonLabel}){" "}
        {overview.comparisonWindow.from} → {overview.comparisonWindow.to}. El período se elige arriba en la página.
      </p>

      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Evolución mes a mes · {year}</h2>
        <p className={`${copilotCaptionClass} mt-1`}>UYU y USD separados. Cada mes se compara con el anterior.</p>
        <div className="mt-3">
          {loadingYear && months.length === 0 ? (
            <SkeletonText lines={6} />
          ) : yearError ? (
            <p className="text-sm text-[var(--copilot-danger-text-strong)]">{yearError}</p>
          ) : (
            <CopilotResponsiveTable
              rows={filteredMonths}
              columns={monthColumns}
              getRowKey={(r) => r.month}
              ariaLabel="Ventas mensuales del año"
              minWidth="1040px"
              mobileCard={(r) => (
                <div className="space-y-1">
                  <p className="font-medium text-[var(--copilot-ink)]">{r.label}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatUyuOrDash(r.salesByCurrency.UYU)} · {formatUsdOrDash(r.salesByCurrency.USD)}
                  </p>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                    {r.invoiceCount} facturas · {r.customerCount} clientes
                  </p>
                </div>
              )}
            />
          )}
        </div>

        {months.some((m) => m.vsPrevious?.insights?.length) ? (
          <div className="mt-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Resumen mes contra mes
            </h3>
            {months.map((m) =>
              m.vsPrevious?.insights?.length ? (
                <div key={m.month} className="rounded-lg border border-[var(--copilot-border)] px-3 py-2">
                  <p className="text-sm font-semibold text-[var(--copilot-ink)]">{m.label}</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-[var(--copilot-ink)]">
                    {m.vsPrevious.insights.map((t, i) => (
                      <li key={i}>· {t}</li>
                    ))}
                  </ul>
                </div>
              ) : null
            )}
          </div>
        ) : null}
      </section>

      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Período actual vs anterior</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CompareTile
            label="Facturas"
            current={String(cur.invoiceCount)}
            previous={String(prev.invoiceCount)}
            delta={formatDelta(cmp.invoiceDelta)}
            tone={deltaTone(cmp.invoiceDelta)}
          />
          <CompareTile
            label="Clientes"
            current={String(cur.newCustomers + cur.recurringCustomers)}
            previous={String(prev.newCustomers + prev.recurringCustomers)}
            delta={formatDelta(cmp.customerDelta)}
            tone={deltaTone(cmp.customerDelta)}
          />
          <CompareTile
            label="Var. ventas USD"
            current={formatPct(cmp.salesPctByCurrency.USD)}
            previous={formatUsdOrDash(prev.salesEmitted.USD)}
            delta={formatPct(cmp.salesPctByCurrency.UYU) + " UYU"}
            tone={cmp.salesPctByCurrency.USD === null ? "neutral" : deltaTone(cmp.salesDeltaByCurrency.USD)}
          />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm" aria-label="Facturación por moneda">
            <thead>
              <tr className="border-b border-[var(--copilot-border)] text-[var(--copilot-ink-muted)]">
                <th className="py-2 text-left font-semibold">Moneda</th>
                <th className="py-2 text-right font-semibold">Actual</th>
                <th className="py-2 text-right font-semibold">Anterior</th>
                <th className="py-2 text-right font-semibold">Diferencia</th>
                <th className="py-2 text-right font-semibold">Variación</th>
              </tr>
            </thead>
            <tbody>
              {(["UYU", "USD"] as const).map((c) => {
                const fmt = c === "UYU" ? formatUyuOrDash : formatUsdOrDash;
                return (
                  <tr key={c} className="border-b border-[var(--copilot-border)] last:border-0">
                    <td className="py-2 font-semibold text-[var(--copilot-ink)]">{c}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(cur.salesEmitted[c])}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--copilot-ink-muted)]">
                      {fmt(prev.salesEmitted[c])}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmt(cmp.salesDeltaByCurrency[c])}</td>
                    <td className="py-2 text-right">
                      <StatusBadge
                        tone={cmp.salesPctByCurrency[c] === null ? "neutral" : deltaTone(cmp.salesDeltaByCurrency[c])}
                      >
                        {formatPct(cmp.salesPctByCurrency[c])}
                      </StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Comparación por servicio</h2>
        <p className={`${copilotCaptionClass} mt-1`}>
          Facturas, clientes y facturación del período filtrado frente al anterior equivalente.
        </p>
        <div className="mt-3">
          <CopilotResponsiveTable
            rows={serviceRows.filter((r) => r.status !== "no_sales" || r.invoiceCountPrevious > 0)}
            columns={serviceColumns}
            getRowKey={(r) => r.key}
            ariaLabel="Comparación por servicio"
            minWidth="1040px"
            mobileCard={(r) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{r.serviceName}</p>
                  <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>
                </div>
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  {r.invoiceCountCurrent} vs {r.invoiceCountPrevious} facturas
                </p>
                {r.insights[0] ? <p className="text-xs text-[var(--copilot-ink)]">{r.insights[0]}</p> : null}
              </div>
            )}
          />
        </div>
      </section>
    </div>
  );
}

function CompareTile({
  label,
  current,
  previous,
  delta,
  tone,
}: {
  label: string;
  current: string;
  previous: string;
  delta: string;
  tone: "positive" | "danger" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-[var(--copilot-border)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--copilot-ink)]">{current}</p>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-[var(--copilot-ink-muted)]">Ant. {previous}</span>
        <StatusBadge tone={tone}>{delta}</StatusBadge>
      </div>
    </div>
  );
}
