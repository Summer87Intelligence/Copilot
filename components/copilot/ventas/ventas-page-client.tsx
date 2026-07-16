"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ShoppingBag, Users, Briefcase, Settings, Lightbulb, ExternalLink } from "lucide-react";

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
import { clientFichaHref } from "@/lib/copilot/client-360-href";
import type { SalesOverview } from "@/lib/sales/sales-api";
import type { SalesPeriodPreset, SalesComparisonMode } from "@/lib/sales/sales-period";
import { isValidPeriodPreset } from "@/lib/sales/sales-period";
import {
  formatPct,
  formatUyuOrDash,
  formatUsdOrDash,
  formatUyu,
  formatUsd,
  formatDateShort,
  pairToMetricValues,
} from "@/components/copilot/ventas/ventas-format";
import {
  VentasAnalyticsDrawer,
  DrawerSection,
  DrawerTable,
} from "@/components/copilot/ventas/ventas-analytics-drawer";
import { VentasProductosTab } from "@/components/copilot/ventas/ventas-productos-tab";
import { VentasClientesTab } from "@/components/copilot/ventas/ventas-clientes-tab";
import { VentasComparativoTab } from "@/components/copilot/ventas/ventas-comparativo-tab";
import { VentasDetalleTab } from "@/components/copilot/ventas/ventas-detalle-tab";
import { VentasComercialesTab } from "@/components/copilot/ventas/ventas-comerciales-tab";

type TabKey = "resumen" | "servicios" | "detalle" | "clientes" | "comparativo" | "comerciales";

type PresetOnly = Exclude<SalesPeriodPreset, "custom">;

