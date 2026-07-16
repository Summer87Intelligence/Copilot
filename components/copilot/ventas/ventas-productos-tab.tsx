"use client";

import { useMemo, useState } from "react";
import { Package } from "lucide-react";

import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { EmptyState } from "@/components/copilot/ui/empty-state";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { copilotCardStandardClass, copilotSectionTitleClass, copilotCaptionClass } from "@/components/copilot/ui/copilot-visual-system";
import type { SalesOverview } from "@/lib/sales/sales-api";
import type { ProductSalesSummaryRow } from "@/lib/sales/canonical/types";
import { formatUyu, formatUsd, formatQuantity } from "@/components/copilot/ventas/ventas-format";

export function VentasProductosTab({ overview }: { overview: SalesOverview }) {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return overview.products;
    return overview.products.filter(
      (p) => p.productName.toLowerCase().includes(q) || (p.categoryName ?? "").toLowerCase().includes(q)
    );
  }, [overview.products, search]);

  const columns: CopilotResponsiveTableColumn<ProductSalesSummaryRow>[] = [
    {
      key: "name",
      header: "Producto / servicio",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--copilot-ink)]">{r.productName}</p>
          <p className="text-xs text-[var(--copilot-ink-muted)]">{r.categoryName ?? "Sin categoría"}</p>
        </div>
      ),
    },
    { key: "qty", header: "Cantidad", cellClassName: "text-right tabular-nums", render: (r) => formatQuantity(r.quantity) },
    { key: "inv", header: "Facturas", cellClassName: "text-right tabular-nums", render: (r) => String(r.invoiceCount) },
    { key: "cust", header: "Clientes", cellClassName: "text-right tabular-nums", render: (r) => String(r.customerCount) },
    { key: "uyu", header: "Total UYU", cellClassName: "text-right tabular-nums", render: (r) => formatUyu(r.totalByCurrency.UYU) },
    { key: "usd", header: "Total USD", cellClassName: "text-right tabular-nums", render: (r) => formatUsd(r.totalByCurrency.USD) },
    {
      key: "avg",
      header: "Precio prom.",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => (
        <span>
          {r.avgPriceByCurrency.UYU > 0 ? formatUyu(r.avgPriceByCurrency.UYU) : ""}
          {r.avgPriceByCurrency.UYU > 0 && r.avgPriceByCurrency.USD > 0 ? " · " : ""}
          {r.avgPriceByCurrency.USD > 0 ? formatUsd(r.avgPriceByCurrency.USD) : ""}
          {r.avgPriceByCurrency.UYU === 0 && r.avgPriceByCurrency.USD === 0 ? "—" : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (r) =>
        r.classificationStatus === "classified" ? (
          <StatusBadge tone="positive">Clasificado</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Sin clasificar</StatusBadge>
        ),
    },
  ];

  return (
    <section className={copilotCardStandardClass}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className={copilotSectionTitleClass}>Resumen por producto o servicio</h2>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto…"
          aria-label="Buscar producto"
          className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
        />
      </div>
      <p className={`${copilotCaptionClass} mt-1`}>UYU y USD separados. Los conceptos no reconocidos se agrupan como “Sin clasificar”.</p>
      <div className="mt-3">
        <CopilotResponsiveTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.key}
          ariaLabel="Ventas por producto"
          minWidth="820px"
          emptyState={<EmptyState icon={<Package className="h-6 w-6" />} title="No encontramos productos con estos filtros." variant="compact" />}
          mobileCard={(r) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-[var(--copilot-ink)]">{r.productName}</p>
                {r.classificationStatus === "classified" ? (
                  <StatusBadge tone="positive">Clasif.</StatusBadge>
                ) : (
                  <StatusBadge tone="warning">S/C</StatusBadge>
                )}
              </div>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                {formatQuantity(r.quantity)} u · {r.invoiceCount} facturas · {r.customerCount} clientes
              </p>
              <p className="text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
                {formatUyu(r.totalByCurrency.UYU)} · {formatUsd(r.totalByCurrency.USD)}
              </p>
            </div>
          )}
        />
      </div>
    </section>
  );
}
