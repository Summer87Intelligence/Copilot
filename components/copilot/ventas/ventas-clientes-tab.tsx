"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Users } from "lucide-react";

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
import { clientFichaHref } from "@/lib/copilot/client-360-href";
import type { SalesOverview } from "@/lib/sales/sales-api";
import type { CustomerSalesSummaryRow } from "@/lib/sales/canonical/types";
import {
  formatUyuOrDash,
  formatUsdOrDash,
  formatDateShort,
} from "@/components/copilot/ventas/ventas-format";
import {
  VentasAnalyticsDrawer,
  DrawerSection,
  DrawerStatGrid,
  DrawerTable,
} from "@/components/copilot/ventas/ventas-analytics-drawer";

type CustomerDrill = {
  summary: {
    customerId: string;
    customerName: string;
    salesByCurrency: { UYU: number; USD: number };
    invoiceCount: number;
    serviceCount: number;
    avgTicketByCurrency: { UYU: number; USD: number };
    firstPurchase: string | null;
    lastPurchase: string | null;
    type: "new" | "recurring";
    topSalespersonName: string | null;
    activeMonthCount: number;
  };
  invoices: Array<{
    date: string;
    documentNumber: string | null;
    documentType: string;
    serviceName: string;
    currency: string;
    lineAmount: number;
    salespersonName: string | null;
  }>;
  services: Array<{
    serviceName: string;
    invoiceCount: number;
    salesByCurrency: { UYU: number; USD: number };
    firstSale: string | null;
    lastSale: string | null;
  }>;
  monthly: Array<{
    label: string;
    invoiceCount: number;
    serviceCount?: number;
    salesByCurrency: { UYU: number; USD: number };
  }>;
  insights: string[];
};

