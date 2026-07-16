"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingBag, TriangleAlert, Users, Package } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { FinancialMetricCard } from "@/components/copilot/ui/financial-metric-card";
import { EmptyState } from "@/components/copilot/ui/empty-state";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
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
  pairToMetricValues,
  formatPct,
  formatDelta,
  formatUyu,
  formatUsd,
  formatQuantity,
} from "@/components/copilot/ventas/ventas-format";
import { VentasProductosTab } from "@/components/copilot/ventas/ventas-productos-tab";
import { VentasClientesTab } from "@/components/copilot/ventas/ventas-clientes-tab";
import { VentasComparativoTab } from "@/components/copilot/ventas/ventas-comparativo-tab";
import { VentasDetalleTab } from "@/components/copilot/ventas/ventas-detalle-tab";
import { VentasClasificacionTab } from "@/components/copilot/ventas/ventas-clasificacion-tab";

type TabKey = "resumen" | "productos" | "detalle" | "clientes" | "comparativo" | "clasificacion";

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

const TABS: { key: TabKey; label: string; adminOnly?: boolean }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "productos", label: "Productos" },
  { key: "detalle", label: "Detalle" },
  { key: "clientes", label: "Clientes" },
  { key: "comparativo", label: "Comparativo" },
  { key: "clasificacion", label: "Clasificación", adminOnly: true },
];

