"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, ExternalLink } from "lucide-react";

import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { EmptyState } from "@/components/copilot/ui/empty-state";
import {
  copilotCardStandardClass,
  copilotSectionTitleClass,
  copilotCaptionClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { clientFichaHref } from "@/lib/copilot/client-360-href";
import type { SalesOverview } from "@/lib/sales/sales-api";
import type { ProductSalesSummaryRow } from "@/lib/sales/canonical/types";
import {
  formatUyuOrDash,
  formatUsdOrDash,
  formatPct,
  formatDateShort,
} from "@/components/copilot/ventas/ventas-format";
import {
  VentasAnalyticsDrawer,
  DrawerSection,
  DrawerStatGrid,
  DrawerTable,
} from "@/components/copilot/ventas/ventas-analytics-drawer";
import { SkeletonText } from "@/components/copilot/ui/skeleton";

type ProductRow = ProductSalesSummaryRow & {
  previousTotalByCurrency?: { UYU: number; USD: number };
  salesPctByCurrency?: { UYU: number | null; USD: number | null };
};

type ServiceDrill = {
  summary: {
    serviceKey: string;
    serviceName: string;
    invoiceCount: number;
    customerCount: number;
    salesByCurrency: { UYU: number; USD: number };
    avgTicketByCurrency: { UYU: number; USD: number };
    firstSale: string | null;
    lastSale: string | null;
    salespersons: string[];
    comparison: {
      previousSales: { UYU: number; USD: number };
      previousInvoices: number;
      previousCustomers: number;
      salesDelta: { UYU: number; USD: number };
      salesPct: { UYU: number | null; USD: number | null };
      invoiceDelta: number;
      customerDelta: number;
    };
  };
  invoices: Array<{
    documentId: string;
    date: string;
    customerId: string | null;
    customerName: string;
    documentNumber: string | null;
    documentType: string;
    currency: string;
    lineAmount: number;
    salespersonName: string | null;
    originalConcept: string | null;
    originalCode: string | null;
  }>;
  customers: Array<{
    customerId: string | null;
    customerName: string;
    invoiceCount: number;
    salesByCurrency: { UYU: number; USD: number };
    firstSale: string | null;
    lastSale: string | null;
  }>;
  monthly: Array<{
    month: string;
    label: string;
    invoiceCount: number;
    customerCount: number;
    salesByCurrency: { UYU: number; USD: number };
  }>;
};

function variationLabel(row: ProductRow): string {
  const pct = row.salesPctByCurrency;
  if (!pct) return "—";
  const parts: string[] = [];
  if (row.totalByCurrency.UYU > 0 || (row.previousTotalByCurrency?.UYU ?? 0) > 0) {
    parts.push(`UYU ${formatPct(pct.UYU)}`);
  }
  if (row.totalByCurrency.USD > 0 || (row.previousTotalByCurrency?.USD ?? 0) > 0) {
    parts.push(`USD ${formatPct(pct.USD)}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

export function VentasProductosTab({
  overview,
  queryString,
}: {
  overview: SalesOverview;
  queryString: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drill, setDrill] = useState<ServiceDrill | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = overview.products as ProductRow[];
    if (!q) return list;
    return list.filter(
      (p) => p.productName.toLowerCase().includes(q) || (p.categoryName ?? "").toLowerCase().includes(q)
    );
  }, [overview.products, search]);

  const loadDrill = useCallback(
    async (key: string) => {
      setSelectedKey(key);
      setDrillLoading(true);
      setDrillError(null);
      setDrill(null);
      try {
        const res = await fetch(`/api/copilot/sales/services/${encodeURIComponent(key)}?${queryString}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setDrillError(json?.message ?? "No pudimos cargar el detalle del servicio.");
          return;
        }
        setDrill(json.data as ServiceDrill);
      } catch {
        setDrillError("No pudimos cargar el detalle del servicio.");
      } finally {
        setDrillLoading(false);
      }
    },
    [queryString]
  );

  useEffect(() => {
    if (!selectedKey) return;
    void loadDrill(selectedKey);
  }, [selectedKey, loadDrill]);

  const columns: CopilotResponsiveTableColumn<ProductRow>[] = [
    {
      key: "name",
      header: "Servicio",
      className: "text-left",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--copilot-ink)]">{r.productName}</p>
          {r.categoryName ? <p className="text-xs text-[var(--copilot-ink-muted)]">{r.categoryName}</p> : null}
        </div>
      ),
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
      key: "uyu",
      header: "Ventas UYU",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => formatUyuOrDash(r.totalByCurrency.UYU),
    },
    {
      key: "usd",
      header: "Ventas USD",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => formatUsdOrDash(r.totalByCurrency.USD),
    },
    {
      key: "tuyu",
      header: "Ticket promedio UYU",
      className: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => formatUyuOrDash(r.avgTicketByCurrency?.UYU ?? 0),
    },
    {
      key: "tusd",
      header: "Ticket promedio USD",
      className: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => formatUsdOrDash(r.avgTicketByCurrency?.USD ?? 0),
    },
    {
      key: "var",
      header: "Variación",
      className: "text-right",
      cellClassName: "text-right text-xs",
      render: (r) => variationLabel(r),
    },
  ];

  return (
    <>
      <section className={copilotCardStandardClass}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className={copilotSectionTitleClass}>Resumen por servicio</h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar servicio…"
            aria-label="Buscar servicio"
            className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
          />
        </div>
        <p className={`${copilotCaptionClass} mt-1`}>
          Servicios facturados en el período, con cantidad de facturas, clientes e importe por moneda.
        </p>
        <div className="mt-3">
          <CopilotResponsiveTable
            rows={rows}
            columns={columns}
            getRowKey={(r) => r.key}
            ariaLabel="Ventas por servicio"
            minWidth="980px"
            onRowClick={(r) => setSelectedKey(r.key)}
            emptyState={
              <EmptyState icon={<Briefcase className="h-6 w-6" />} title="No encontramos servicios con estos filtros." variant="compact" />
            }
            mobileCard={(r) => (
              <div className="space-y-1">
                <p className="font-medium text-[var(--copilot-ink)]">{r.productName}</p>
                {r.categoryName ? <p className="text-xs text-[var(--copilot-ink-muted)]">{r.categoryName}</p> : null}
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  {r.invoiceCount} facturas · {r.customerCount} clientes
                </p>
                <p className="text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
                  {formatUyuOrDash(r.totalByCurrency.UYU)} · {formatUsdOrDash(r.totalByCurrency.USD)}
                </p>
              </div>
            )}
          />
        </div>
      </section>

      {selectedKey ? (
        <VentasAnalyticsDrawer
          title={drill?.summary.serviceName ?? "Servicio"}
          onClose={() => {
            setSelectedKey(null);
            setDrill(null);
            setDrillError(null);
          }}
        >
          {drillLoading ? <SkeletonText lines={8} /> : null}
          {drillError ? <p className="text-sm text-[var(--copilot-danger-text-strong)]">{drillError}</p> : null}
          {drill ? (
            <>
              <DrawerSection title="Resumen">
                <DrawerStatGrid
                  items={[
                    { label: "Facturas", value: String(drill.summary.invoiceCount) },
                    { label: "Clientes", value: String(drill.summary.customerCount) },
                    { label: "Ventas UYU", value: formatUyuOrDash(drill.summary.salesByCurrency.UYU) },
                    { label: "Ventas USD", value: formatUsdOrDash(drill.summary.salesByCurrency.USD) },
                    { label: "Ticket prom. UYU", value: formatUyuOrDash(drill.summary.avgTicketByCurrency.UYU) },
                    { label: "Ticket prom. USD", value: formatUsdOrDash(drill.summary.avgTicketByCurrency.USD) },
                    { label: "Primera venta", value: formatDateShort(drill.summary.firstSale) },
                    { label: "Última venta", value: formatDateShort(drill.summary.lastSale) },
                    {
                      label: "Comerciales",
                      value: drill.summary.salespersons.length ? drill.summary.salespersons.join(", ") : "Sin asignar",
                    },
                    {
                      label: "Var. UYU",
                      value: formatPct(drill.summary.comparison.salesPct.UYU),
                    },
                    {
                      label: "Var. USD",
                      value: formatPct(drill.summary.comparison.salesPct.USD),
                    },
                  ]}
                />
              </DrawerSection>

              <DrawerSection title="Facturas correspondientes">
                <DrawerTable
                  ariaLabel="Facturas del servicio"
                  headers={[
                    { key: "date", label: "Fecha" },
                    { key: "cust", label: "Cliente" },
                    { key: "doc", label: "Documento" },
                    { key: "cur", label: "Moneda", align: "center" },
                    { key: "amt", label: "Importe", align: "right" },
                    { key: "sp", label: "Comercial" },
                    { key: "act", label: "Acciones" },
                  ]}
                  rows={drill.invoices.map((inv) => ({
                    date: formatDateShort(inv.date),
                    cust: inv.customerName,
                    doc: `${inv.documentType} ${inv.documentNumber ?? ""}`.trim(),
                    cur: inv.currency,
                    amt:
                      inv.currency === "USD"
                        ? formatUsdOrDash(inv.lineAmount)
                        : formatUyuOrDash(inv.lineAmount),
                    sp: inv.salespersonName ?? "Sin asignar",
                    act: inv.customerId ? (
                      <a
                        href={clientFichaHref(inv.customerId)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Cliente 360 <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : (
                      "—"
                    ),
                  }))}
                />
                {drill.invoices.some((i) => i.originalConcept || i.originalCode) ? (
                  <p className={`${copilotCaptionClass} mt-2`}>
                    Concepto Zeta visible en cada línea del detalle al abrir la factura desde Detalle.
                  </p>
                ) : null}
              </DrawerSection>

              <DrawerSection title="Clientes">
                <DrawerTable
                  ariaLabel="Clientes del servicio"
                  headers={[
                    { key: "cust", label: "Cliente" },
                    { key: "inv", label: "Facturas", align: "right" },
                    { key: "uyu", label: "Ventas UYU", align: "right" },
                    { key: "usd", label: "Ventas USD", align: "right" },
                    { key: "first", label: "Primera venta", align: "right" },
                    { key: "last", label: "Última venta", align: "right" },
                  ]}
                  rows={drill.customers.map((c) => ({
                    cust: c.customerId ? (
                      <a href={clientFichaHref(c.customerId)} className="text-[var(--copilot-accent)] hover:underline">
                        {c.customerName}
                      </a>
                    ) : (
                      c.customerName
                    ),
                    inv: String(c.invoiceCount),
                    uyu: formatUyuOrDash(c.salesByCurrency.UYU),
                    usd: formatUsdOrDash(c.salesByCurrency.USD),
                    first: formatDateShort(c.firstSale),
                    last: formatDateShort(c.lastSale),
                  }))}
                />
              </DrawerSection>

              <DrawerSection title="Evolución">
                <DrawerTable
                  ariaLabel="Evolución mensual del servicio"
                  headers={[
                    { key: "mes", label: "Mes" },
                    { key: "inv", label: "Facturas", align: "right" },
                    { key: "cust", label: "Clientes", align: "right" },
                    { key: "uyu", label: "Ventas UYU", align: "right" },
                    { key: "usd", label: "Ventas USD", align: "right" },
                  ]}
                  rows={drill.monthly.map((m) => ({
                    mes: m.label,
                    inv: String(m.invoiceCount),
                    cust: String(m.customerCount),
                    uyu: formatUyuOrDash(m.salesByCurrency.UYU),
                    usd: formatUsdOrDash(m.salesByCurrency.USD),
                  }))}
                />
              </DrawerSection>

              <DrawerSection title="Comparación">
                <ul className="space-y-1 text-sm text-[var(--copilot-ink)]">
                  <li>
                    Facturas: {drill.summary.invoiceCount} actual · {drill.summary.comparison.previousInvoices} anterior (
                    {drill.summary.comparison.invoiceDelta >= 0 ? "+" : ""}
                    {drill.summary.comparison.invoiceDelta})
                  </li>
                  <li>
                    Clientes: {drill.summary.customerCount} actual · {drill.summary.comparison.previousCustomers} anterior (
                    {drill.summary.comparison.customerDelta >= 0 ? "+" : ""}
                    {drill.summary.comparison.customerDelta})
                  </li>
                  <li>
                    UYU {formatPct(drill.summary.comparison.salesPct.UYU)} · USD{" "}
                    {formatPct(drill.summary.comparison.salesPct.USD)}
                  </li>
                </ul>
              </DrawerSection>
            </>
          ) : null}
        </VentasAnalyticsDrawer>
      ) : null}
    </>
  );
}

// Re-export name alias for clarity in page client
export { VentasProductosTab as VentasServiciosTab };
