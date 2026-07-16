"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingBag, Users, Briefcase, Settings, Lightbulb } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { FinancialMetricCard } from "@/components/copilot/ui/financial-metric-card";
import { EmptyState } from "@/components/copilot/ui/empty-state";
import { SkeletonMetricGrid } from "@/components/copilot/ui/skeleton";
import {
  COPILOT_PAGE_GAP,
  copilotCardStandardClass,
  copilotSectionTitleClass,
  copilotCaptionClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type { SalesOverview } from "@/lib/sales/sales-api";
import type { SalesPeriodPreset, SalesComparisonMode } from "@/lib/sales/sales-period";
import {
  formatPct,
  formatUyuOrDash,
  formatUsdOrDash,
  formatUyu,
  formatUsd,
} from "@/components/copilot/ventas/ventas-format";
import { VentasProductosTab } from "@/components/copilot/ventas/ventas-productos-tab";
import { VentasClientesTab } from "@/components/copilot/ventas/ventas-clientes-tab";
import { VentasComparativoTab } from "@/components/copilot/ventas/ventas-comparativo-tab";
import { VentasDetalleTab } from "@/components/copilot/ventas/ventas-detalle-tab";
import { VentasComercialesTab } from "@/components/copilot/ventas/ventas-comerciales-tab";

type TabKey = "resumen" | "servicios" | "detalle" | "clientes" | "comparativo" | "comerciales";

const PERIOD_OPTIONS: { value: SalesPeriodPreset; label: string }[] = [
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes anterior" },
  { value: "last_3_months", label: "Últimos 3 meses" },
  { value: "last_6_months", label: "Últimos 6 meses" },
  { value: "year", label: "Año actual" },
];

const COMPARISON_LABEL: Record<SalesComparisonMode, string> = {
  previous_period: "período anterior equivalente",
  previous_month: "mes anterior completo",
  same_elapsed_days: "mismo tramo del mes anterior",
  custom: "período personalizado",
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "servicios", label: "Servicios" },
  { key: "detalle", label: "Detalle" },
  { key: "clientes", label: "Clientes" },
  { key: "comparativo", label: "Comparativo" },
  { key: "comerciales", label: "Comerciales" },
];

