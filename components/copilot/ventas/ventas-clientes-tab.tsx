"use client";

import { Users } from "lucide-react";

import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { EmptyState } from "@/components/copilot/ui/empty-state";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { copilotCardStandardClass, copilotSectionTitleClass } from "@/components/copilot/ui/copilot-visual-system";
import { clientFichaHref } from "@/lib/copilot/client-360-href";
import type { SalesOverview } from "@/lib/sales/sales-api";
import type { CustomerSalesSummaryRow } from "@/lib/sales/canonical/types";
import { formatUyu, formatUsd, formatDateShort } from "@/components/copilot/ventas/ventas-format";

export function VentasClientesTab({ overview }: { overview: SalesOverview }) {
  const columns: CopilotResponsiveTableColumn<CustomerSalesSummaryRow>[] = [
    {
      key: "name",
      header: "Cliente",
      render: (r) =>
        r.customerId ? (
          <a href={clientFichaHref(r.customerId)} className="font-medium text-[var(--copilot-accent)] hover:underline">
            {r.customerName}
          </a>
        ) : (
          <span className="font-medium text-[var(--copilot-ink)]">{r.customerName}</span>
        ),
    },
    { key: "inv", header: "Facturas", cellClassName: "text-right tabular-nums", render: (r) => String(r.invoiceCount) },
    { key: "prod", header: "Productos", cellClassName: "text-right tabular-nums", render: (r) => String(r.productCount) },
    { key: "uyu", header: "Ventas UYU", cellClassName: "text-right tabular-nums", render: (r) => formatUyu(r.salesByCurrency.UYU) },
    { key: "usd", header: "Ventas USD", cellClassName: "text-right tabular-nums", render: (r) => formatUsd(r.salesByCurrency.USD) },
    { key: "first", header: "Primera", cellClassName: "text-right tabular-nums text-xs", render: (r) => formatDateShort(r.firstPurchase) },
    { key: "last", header: "Última", cellClassName: "text-right tabular-nums text-xs", render: (r) => formatDateShort(r.lastPurchase) },
    {
      key: "type",
      header: "Tipo",
      render: (r) =>
        r.type === "new" ? <StatusBadge tone="positive">Nuevo</StatusBadge> : <StatusBadge tone="neutral">Recurrente</StatusBadge>,
    },
  ];

  return (
    <section className={copilotCardStandardClass}>
      <h2 className={copilotSectionTitleClass}>Clientes del período</h2>
      <div className="mt-3">
        <CopilotResponsiveTable
          rows={overview.customers}
          columns={columns}
          getRowKey={(r) => r.customerId ?? r.customerName}
          ariaLabel="Ventas por cliente"
          minWidth="820px"
          emptyState={<EmptyState icon={<Users className="h-6 w-6" />} title="No hay clientes con ventas en el período." variant="compact" />}
          mobileCard={(r) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                {r.customerId ? (
                  <a href={clientFichaHref(r.customerId)} className="font-medium text-[var(--copilot-accent)]">
                    {r.customerName}
                  </a>
                ) : (
                  <p className="font-medium text-[var(--copilot-ink)]">{r.customerName}</p>
                )}
                {r.type === "new" ? <StatusBadge tone="positive">Nuevo</StatusBadge> : <StatusBadge tone="neutral">Recurr.</StatusBadge>}
              </div>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                {r.invoiceCount} facturas · {r.productCount} productos
              </p>
              <p className="text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
                {formatUyu(r.salesByCurrency.UYU)} · {formatUsd(r.salesByCurrency.USD)}
              </p>
            </div>
          )}
        />
      </div>
    </section>
  );
}
