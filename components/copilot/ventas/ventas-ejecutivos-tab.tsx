"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";

import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { EmptyState } from "@/components/copilot/ui/empty-state";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { SkeletonText } from "@/components/copilot/ui/skeleton";
import {
  copilotCardStandardClass,
  copilotSectionTitleClass,
  copilotCaptionClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type { SalesOverview } from "@/lib/sales/sales-api";
import type { SalespersonSummaryRow } from "@/lib/sales/canonical/types";
import { SALESPERSON_START_DATE } from "@/lib/sales/canonical/types";
import { formatUyuOrDash, formatUsdOrDash, formatDateShort } from "@/components/copilot/ventas/ventas-format";
import {
  VentasAnalyticsDrawer,
  DrawerSection,
  DrawerStatGrid,
  DrawerTable,
} from "@/components/copilot/ventas/ventas-analytics-drawer";

/**
 * FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — antes "Comerciales". Renombrada
 * porque muestra CARTERA gestionada por EJECUTIVO (sales_client_salespersons),
 * no quién realizó cada venta. Para eso ver la tab "Vendedores".
 */

function rowKey(r: SalespersonSummaryRow): string {
  return r.salespersonId ?? "__unassigned__";
}

function share(r: SalespersonSummaryRow): string {
  const uyu = r.shareByCurrency.UYU;
  const usd = r.shareByCurrency.USD;
  return `${uyu.toLocaleString("es-UY", { maximumFractionDigits: 0 })}% UYU · ${usd.toLocaleString("es-UY", { maximumFractionDigits: 0 })}% USD`;
}

type SpDrill = {
  summary: {
    salespersonId: string | null;
    salespersonName: string;
    invoiceCount: number;
    customerCount: number;
    newCustomerCount: number;
    salesByCurrency: { UYU: number; USD: number };
    avgTicketByCurrency: { UYU: number; USD: number };
    topServiceName: string | null;
    period: { from: string; to: string };
  };
  invoices: Array<{
    date: string;
    customerName: string;
    documentNumber: string | null;
    documentType: string;
    serviceName: string;
    currency: string;
    lineAmount: number;
  }>;
  services: Array<{
    serviceName: string;
    invoiceCount: number;
    customerCount: number;
    salesByCurrency: { UYU: number; USD: number };
  }>;
  monthly: Array<{
    label: string;
    invoiceCount: number;
    customerCount: number;
    salesByCurrency: { UYU: number; USD: number };
  }>;
};

export function VentasEjecutivosTab({
  overview,
  queryString,
}: {
  overview: SalesOverview;
  queryString: string;
}) {
  const rows = overview.salespersons;
  const hasAssigned = rows.some((r) => r.salespersonId !== null && r.invoiceCount > 0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drill, setDrill] = useState<SpDrill | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDrill = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      setDrill(null);
      try {
        const res = await fetch(`/api/copilot/sales/salespersons/${encodeURIComponent(id)}?${queryString}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json?.message ?? "No pudimos cargar el detalle del ejecutivo.");
          return;
        }
        setDrill(json.data as SpDrill);
      } catch {
        setError("No pudimos cargar el detalle del ejecutivo.");
      } finally {
        setLoading(false);
      }
    },
    [queryString]
  );

  useEffect(() => {
    if (!selectedId) return;
    void loadDrill(selectedId);
  }, [selectedId, loadDrill]);

  const columns: CopilotResponsiveTableColumn<SalespersonSummaryRow>[] = [
    {
      key: "name",
      header: "Ejecutivo",
      className: "text-left",
      render: (r) =>
        r.salespersonId ? (
          <span className="font-medium text-[var(--copilot-ink)]">{r.salespersonName}</span>
        ) : (
          <span className="font-medium text-[var(--copilot-ink-muted)]">{r.salespersonName}</span>
        ),
    },
    {
      key: "assigned",
      header: "Clientes asignados",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => String(r.assignedCustomerCount),
    },
    {
      key: "cust",
      header: "Clientes con ventas",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => String(r.customerCount),
    },
    {
      key: "inv",
      header: "Facturas",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => String(r.invoiceCount),
    },
    {
      key: "uyu",
      header: "Ventas netas UYU",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => formatUyuOrDash(r.netSalesByCurrency.UYU),
    },
    {
      key: "usd",
      header: "Ventas netas USD",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => formatUsdOrDash(r.netSalesByCurrency.USD),
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
      key: "top",
      header: "Servicio principal",
      className: "text-left",
      cellClassName: "text-xs",
      render: (r) => r.topProductName ?? "—",
    },
    {
      key: "share",
      header: "Participación",
      className: "text-right",
      cellClassName: "text-right text-xs tabular-nums",
      render: (r) => share(r),
    },
  ];

  return (
    <>
      <section className={copilotCardStandardClass}>
        <div className="flex flex-col gap-1">
          <h2 className={`${copilotSectionTitleClass} flex items-center gap-2`}>
            <Users className="h-4 w-4" aria-hidden />
            Cartera por ejecutivo
          </h2>
          <p className={copilotCaptionClass}>
            Estas métricas corresponden a clientes gestionados por cada ejecutivo. No representan necesariamente
            ventas realizadas personalmente por ese ejecutivo. El ejecutivo se asigna al cliente desde la pestaña
            Clientes y arranca el {SALESPERSON_START_DATE}. Para ver el vendedor real de cada operación, mirá la
            pestaña Vendedores. Los importes son ventas netas (emitidas − notas de crédito).
          </p>
        </div>

        <div className="mt-3">
          <CopilotResponsiveTable
            rows={rows}
            columns={columns}
            getRowKey={rowKey}
            ariaLabel="Cartera por ejecutivo"
            minWidth="1160px"
            onRowClick={(r) => setSelectedId(r.salespersonId ?? "unassigned")}
            emptyState={<EmptyState icon={<Users className="h-6 w-6" />} title="No hay ventas en el período." variant="compact" />}
            mobileCard={(r) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`font-medium ${r.salespersonId ? "text-[var(--copilot-ink)]" : "text-[var(--copilot-ink-muted)]"}`}>
                    {r.salespersonName}
                  </p>
                  <StatusBadge tone="neutral">{r.invoiceCount} fact.</StatusBadge>
                </div>
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  {r.assignedCustomerCount} asignados · {r.customerCount} con ventas · {share(r)}
                </p>
                <p className="text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
                  {formatUyuOrDash(r.netSalesByCurrency.UYU)} · {formatUsdOrDash(r.netSalesByCurrency.USD)}
                </p>
              </div>
            )}
          />
        </div>

        {!hasAssigned ? (
          <p className={`${copilotCaptionClass} mt-3`}>
            Todavía no asignaste ejecutivos a los clientes de este período. Andá a Clientes y elegí el ejecutivo de
            cada cliente desde el {SALESPERSON_START_DATE}.
          </p>
        ) : null}
      </section>

      {selectedId ? (
        <VentasAnalyticsDrawer
          title={drill?.summary.salespersonName ?? "Ejecutivo"}
          onClose={() => {
            setSelectedId(null);
            setDrill(null);
            setError(null);
          }}
        >
          {loading ? <SkeletonText lines={8} /> : null}
          {error ? <p className="text-sm text-[var(--copilot-danger-text-strong)]">{error}</p> : null}
          {drill ? (
            <>
              <DrawerSection title="Resumen del ejecutivo">
                <DrawerStatGrid
                  items={[
                    { label: "Facturas", value: String(drill.summary.invoiceCount) },
                    { label: "Clientes", value: String(drill.summary.customerCount) },
                    { label: "Clientes nuevos", value: String(drill.summary.newCustomerCount) },
                    { label: "Ventas netas UYU", value: formatUyuOrDash(drill.summary.salesByCurrency.UYU) },
                    { label: "Ventas netas USD", value: formatUsdOrDash(drill.summary.salesByCurrency.USD) },
                    { label: "Ticket prom. UYU", value: formatUyuOrDash(drill.summary.avgTicketByCurrency.UYU) },
                    { label: "Ticket prom. USD", value: formatUsdOrDash(drill.summary.avgTicketByCurrency.USD) },
                    { label: "Servicio principal", value: drill.summary.topServiceName ?? "—" },
                    {
                      label: "Período",
                      value: `${formatDateShort(drill.summary.period.from)} – ${formatDateShort(drill.summary.period.to)}`,
                    },
                  ]}
                />
              </DrawerSection>

              <DrawerSection title="Facturas de la cartera">
                <DrawerTable
                  ariaLabel="Facturas de la cartera del ejecutivo"
                  headers={[
                    { key: "date", label: "Fecha" },
                    { key: "cust", label: "Cliente" },
                    { key: "doc", label: "Documento" },
                    { key: "svc", label: "Servicio" },
                    { key: "cur", label: "Moneda", align: "center" },
                    { key: "amt", label: "Total", align: "right" },
                  ]}
                  rows={drill.invoices.map((inv) => ({
                    date: formatDateShort(inv.date),
                    cust: inv.customerName,
                    doc: `${inv.documentType} ${inv.documentNumber ?? ""}`.trim(),
                    svc: inv.serviceName,
                    cur: inv.currency,
                    amt: inv.currency === "USD" ? formatUsdOrDash(inv.lineAmount) : formatUyuOrDash(inv.lineAmount),
                  }))}
                />
              </DrawerSection>

              <DrawerSection title="Servicios vendidos en la cartera">
                <DrawerTable
                  ariaLabel="Servicios de la cartera del ejecutivo"
                  headers={[
                    { key: "svc", label: "Servicio" },
                    { key: "inv", label: "Facturas", align: "right" },
                    { key: "cust", label: "Clientes", align: "right" },
                    { key: "uyu", label: "Ventas UYU", align: "right" },
                    { key: "usd", label: "Ventas USD", align: "right" },
                  ]}
                  rows={drill.services.map((s) => ({
                    svc: s.serviceName,
                    inv: String(s.invoiceCount),
                    cust: String(s.customerCount),
                    uyu: formatUyuOrDash(s.salesByCurrency.UYU),
                    usd: formatUsdOrDash(s.salesByCurrency.USD),
                  }))}
                />
              </DrawerSection>

              <DrawerSection title="Evolución mensual">
                <DrawerTable
                  ariaLabel="Evolución mensual de la cartera del ejecutivo"
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
            </>
          ) : null}
        </VentasAnalyticsDrawer>
      ) : null}
    </>
  );
}