export function VentasPageClient({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<TabKey>("resumen");
  const [preset, setPreset] = useState<SalesPeriodPreset>("this_month");
  const [comparison] = useState<SalesComparisonMode>("same_elapsed_days");

  const [overview, setOverview] = useState<SalesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("preset", preset);
    p.set("comparison", comparison);
    return p.toString();
  }, [preset, comparison]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/copilot/sales/overview?${queryString}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.message ?? "No pudimos cargar los datos de ventas.");
        setOverview(null);
        return;
      }
      setOverview(json.data as SalesOverview);
    } catch {
      setError("No pudimos cargar los datos de ventas.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  /** Refresh silencioso (p.ej. tras asignar comercial) sin skeleton completo. */
  const refreshOverviewQuiet = useCallback(async () => {
    try {
      const res = await fetch(`/api/copilot/sales/overview?${queryString}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.ok) setOverview(json.data as SalesOverview);
    } catch {
      /* no interrumpir el flujo de asignación */
    }
  }, [queryString]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        eyebrow="Comercial"
        title="Ventas"
        description="Qué servicios vendimos, a cuántos clientes y cómo se compara cada mes."
        right={
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Período
              </span>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value as SalesPeriodPreset)}
                className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)] shadow-sm outline-none focus:border-[var(--copilot-accent)]"
                aria-label="Seleccionar período"
              >
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {isAdmin ? (
              <Link
                href="/copilot/ventas/configuracion"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--copilot-border-strong)] px-3 text-sm font-semibold text-[var(--copilot-ink)] hover:bg-[var(--copilot-hover-bg)]"
              >
                <Settings className="h-4 w-4" aria-hidden />
                Configuración comercial
              </Link>
            ) : null}
          </div>
        }
      />

      <div
        role="tablist"
        aria-label="Secciones de Ventas"
        className="flex gap-1 overflow-x-auto border-b border-[var(--copilot-border)] px-1"
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition ${
                active
                  ? "border-[var(--copilot-accent)] text-[var(--copilot-ink)]"
                  : "border-transparent text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {tab === "resumen" ? (
          <ResumenTab
            overview={overview}
            loading={loading}
            error={error}
            comparisonMode={comparison}
            onRetry={loadOverview}
          />
        ) : null}
        {tab === "servicios" ? (
          <TabFrame overview={overview} loading={loading} error={error} onRetry={loadOverview}>
            {(ov) => <VentasProductosTab overview={ov} queryString={queryString} />}
          </TabFrame>
        ) : null}
        {tab === "clientes" ? (
          <TabFrame overview={overview} loading={loading} error={error} onRetry={loadOverview}>
            {(ov) => <VentasClientesTab overview={ov} queryString={queryString} />}
          </TabFrame>
        ) : null}
        {tab === "comparativo" ? (
          <TabFrame overview={overview} loading={loading} error={error} onRetry={loadOverview}>
            {(ov) => (
              <VentasComparativoTab
                overview={ov}
                comparisonLabel={COMPARISON_LABEL[comparison]}
                queryString={queryString}
              />
            )}
          </TabFrame>
        ) : null}
        {tab === "comerciales" ? (
          <TabFrame overview={overview} loading={loading} error={error} onRetry={loadOverview}>
            {(ov) => <VentasComercialesTab overview={ov} queryString={queryString} />}
          </TabFrame>
        ) : null}
        {tab === "detalle" ? (
          <VentasDetalleTab preset={preset} canAssign={isAdmin} onAssignmentChange={refreshOverviewQuiet} />
        ) : null}
      </div>
    </div>
  );
}

function TabFrame({
  overview,
  loading,
  error,
  onRetry,
  children,
}: {
  overview: SalesOverview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: (ov: SalesOverview) => React.ReactNode;
}) {
  if (loading && !overview) return <SkeletonMetricGrid count={4} />;
  if (error) return <SalesErrorState onRetry={onRetry} message={error} />;
  if (!overview) return null;
  return <>{children(overview)}</>;
}

export function SalesErrorState({ onRetry, message }: { onRetry: () => void; message: string }) {
  return (
    <EmptyState
      icon={<ShoppingBag className="h-6 w-6" />}
      title={message}
      description="Puede ser un problema temporal de datos o de conexión."
      action={
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-[var(--copilot-border-strong)] px-3 py-1.5 text-sm font-semibold text-[var(--copilot-ink)] hover:bg-[var(--copilot-hover-bg)]"
        >
          Reintentar
        </button>
      }
    />
  );
}

function ResumenTab({
  overview,
  loading,
  error,
  comparisonMode,
  onRetry,
}: {
  overview: SalesOverview | null;
  loading: boolean;
  error: string | null;
  comparisonMode: SalesComparisonMode;
  onRetry: () => void;
}) {
  if (loading && !overview) return <SkeletonMetricGrid count={8} />;
  if (error) return <SalesErrorState onRetry={onRetry} message={error} />;
  if (!overview) return null;

  const s = overview.snapshot;
  const cmp = overview.comparison;
  const h = overview.highlights;
  const noSales = s.invoiceCount === 0 && s.creditNoteCount === 0;

  if (noSales) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-6 w-6" />}
        title="No hay ventas para este período."
        description="Cambiá el período o esperá a la próxima sincronización de comprobantes."
      />
    );
  }

  const topServices = overview.products.filter((p) => p.normalizationStatus !== "missing_detail").slice(0, 5);
  const topCustomers = overview.customers.slice(0, 5);
  const customerCount = s.newCustomers + s.recurringCustomers;

  return (
    <div className="space-y-4">
      {overview.insights.length > 0 ? (
        <section className={copilotCardStandardClass}>
          <h2 className={`${copilotSectionTitleClass} flex items-center gap-2`}>
            <Lightbulb className="h-4 w-4" aria-hidden />
            Lo más importante del período
          </h2>
          <ul className="mt-3 flex flex-col gap-2" aria-live="polite">
            {overview.insights.map((ins) => (
              <li key={ins.id} className="flex items-start gap-2 text-sm">
                <span
                  aria-hidden
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    ins.tone === "positive"
                      ? "bg-[var(--copilot-success-text-strong)]"
                      : ins.tone === "warning"
                        ? "bg-[var(--copilot-warning-text-strong)]"
                        : "bg-[var(--copilot-ink-muted)]"
                  }`}
                />
                <span className="text-[var(--copilot-ink)]">{ins.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className={copilotCaptionClass}>
        Comparación contra {COMPARISON_LABEL[comparisonMode]} ({overview.comparisonWindow.from} →{" "}
        {overview.comparisonWindow.to}).
      </p>

      {/* Fila principal */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FinancialMetricCard
          label="Ventas emitidas UYU"
          value={{
            primary: formatUyu(s.salesEmitted.UYU),
            secondary: formatPct(cmp.salesPctByCurrency.UYU),
          }}
          hint="Suma de comprobantes de venta válidos en UYU (sin notas de crédito)."
        />
        <FinancialMetricCard
          label="Ventas emitidas USD"
          value={{
            primary: formatUsd(s.salesEmitted.USD),
            secondary: formatPct(cmp.salesPctByCurrency.USD),
          }}
          hint="Suma de comprobantes de venta válidos en USD (sin notas de crédito)."
        />
        <FinancialMetricCard
          label="Facturas emitidas"
          value={{ primary: String(s.invoiceCount), secondary: `${cmp.invoiceDelta >= 0 ? "+" : ""}${cmp.invoiceDelta} vs ant.` }}
          hint="Cantidad de comprobantes de venta válidos del período."
        />
        <FinancialMetricCard
          label="Clientes del período"
          value={{ primary: String(customerCount) }}
          hint="Clientes distintos con al menos una venta válida en el período."
        />
      </div>

      {/* Fila secundaria */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FinancialMetricCard
          label="Ticket promedio UYU"
          value={{ primary: formatUyuOrDash(s.averageTicket.UYU) }}
          hint="Facturación UYU / facturas UYU del período."
        />
        <FinancialMetricCard
          label="Ticket promedio USD"
          value={{ primary: formatUsdOrDash(s.averageTicket.USD) }}
          hint="Facturación USD / facturas USD del período."
        />
        <FinancialMetricCard
          label="Clientes nuevos"
          value={{ primary: String(s.newCustomers) }}
          hint="Primera venta válida dentro del período."
        />
        <FinancialMetricCard
          label="Clientes recurrentes"
          value={{ primary: String(s.recurringCustomers) }}
          hint="Clientes con venta previa al período y también en el período."
        />
      </div>

      {s.creditNoteCount > 0 ? (
        <p className={copilotCaptionClass}>
          Notas de crédito en el período: {s.creditNoteCount} ({formatUyuOrDash(s.creditNotes.UYU)} ·{" "}
          {formatUsdOrDash(s.creditNotes.USD)}). No se restan de ventas emitidas.
        </p>
      ) : null}

      {/* Información comercial destacada */}
      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Información comercial destacada</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <Highlight
            label="Servicio más vendido (facturas)"
            value={h?.topServiceByInvoices?.productName ?? "—"}
          />
          <Highlight
            label="Mayor facturación UYU"
            value={
              h?.topServiceByUyu
                ? `${h.topServiceByUyu.productName} · ${formatUyu(h.topServiceByUyu.totalByCurrency.UYU)}`
                : "—"
            }
          />
          <Highlight
            label="Mayor facturación USD"
            value={
              h?.topServiceByUsd && h.topServiceByUsd.totalByCurrency.USD > 0
                ? `${h.topServiceByUsd.productName} · ${formatUsd(h.topServiceByUsd.totalByCurrency.USD)}`
                : "—"
            }
          />
          <Highlight
            label="Comercial con mayor facturación"
            value={h?.topSalesperson?.salespersonName ?? "Sin asignaciones"}
          />
          <Highlight
            label="Variación vs período anterior"
            value={`UYU ${formatPct(cmp.salesPctByCurrency.UYU)} · USD ${formatPct(cmp.salesPctByCurrency.USD)}`}
          />
          {h && h.unassignedInvoicesSinceJuly > 0 ? (
            <Highlight
              label="Facturas sin comercial (desde jul-26)"
              value={String(h.unassignedInvoicesSinceJuly)}
            />
          ) : null}
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <MiniList
          title="Servicios que más facturaron"
          icon={<Briefcase className="h-4 w-4" aria-hidden />}
          empty="Sin servicios en el período."
          rows={topServices.map((p) => ({
            key: p.key,
            name: p.productName,
            right: `${formatUyuOrDash(p.totalByCurrency.UYU)} · ${formatUsdOrDash(p.totalByCurrency.USD)}`,
            sub: `${p.invoiceCount} facturas · ${p.customerCount} clientes`,
          }))}
        />
        <MiniList
          title="Clientes principales"
          icon={<Users className="h-4 w-4" aria-hidden />}
          empty="Sin clientes en el período."
          rows={topCustomers.map((c) => ({
            key: c.customerId ?? c.customerName,
            name: c.customerName,
            right: `${formatUyuOrDash(c.salesByCurrency.UYU)} · ${formatUsdOrDash(c.salesByCurrency.USD)}`,
            sub: `${c.invoiceCount} facturas · ${c.type === "new" ? "Nuevo" : "Recurrente"}`,
          }))}
        />
      </div>
    </div>
  );
}

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--copilot-border)] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[var(--copilot-ink)]">{value}</dd>
    </div>
  );
}

function MiniList({
  title,
  icon,
  rows,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { key: string; name: string; right: string; sub: string }[];
  empty: string;
}) {
  return (
    <section className={copilotCardStandardClass}>
      <h2 className={`${copilotSectionTitleClass} flex items-center gap-2`}>
        {icon}
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className={`${copilotCaptionClass} mt-3`}>{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex items-center justify-between gap-3 border-b border-[var(--copilot-border)] pb-2 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{r.name}</p>
                <p className="text-xs text-[var(--copilot-ink-muted)]">{r.sub}</p>
              </div>
              <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--copilot-ink)]">
                {r.right}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
