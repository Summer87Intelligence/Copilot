"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListFilter, TriangleAlert } from "lucide-react";

import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { EmptyState } from "@/components/copilot/ui/empty-state";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { TablePagination } from "@/components/copilot/ui/table-pagination";
import { SkeletonText } from "@/components/copilot/ui/skeleton";
import { copilotCardStandardClass, copilotSectionTitleClass } from "@/components/copilot/ui/copilot-visual-system";
import type { SalesDetailRow } from "@/lib/sales/sales-api";
import type { SalesPeriodPreset } from "@/lib/sales/sales-period";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import { formatDateShort } from "@/components/copilot/ventas/ventas-format";

const PAGE_SIZE = 50;

export function VentasDetalleTab({ preset }: { preset: SalesPeriodPreset }) {
  const [rows, setRows] = useState<SalesDetailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState<"all" | "UYU" | "USD">("all");
  const [payment, setPayment] = useState<"all" | "paid" | "pending">("all");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("preset", preset);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    if (search.trim()) p.set("search", search.trim());
    if (currency !== "all") p.set("currencies", currency);
    if (payment !== "all") p.set("payment", payment);
    return p.toString();
  }, [preset, page, search, currency, payment]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/copilot/sales/details?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.message ?? "No pudimos cargar el detalle de ventas.");
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(json.data as SalesDetailRow[]);
      setTotal(json.meta?.total ?? 0);
    } catch {
      setError("No pudimos cargar el detalle de ventas.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, currency, payment, preset]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const columns: CopilotResponsiveTableColumn<SalesDetailRow>[] = [
    { key: "date", header: "Fecha", cellClassName: "tabular-nums text-xs", render: (r) => formatDateShort(r.date) },
    { key: "cust", header: "Cliente", render: (r) => <span className="text-[var(--copilot-ink)]">{r.customerName}</span> },
    { key: "doc", header: "Documento", cellClassName: "text-xs", render: (r) => `${r.documentType} ${r.documentNumber ?? ""}`.trim() },
    {
      key: "prod",
      header: "Producto / descripción",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[var(--copilot-ink)]">{r.productName ?? "Sin clasificar"}</p>
          <p className="truncate text-xs text-[var(--copilot-ink-muted)]">{r.originalDescription}</p>
        </div>
      ),
    },
    { key: "qty", header: "Cant.", cellClassName: "text-right tabular-nums", render: (r) => r.quantity.toLocaleString("es-UY", { maximumFractionDigits: 2 }) },
    { key: "cur", header: "Mon.", render: (r) => r.currency },
    { key: "total", header: "Total", cellClassName: "text-right tabular-nums", render: (r) => formatMoneyCurrency(r.lineAmount, r.currency === "UNKNOWN" ? "UYU" : r.currency) },
    {
      key: "pending",
      header: "Pendiente",
      cellClassName: "text-right tabular-nums text-xs",
      render: (r) => (r.isFirstLineOfDoc ? formatMoneyCurrency(r.docPending, r.currency === "UNKNOWN" ? "UYU" : r.currency) : "—"),
    },
  ];

  return (
    <section className={copilotCardStandardClass}>
      <h2 className={copilotSectionTitleClass}>Detalle de ventas</h2>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cliente, descripción, documento…"
          aria-label="Buscar en el detalle"
          className="h-9 min-w-[200px] flex-1 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
        />
        <select value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)} aria-label="Moneda" className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)]">
          <option value="all">Todas las monedas</option>
          <option value="UYU">UYU</option>
          <option value="USD">USD</option>
        </select>
        <select value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)} aria-label="Estado de cobro" className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)]">
          <option value="all">Cobrado y pendiente</option>
          <option value="paid">Cobrado</option>
          <option value="pending">Pendiente</option>
        </select>
      </div>

      <div className="mt-3">
        {loading ? (
          <SkeletonText lines={6} />
        ) : error ? (
          <EmptyState icon={<TriangleAlert className="h-6 w-6" />} title={error} variant="compact" />
        ) : (
          <>
            <CopilotResponsiveTable
              rows={rows}
              columns={columns}
              getRowKey={(r) => r.lineId}
              ariaLabel="Detalle de ventas"
              minWidth="900px"
              emptyState={<EmptyState icon={<ListFilter className="h-6 w-6" />} title="No encontramos ventas con estos filtros." variant="compact" />}
              mobileCard={(r) => (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-[var(--copilot-ink)]">{r.customerName}</p>
                    <StatusBadge tone={r.kind === "credit_note" ? "warning" : "neutral"}>{r.currency}</StatusBadge>
                  </div>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                    {formatDateShort(r.date)} · {r.productName ?? r.originalDescription}
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
                    {formatMoneyCurrency(r.lineAmount, r.currency === "UNKNOWN" ? "UYU" : r.currency)}
                  </p>
                </div>
              )}
            />
            <div className="mt-3">
              <TablePagination page={page} totalPages={totalPages} from={from} to={to} total={total} itemLabel="líneas" onPageChange={setPage} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
