"use client";

import { Briefcase } from "lucide-react";

import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { EmptyState } from "@/components/copilot/ui/empty-state";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import {
  copilotCardStandardClass,
  copilotSectionTitleClass,
  copilotCaptionClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type { SalesOverview } from "@/lib/sales/sales-api";
import type { SellerSalesSummaryRow } from "@/lib/sales/canonical/types";
import { formatUyuOrDash, formatUsdOrDash } from "@/components/copilot/ventas/ventas-format";

/**
 * FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — ventas atribuidas al VENDEDOR
 * real de cada operación (asignación manual por documento). Distinto de
 * "Ejecutivos" (cartera gestionada). "Sin vendedor identificado" siempre se
 * muestra: nunca se oculta ni se atribuye por defecto al ejecutivo.
 *
 * Para editar el vendedor de una operación, usá Ventas → Detalle.
 */
function rowKey(r: SellerSalesSummaryRow): string {
  return r.sellerId ?? "__unassigned__";
}

export function VentasVendedoresTab({ overview }: { overview: SalesOverview }) {
  const rows = overview.sellers;

  const columns: CopilotResponsiveTableColumn<SellerSalesSummaryRow>[] = [
    {
      key: "name",
      header: "Vendedor",
      className: "text-left",
      render: (r) =>
        r.sellerId ? (
          <span className="font-medium text-[var(--copilot-ink)]">{r.sellerName}</span>
        ) : (
          <span className="font-medium text-[var(--copilot-ink-muted)]">{r.sellerName}</span>
        ),
    },
    {
      key: "inv",
      header: "Operaciones",
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
  ];

  return (
    <section className={copilotCardStandardClass}>
      <div className="flex flex-col gap-1">
        <h2 className={`${copilotSectionTitleClass} flex items-center gap-2`}>
          <Briefcase className="h-4 w-4" aria-hidden />
          Ventas por vendedor
        </h2>
        <p className={copilotCaptionClass}>
          El vendedor es quien realizó cada operación puntual (asignación manual por comprobante, distinta del
          ejecutivo del cliente). Para asignar o cambiar el vendedor de una factura, usá la pestaña Detalle.
          &ldquo;Sin vendedor identificado&rdquo; incluye operaciones sin asignar y notas de crédito sin factura
          original identificable.
        </p>
      </div>

      <div className="mt-3">
        <CopilotResponsiveTable
          rows={rows}
          columns={columns}
          getRowKey={rowKey}
          ariaLabel="Ventas por vendedor"
          minWidth="1080px"
          emptyState={<EmptyState icon={<Briefcase className="h-6 w-6" />} title="No hay ventas en el período." variant="compact" />}
          mobileCard={(r) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className={`font-medium ${r.sellerId ? "text-[var(--copilot-ink)]" : "text-[var(--copilot-ink-muted)]"}`}>
                  {r.sellerName}
                </p>
                <StatusBadge tone="neutral">{r.invoiceCount} op.</StatusBadge>
              </div>
              <p className="text-xs text-[var(--copilot-ink-muted)]">{r.customerCount} clientes</p>
              <p className="text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
                {formatUyuOrDash(r.netSalesByCurrency.UYU)} · {formatUsdOrDash(r.netSalesByCurrency.USD)}
              </p>
            </div>
          )}
        />
      </div>
    </section>
  );
}