export function VentasClientesTab({
  overview,
  queryString,
  canAssign = false,
  onAssignmentChange,
  salespersons = [],
}: {
  overview: SalesOverview;
  queryString: string;
  /** Habilita el selector de comercial por cliente (solo admin). */
  canAssign?: boolean;
  /** Se invoca tras una asignación exitosa para refrescar overview. */
  onAssignmentChange?: () => void;
  /** Catálogo de comerciales activos para el selector. */
  salespersons?: { id: string; displayName: string }[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drill, setDrill] = useState<CustomerDrill | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignMsg, setAssignMsg] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);

  const assignClient = useCallback(
    async (customerId: string, salespersonId: string | null, previousId: string | null) => {
      // Idempotente en cliente: si no cambió, no dispares una escritura.
      if ((salespersonId ?? null) === (previousId ?? null)) {
        setAssignMsg({ tone: "positive", text: "Este cliente ya tiene ese comercial asignado." });
        return;
      }
      setAssigningId(customerId);
      setAssignMsg(null);
      try {
        const res = await fetch("/api/copilot/sales/client-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId, salespersonId }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          const text =
            json?.code === "NOT_FOUND"
              ? "El comercial seleccionado no está disponible."
              : salespersonId
                ? "No se pudo actualizar el comercial. Intentalo nuevamente."
                : "No se pudo quitar el comercial. Intentalo nuevamente.";
          setAssignMsg({ tone: "danger", text });
          return;
        }
        setAssignMsg({
          tone: "positive",
          text: salespersonId
            ? previousId
              ? "Comercial actualizado correctamente."
              : "Comercial asignado correctamente."
            : "Comercial quitado correctamente.",
        });
        onAssignmentChange?.();
      } catch {
        setAssignMsg({ tone: "danger", text: "No se pudo actualizar el comercial. Intentalo nuevamente." });
      } finally {
        setAssigningId(null);
      }
    },
    [onAssignmentChange]
  );

  const loadDrill = useCallback(
    async (customerId: string) => {
      setLoading(true);
      setError(null);
      setDrill(null);
      try {
        const res = await fetch(`/api/copilot/sales/customers/${encodeURIComponent(customerId)}?${queryString}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json?.message ?? "No pudimos cargar el análisis del cliente.");
          return;
        }
        setDrill(json.data as CustomerDrill);
      } catch {
        setError("No pudimos cargar el análisis del cliente.");
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

  const columns: CopilotResponsiveTableColumn<CustomerSalesSummaryRow>[] = [
    {
      key: "name",
      header: "Cliente",
      className: "text-left",
      render: (r) => <span className="font-medium text-[var(--copilot-ink)]">{r.customerName}</span>,
    },
    {
      key: "sp",
      header: "Comercial",
      className: "text-left",
      render: (r) =>
        canAssign && r.customerId ? (
          <select
            value={r.currentSalespersonId ?? ""}
            disabled={assigningId === r.customerId}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => assignClient(r.customerId!, e.target.value || null, r.currentSalespersonId)}
            aria-label={`Comercial de ${r.customerName}`}
            className="h-8 max-w-[160px] rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2 text-xs text-[var(--copilot-ink)] disabled:opacity-40"
          >
            <option value="">Sin asignar</option>
            {salespersons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-[var(--copilot-ink-muted)]">{r.salespersonName ?? "Sin asignar"}</span>
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
      key: "svc",
      header: "Servicios",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => String(r.productCount),
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
      key: "first",
      header: "Primera compra",
      className: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => formatDateShort(r.firstPurchase),
    },
    {
      key: "last",
      header: "Última compra",
      className: "text-right",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => formatDateShort(r.lastPurchase),
    },
    {
      key: "type",
      header: "Tipo",
      className: "text-left",
      render: (r) =>
        r.type === "new" ? <StatusBadge tone="positive">Nuevo</StatusBadge> : <StatusBadge tone="neutral">Recurrente</StatusBadge>,
    },
    {
      key: "act",
      header: "Acciones",
      className: "text-left",
      render: (r) => (
        <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
            aria-label={`Ver análisis de ${r.customerName}`}
            onClick={() => {
              if (r.customerId) setSelectedId(r.customerId);
            }}
            disabled={!r.customerId}
          >
            Ver análisis
          </button>
          {r.customerId ? (
            <a
              href={clientFichaHref(r.customerId)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
            >
              Cliente 360 <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <section className={copilotCardStandardClass}>
        <h2 className={copilotSectionTitleClass}>Clientes del período</h2>
        {canAssign ? (
          <p className={`${copilotCaptionClass} mt-1`}>
            El comercial se asigna al cliente y aplica a sus ventas desde la vigencia. No reescribe ventas anteriores.
          </p>
        ) : null}
        {assignMsg ? (
          <p
            role="status"
            aria-live="polite"
            className={`mt-2 text-xs font-medium ${
              assignMsg.tone === "positive"
                ? "text-[var(--copilot-success-text-strong)]"
                : "text-[var(--copilot-danger-text-strong)]"
            }`}
          >
            {assignMsg.text}
          </p>
        ) : null}
        <div className="mt-3">
          <CopilotResponsiveTable
            rows={overview.customers}
            columns={columns}
            getRowKey={(r) => r.customerId ?? r.customerName}
            ariaLabel="Ventas por cliente"
            minWidth="1240px"
            onRowClick={(r) => {
              if (r.customerId) setSelectedId(r.customerId);
            }}
            emptyState={
              <EmptyState icon={<Users className="h-6 w-6" />} title="No hay clientes con ventas en el período." variant="compact" />
            }
            mobileCard={(r) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-[var(--copilot-ink)]">{r.customerName}</p>
                  {r.type === "new" ? <StatusBadge tone="positive">Nuevo</StatusBadge> : <StatusBadge tone="neutral">Recurr.</StatusBadge>}
                </div>
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  {r.invoiceCount} facturas · {r.productCount} servicios
                </p>
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  Comercial: {r.salespersonName ?? "Sin asignar"}
                </p>
                <p className="text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
                  {formatUyuOrDash(r.netSalesByCurrency.UYU)} · {formatUsdOrDash(r.netSalesByCurrency.USD)}
                </p>
              </div>
            )}
          />
        </div>
      </section>

      {selectedId ? (
        <VentasAnalyticsDrawer
          title={drill?.summary.customerName ?? "Cliente"}
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
              <DrawerSection title="Resumen">
                <DrawerStatGrid
                  items={[
                    { label: "Ventas UYU", value: formatUyuOrDash(drill.summary.salesByCurrency.UYU) },
                    { label: "Ventas USD", value: formatUsdOrDash(drill.summary.salesByCurrency.USD) },
                    { label: "Facturas", value: String(drill.summary.invoiceCount) },
                    { label: "Servicios distintos", value: String(drill.summary.serviceCount) },
                    { label: "Ticket prom. UYU", value: formatUyuOrDash(drill.summary.avgTicketByCurrency.UYU) },
                    { label: "Ticket prom. USD", value: formatUsdOrDash(drill.summary.avgTicketByCurrency.USD) },
                    { label: "Primera compra", value: formatDateShort(drill.summary.firstPurchase) },
                    { label: "Última compra", value: formatDateShort(drill.summary.lastPurchase) },
                    { label: "Tipo", value: drill.summary.type === "new" ? "Nuevo" : "Recurrente" },
                    { label: "Comercial principal", value: drill.summary.topSalespersonName ?? "Sin asignar" },
                    { label: "Meses con actividad", value: String(drill.summary.activeMonthCount) },
                  ]}
                />
              </DrawerSection>

              {drill.insights.length > 0 ? (
                <DrawerSection title="Información directiva">
                  <ul className="space-y-1.5 text-sm text-[var(--copilot-ink)]">
                    {drill.insights.map((t, i) => (
                      <li key={i}>· {t}</li>
                    ))}
                  </ul>
                </DrawerSection>
              ) : null}

              <DrawerSection title="Facturas">
                <DrawerTable
                  ariaLabel="Facturas del cliente"
                  headers={[
                    { key: "date", label: "Fecha" },
                    { key: "doc", label: "Documento" },
                    { key: "svc", label: "Servicio" },
                    { key: "cur", label: "Moneda", align: "center" },
                    { key: "amt", label: "Total", align: "right" },
                    { key: "sp", label: "Comercial" },
                  ]}
                  rows={drill.invoices.map((inv) => ({
                    date: formatDateShort(inv.date),
                    doc: `${inv.documentType} ${inv.documentNumber ?? ""}`.trim(),
                    svc: inv.serviceName,
                    cur: inv.currency,
                    amt: inv.currency === "USD" ? formatUsdOrDash(inv.lineAmount) : formatUyuOrDash(inv.lineAmount),
                    sp: inv.salespersonName ?? "Sin asignar",
                  }))}
                />
              </DrawerSection>

              <DrawerSection title="Servicios contratados">
                <DrawerTable
                  ariaLabel="Servicios del cliente"
                  headers={[
                    { key: "svc", label: "Servicio" },
                    { key: "inv", label: "Facturas", align: "right" },
                    { key: "uyu", label: "Ventas UYU", align: "right" },
                    { key: "usd", label: "Ventas USD", align: "right" },
                    { key: "first", label: "Primera compra", align: "right" },
                    { key: "last", label: "Última compra", align: "right" },
                  ]}
                  rows={drill.services.map((s) => ({
                    svc: s.serviceName,
                    inv: String(s.invoiceCount),
                    uyu: formatUyuOrDash(s.salesByCurrency.UYU),
                    usd: formatUsdOrDash(s.salesByCurrency.USD),
                    first: formatDateShort(s.firstSale),
                    last: formatDateShort(s.lastSale),
                  }))}
                />
              </DrawerSection>

              <DrawerSection title="Evolución mensual">
                <DrawerTable
                  ariaLabel="Evolución mensual del cliente"
                  headers={[
                    { key: "mes", label: "Mes" },
                    { key: "inv", label: "Facturas", align: "right" },
                    { key: "svc", label: "Servicios", align: "right" },
                    { key: "uyu", label: "Ventas UYU", align: "right" },
                    { key: "usd", label: "Ventas USD", align: "right" },
                  ]}
                  rows={drill.monthly.map((m) => ({
                    mes: m.label,
                    inv: String(m.invoiceCount),
                    svc: String(m.serviceCount ?? 0),
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