export function VentasPageClient({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<TabKey>("resumen");
  const [preset, setPreset] = useState<SalesPeriodPreset>("this_month");
  const [comparison] = useState<SalesComparisonMode>("same_elapsed_days");

  const [overview, setOverview] = useState<SalesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);

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
      setMigrationPending(Boolean(json.meta?.catalogMigrationPending));
    } catch {
      setError("No pudimos cargar los datos de ventas.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        eyebrow="Comercial"
        title="Ventas"
        description="Qué vendimos, cuánto facturamos y cómo se compara con el período anterior."
        right={
          <label className="flex flex-col gap-1 text-right">
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
        }
      />

      {/* Tab navigation */}
      <div
        role="tablist"
        aria-label="Secciones de Ventas"
        className="flex gap-1 overflow-x-auto border-b border-[var(--copilot-border)] px-1"
      >
        {visibleTabs.map((t) => {
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

      {migrationPending ? (
        <div className={`${copilotCardStandardClass} flex items-center gap-2 text-sm`}>
          <TriangleAlert className="h-4 w-4 text-[var(--copilot-warning-text-strong)]" aria-hidden />
          <span>El catálogo de clasificación aún no está disponible. Los conceptos se muestran sin clasificar.</span>
        </div>
      ) : null}

      <div role="tabpanel">
        {tab === "resumen" ? (
          <ResumenTab
            overview={overview}
            loading={loading}
            error={error}
            comparisonMode={comparison}
            onRetry={loadOverview}
            onGoClassify={isAdmin ? () => setTab("clasificacion") : undefined}
          />
        ) : null}
        {tab === "productos" ? (
          <TabFrame overview={overview} loading={loading} error={error} onRetry={loadOverview}>
            {(ov) => <VentasProductosTab overview={ov} />}
          </TabFrame>
        ) : null}
        {tab === "clientes" ? (
          <TabFrame overview={overview} loading={loading} error={error} onRetry={loadOverview}>
            {(ov) => <VentasClientesTab overview={ov} />}
          </TabFrame>
        ) : null}
        {tab === "comparativo" ? (
          <TabFrame overview={overview} loading={loading} error={error} onRetry={loadOverview}>
            {(ov) => <VentasComparativoTab overview={ov} comparisonLabel={COMPARISON_LABEL[comparison]} />}
          </TabFrame>
        ) : null}
        {tab === "detalle" ? <VentasDetalleTab preset={preset} /> : null}
        {tab === "clasificacion" && isAdmin ? (
          <VentasClasificacionTab overview={overview} onChanged={loadOverview} />
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
      icon={<TriangleAlert className="h-6 w-6" />}
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

// ───────────────────────────── Resumen ──────────────────────────────────────

function ResumenTab({
  overview,
  loading,
  error,
  comparisonMode,
  onRetry,
  onGoClassify,
}: {
  overview: SalesOverview | null;
  loading: boolean;
  error: string | null;
  comparisonMode: SalesComparisonMode;
  onRetry: () => void;
  onGoClassify?: () => void;
}) {
  if (loading && !overview) return <SkeletonMetricGrid count={8} />;
  if (error) return <SalesErrorState onRetry={onRetry} message={error} />;
  if (!overview) return null;

  const s = overview.snapshot;
  const cmp = overview.comparison;
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

  const topProducts = overview.products.filter((p) => p.productId !== null).slice(0, 5);
  const topCustomers = overview.customers.slice(0, 5);

  return (
    <div className="space-y-4">
      <p className={copilotCaptionClass}>
        Comparación contra {COMPARISON_LABEL[comparisonMode]} ({overview.comparisonWindow.from} →{" "}
        {overview.comparisonWindow.to}).
      </p>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FinancialMetricCard
          label="Ventas emitidas"
          values={pairToMetricValues(s.salesEmitted)}
          footnote={{
            text: `UYU ${formatPct(cmp.salesPctByCurrency.UYU)} · USD ${formatPct(cmp.salesPctByCurrency.USD)}`,
          }}
          hint="Suma de comprobantes de venta válidos del período (sin notas de crédito). UYU y USD separados."
        />
        <FinancialMetricCard
          label="Notas de crédito"
          values={pairToMetricValues(s.creditNotes)}
          hint="Notas de crédito emitidas en el período. No se restan de ventas automáticamente."
        />
        <FinancialMetricCard
          label="Facturas emitidas"
          value={{ primary: String(s.invoiceCount), secondary: `${formatDelta(cmp.invoiceDelta)} vs ant.` }}
          hint="Cantidad de comprobantes de venta (no líneas ni unidades)."
        />
        <FinancialMetricCard
          label="Unidades / servicios"
          value={{ primary: formatQuantity(s.unitsSold), secondary: `${formatDelta(cmp.unitsDelta)} vs ant.` }}
          hint="Suma de cantidades reales de las líneas de venta con detalle."
        />
        <FinancialMetricCard
          label="Ticket promedio"
          values={pairToMetricValues(s.averageTicket)}
          hint="Facturación / cantidad de facturas de esa moneda. Nunca mezcla monedas."
        />
        <FinancialMetricCard
          label="Clientes nuevos"
          value={{ primary: String(s.newCustomers) }}
          hint="Clientes cuya primera venta válida cae dentro del período."
        />
        <FinancialMetricCard
          label="Clientes recurrentes"
          value={{ primary: String(s.recurringCustomers) }}
          hint="Clientes con una venta previa al período y otra dentro del período."
        />
        <FinancialMetricCard
          label="Pendiente de clasificación"
          value={{ primary: String(s.unclassifiedLineCount) }}
          tone={s.unclassifiedLineCount > 0 ? "warning" : "neutral"}
          footnote={
            s.unclassifiedLineCount > 0
              ? { text: `${formatUyu(s.unclassifiedAmount.UYU)} · ${formatUsd(s.unclassifiedAmount.USD)}`, tone: "warning" }
              : undefined
          }
          cta={onGoClassify ? { label: "Clasificar", onClick: onGoClassify } : undefined}
          hint="Líneas de venta sin producto canónico asignado."
        />
      </div>

      {/* Vendido vs cobrado */}
      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Vendido vs cobrado</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["UYU", "USD"] as const).map((cur) => {
            const sold = overview.collection.sold[cur];
            const applied = overview.collection.applied[cur];
            const registered = overview.collection.registered[cur];
            const pending = overview.collection.pending[cur];
            const rate = overview.collection.appliedRateByCurrency[cur];
            const fmt = cur === "UYU" ? formatUyu : formatUsd;
            return (
              <div key={cur} className="rounded-lg border border-[var(--copilot-border)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    {cur}
                  </span>
                  <StatusBadge tone={rate >= 70 ? "positive" : rate >= 40 ? "warning" : "danger"}>
                    {rate.toLocaleString("es-UY", { maximumFractionDigits: 1 })}% cobrado
                  </StatusBadge>
                </div>
                <dl className="space-y-1 text-sm">
                  <Row label="Vendido" value={fmt(sold)} strong />
                  <Row label="Cobrado aplicado" value={fmt(applied)} />
                  <Row label="Cobrado registrado" value={fmt(registered)} />
                  <Row label="Pendiente" value={fmt(pending)} tone="warning" />
                </dl>
              </div>
            );
          })}
        </div>
        <p className={`${copilotCaptionClass} mt-2`}>
          A nivel comprobante, cobrado registrado coincide con aplicado (Zeta no expone la imputación
          recibo↔factura). Ventas ≠ Cobranza: la métrica principal de este módulo son las ventas emitidas.
        </p>
      </section>

      {/* Top productos + clientes */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <MiniList
          title="Productos que más facturaron"
          icon={<Package className="h-4 w-4" aria-hidden />}
          empty="Sin productos clasificados en el período."
          rows={topProducts.map((p) => ({
            key: p.key,
            name: p.productName,
            right: `${formatUyu(p.totalByCurrency.UYU)} · ${formatUsd(p.totalByCurrency.USD)}`,
            sub: `${formatQuantity(p.quantity)} u · ${p.customerCount} clientes`,
          }))}
        />
        <MiniList
          title="Clientes principales"
          icon={<Users className="h-4 w-4" aria-hidden />}
          empty="Sin clientes en el período."
          rows={topCustomers.map((c) => ({
            key: c.customerId ?? c.customerName,
            name: c.customerName,
            right: `${formatUyu(c.salesByCurrency.UYU)} · ${formatUsd(c.salesByCurrency.USD)}`,
            sub: `${c.invoiceCount} facturas · ${c.type === "new" ? "Nuevo" : "Recurrente"}`,
          }))}
        />
      </div>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "warning" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--copilot-ink-muted)]">{label}</dt>
      <dd
        className={`tabular-nums ${strong ? "font-semibold text-[var(--copilot-ink)]" : ""} ${
          tone === "warning" ? "text-[var(--copilot-warning-text-strong)]" : "text-[var(--copilot-ink)]"
        }`}
      >
        {value}
      </dd>
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
            <li key={r.key} className="flex items-center justify-between gap-3 border-b border-[var(--copilot-border)] pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{r.name}</p>
                <p className="text-xs text-[var(--copilot-ink-muted)]">{r.sub}</p>
              </div>
              <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--copilot-ink)]">{r.right}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