/** Estado de período unificado (preset · mes con nombre · rango personalizado). */
type PeriodState =
  | { kind: "preset"; preset: PresetOnly }
  | { kind: "month"; year: number; month: number }
  | { kind: "custom"; from: string; to: string };

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const PRESET_OPTIONS: { value: PresetOnly; label: string }[] = [
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

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function periodToParams(period: PeriodState): URLSearchParams {
  const p = new URLSearchParams();
  if (period.kind === "preset") {
    p.set("preset", period.preset);
  } else if (period.kind === "month") {
    p.set("year", String(period.year));
    p.set("month", String(period.month));
  } else {
    p.set("from", period.from);
    p.set("to", period.to);
  }
  return p;
}

function parsePeriodFromParams(sp: URLSearchParams): PeriodState {
  const year = parseInt(sp.get("year") ?? "", 10);
  const month = parseInt(sp.get("month") ?? "", 10);
  if (Number.isFinite(year) && year >= 2020 && Number.isFinite(month) && month >= 1 && month <= 12) {
    return { kind: "month", year, month };
  }
  const from = sp.get("from");
  const to = sp.get("to");
  if (from && to && YMD.test(from) && YMD.test(to)) {
    return { kind: "custom", from, to };
  }
  const preset = sp.get("preset");
  if (isValidPeriodPreset(preset) && preset !== "custom") return { kind: "preset", preset };
  return { kind: "preset", preset: "this_month" };
}

function periodToSelectValue(period: PeriodState): string {
  if (period.kind === "preset") return period.preset;
  if (period.kind === "month") return `month:${period.month}`;
  return "custom";
}

export function VentasPageClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const todayStr = `${currentYear}-${pad2(currentMonth)}-${pad2(now.getDate())}`;
  const monthStartStr = `${currentYear}-${pad2(currentMonth)}-01`;

  const [tab, setTab] = useState<TabKey>("resumen");
  const [period, setPeriod] = useState<PeriodState>(() =>
    parsePeriodFromParams(new URLSearchParams(searchParams?.toString() ?? ""))
  );
  const [comparison] = useState<SalesComparisonMode>("same_elapsed_days");

  const [overview, setOverview] = useState<SalesOverview | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [salespersons, setSalespersons] = useState<{ id: string; displayName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = periodToParams(period);
    p.set("comparison", comparison);
    return p.toString();
  }, [period, comparison]);

  // Mantiene la URL en sincronía con los filtros (deep-link / recarga estable).
  useEffect(() => {
    router.replace(`${pathname}?${queryString}`, { scroll: false });
  }, [queryString, pathname, router]);

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
      setMeta((json.meta as Record<string, unknown> | undefined) ?? null);
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
      if (res.ok && json.ok) {
        setOverview(json.data as SalesOverview);
        setMeta((json.meta as Record<string, unknown> | undefined) ?? null);
      }
    } catch {
      /* no interrumpir el flujo de asignación */
    }
  }, [queryString]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Catálogo de comerciales (una sola vez) para asignación por cliente.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/copilot/sales/salespersons", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && res.ok && json.ok) {
          const list = (json.data as { id: string; displayName: string; active: boolean }[])
            .filter((p) => p.active)
            .map((p) => ({ id: p.id, displayName: p.displayName }));
          setSalespersons(list);
        }
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePeriodSelect = useCallback(
    (value: string) => {
      if (value === "custom") {
        setPeriod((prev) =>
          prev.kind === "custom" ? prev : { kind: "custom", from: monthStartStr, to: todayStr }
        );
      } else if (value.startsWith("month:")) {
        const m = parseInt(value.slice("month:".length), 10);
        if (Number.isFinite(m)) setPeriod({ kind: "month", year: currentYear, month: m });
      } else if (isValidPeriodPreset(value) && value !== "custom") {
        setPeriod({ kind: "preset", preset: value });
      }
    },
    [currentYear, monthStartStr, todayStr]
  );

  const clientAssignmentPending = meta?.clientAssignmentMigrationPending === true;

  const detalleProps =
    period.kind === "preset"
      ? { preset: period.preset }
      : period.kind === "month"
        ? { year: period.year, month: period.month }
        : { from: period.from, to: period.to };

  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        eyebrow="Comercial"
        title="Ventas"
        description="Qué servicios vendimos, a cuántos clientes y cómo se compara cada mes."
        right={
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Período
              </span>
              <select
                value={periodToSelectValue(period)}
                onChange={(e) => handlePeriodSelect(e.target.value)}
                className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)] shadow-sm outline-none focus:border-[var(--copilot-accent)]"
                aria-label="Seleccionar período"
              >
                <optgroup label="Períodos">
                  {PRESET_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={`Meses ${currentYear}`}>
                  {Array.from({ length: currentMonth }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={`month:${m}`}>
                      {MONTH_NAMES[m - 1]} {currentYear}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Personalizado">
                  <option value="custom">Período personalizado…</option>
                </optgroup>
              </select>
            </label>

            {period.kind === "custom" ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Desde
                  </span>
                  <input
                    type="date"
                    value={period.from}
                    max={period.to}
                    onChange={(e) =>
                      setPeriod((prev) =>
                        prev.kind === "custom" ? { ...prev, from: e.target.value || prev.from } : prev
                      )
                    }
                    aria-label="Fecha desde"
                    className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)] shadow-sm outline-none focus:border-[var(--copilot-accent)]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Hasta
                  </span>
                  <input
                    type="date"
                    value={period.to}
                    min={period.from}
                    onChange={(e) =>
                      setPeriod((prev) =>
                        prev.kind === "custom" ? { ...prev, to: e.target.value || prev.to } : prev
                      )
                    }
                    aria-label="Fecha hasta"
                    className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)] shadow-sm outline-none focus:border-[var(--copilot-accent)]"
                  />
                </label>
              </>
            ) : null}

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
            {(ov) => (
              <div className="space-y-3">
                {clientAssignmentPending ? (
                  <p className={copilotCaptionClass}>
                    La asignación de comercial por cliente todavía no está disponible (migración pendiente). Podés ver
                    los datos, pero las asignaciones no se guardarán aún.
                  </p>
                ) : null}
                <VentasClientesTab
                  overview={ov}
                  queryString={queryString}
                  canAssign={isAdmin}
                  onAssignmentChange={refreshOverviewQuiet}
                  salespersons={salespersons}
                />
              </div>
            )}
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
          <VentasDetalleTab {...detalleProps} canAssign={isAdmin} onAssignmentChange={refreshOverviewQuiet} />
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
  const [showNewCustomers, setShowNewCustomers] = useState(false);

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
  const newCustomers = overview.customers.filter((c) => c.type === "new");
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
      <div className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
        <FinancialMetricCard
          label="Ventas netas UYU/USD"
          values={pairToMetricValues(s.netSalesByCurrency)}
          footnote={{
            text: `UYU ${formatPct(cmp.salesPctByCurrency.UYU)} · USD ${formatPct(cmp.salesPctByCurrency.USD)}`,
          }}
          hint="Ventas emitidas menos notas de crédito, por moneda. KPI comercial principal."
        />
        <FinancialMetricCard
          label="Facturas emitidas"
          value={{
            primary: String(s.invoiceCount),
            secondary: `${cmp.invoiceDelta >= 0 ? "+" : ""}${cmp.invoiceDelta} vs ant.`,
          }}
          hint="Cantidad de comprobantes de venta válidos del período."
        />
        <FinancialMetricCard
          label="Clientes del período"
          value={{ primary: String(customerCount) }}
          hint="Clientes distintos con al menos una venta válida en el período."
        />
        <FinancialMetricCard
          label="Clientes nuevos"
          value={{ primary: String(s.newCustomers) }}
          hint="Primera venta válida dentro del período. Tocá para ver el detalle."
          onClick={() => setShowNewCustomers(true)}
          cta={{ label: "Ver clientes nuevos", onClick: () => setShowNewCustomers(true) }}
        />
      </div>

      {/* Fila secundaria */}
      <div className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
        <FinancialMetricCard
          label="Ticket promedio UYU"
          value={{ primary: formatUyuOrDash(s.averageTicket.UYU) }}
          hint="Ventas netas / facturas del período (UYU)."
        />
        <FinancialMetricCard
          label="Ticket promedio USD"
          value={{ primary: formatUsdOrDash(s.averageTicket.USD) }}
          hint="Ventas netas / facturas del período (USD)."
        />
        <FinancialMetricCard
          label="Clientes recurrentes"
          value={{ primary: String(s.recurringCustomers) }}
          hint="Clientes con venta previa al período y también en el período."
        />
        <FinancialMetricCard
          label="Notas de crédito"
          value={{ primary: String(s.creditNoteCount) }}
          footnote={{ text: `${formatUyuOrDash(s.creditNotes.UYU)} · ${formatUsdOrDash(s.creditNotes.USD)}` }}
          hint="Notas de crédito emitidas en el período (UYU · USD)."
        />
      </div>

      {s.creditNoteCount > 0 ? (
        <p className={copilotCaptionClass}>
          Las notas de crédito ya están descontadas de las ventas netas.
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
            label="Mayor venta neta UYU"
            value={
              h?.topServiceByUyu
                ? `${h.topServiceByUyu.productName} · ${formatUyu(h.topServiceByUyu.totalByCurrency.UYU)}`
                : "—"
            }
          />
          <Highlight
            label="Mayor venta neta USD"
            value={
              h?.topServiceByUsd && h.topServiceByUsd.totalByCurrency.USD > 0
                ? `${h.topServiceByUsd.productName} · ${formatUsd(h.topServiceByUsd.totalByCurrency.USD)}`
                : "—"
            }
          />
          <Highlight
            label="Comercial con mayor venta neta"
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
            right: `${formatUyuOrDash(c.netSalesByCurrency.UYU)} · ${formatUsdOrDash(c.netSalesByCurrency.USD)}`,
            sub: `${c.invoiceCount} facturas · ${c.type === "new" ? "Nuevo" : "Recurrente"}`,
          }))}
        />
      </div>

      {showNewCustomers ? (
        <VentasAnalyticsDrawer title="Clientes nuevos del período" onClose={() => setShowNewCustomers(false)}>
          <DrawerSection title={`${newCustomers.length} clientes con su primera compra en el período`}>
            <DrawerTable
              ariaLabel="Clientes nuevos del período"
              headers={[
                { key: "cust", label: "Cliente" },
                { key: "first", label: "Primera compra", align: "right" },
                { key: "inv", label: "Facturas", align: "right" },
                { key: "svc", label: "Servicios", align: "right" },
                { key: "net", label: "Ventas netas UYU/USD", align: "right" },
                { key: "sp", label: "Comercial" },
                { key: "link", label: "Ficha" },
              ]}
              rows={newCustomers.map((c) => ({
                cust: c.customerName,
                first: formatDateShort(c.firstPurchase),
                inv: String(c.invoiceCount),
                svc: String(c.productCount),
                net: `${formatUyuOrDash(c.netSalesByCurrency.UYU)} · ${formatUsdOrDash(c.netSalesByCurrency.USD)}`,
                sp: c.salespersonName ?? "Sin asignar",
                link: c.customerId ? (
                  <a
                    href={clientFichaHref(c.customerId)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
                  >
                    Cliente 360 <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  "—"
                ),
              }))}
            />
          </DrawerSection>
        </VentasAnalyticsDrawer>
      ) : null}
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
