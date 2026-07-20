"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, ListFilter, TriangleAlert } from "lucide-react";

import {
  CopilotResponsiveTable,
  type CopilotResponsiveTableColumn,
} from "@/components/copilot/ui/copilot-responsive-table";
import { EmptyState } from "@/components/copilot/ui/empty-state";
import { StatusBadge } from "@/components/copilot/ui/status-badge";
import { TablePagination } from "@/components/copilot/ui/table-pagination";
import { SkeletonText } from "@/components/copilot/ui/skeleton";
import {
  copilotCardStandardClass,
  copilotSectionTitleClass,
  copilotCaptionClass,
} from "@/components/copilot/ui/copilot-visual-system";
import type { SalesDetailRow } from "@/lib/sales/sales-api";
import type { SalesPeriodPreset } from "@/lib/sales/sales-period";
import type { SalespersonRow } from "@/lib/sales/sales-salesperson-repository";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import { clientFichaHref } from "@/lib/copilot/client-360-href";
import { formatDateShort, formatUyuOrDash, formatUsdOrDash } from "@/components/copilot/ventas/ventas-format";
import {
  VentasAnalyticsDrawer,
  DrawerSection,
  DrawerStatGrid,
} from "@/components/copilot/ventas/ventas-analytics-drawer";
import { SellerSelect } from "@/components/copilot/ventas/seller-select";

const PAGE_SIZE = 50;
const UNASSIGNED = "unassigned";

/** Solo aporta info si la descripción original difiere del nombre visible del servicio. */
function secondaryDescription(row: SalesDetailRow): string | null {
  const original = row.originalDescription?.trim();
  if (!original) return null;
  if (original === row.productName.trim()) return null;
  if (original === "(Sin concepto)") return null;
  return original;
}

export function VentasDetalleTab({
  preset,
  from,
  to,
  year,
  month,
}: {
  /** Período por preset (this_month, year, …). */
  preset?: SalesPeriodPreset;
  /** Rango personalizado (YYYY-MM-DD). */
  from?: string;
  to?: string;
  /** Mes con nombre del año en curso. */
  year?: number;
  month?: number;
}) {
  const [rows, setRows] = useState<SalesDetailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState<"all" | "UYU" | "USD">("all");
  const [seller, setSeller] = useState<string>("all");

  const [people, setPeople] = useState<SalespersonRow[]>([]);
  const [detailRow, setDetailRow] = useState<SalesDetailRow | null>(null);

  /** Serializa el período recibido (preset · mes · rango) para la API. */
  const periodKey = useMemo(() => {
    const p = new URLSearchParams();
    if (year != null && month != null) {
      p.set("year", String(year));
      p.set("month", String(month));
    } else if (from && to) {
      p.set("from", from);
      p.set("to", to);
    } else {
      p.set("preset", preset ?? "this_month");
    }
    return p.toString();
  }, [preset, from, to, year, month]);

  const qs = useMemo(() => {
    const p = new URLSearchParams(periodKey);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    if (search.trim()) p.set("search", search.trim());
    if (currency !== "all") p.set("currencies", currency);
    if (seller !== "all") p.set("sellerIds", seller);
    return p.toString();
  }, [periodKey, page, search, currency, seller]);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/copilot/sales/salespersons", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && res.ok && json.ok) setPeople((json.data as SalespersonRow[]).filter((p) => p.active));
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, currency, seller, periodKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageTo = Math.min(page * PAGE_SIZE, total);

  const columns: CopilotResponsiveTableColumn<SalesDetailRow>[] = [
    {
      key: "date",
      header: "Fecha",
      className: "text-left",
      cellClassName: "tabular-nums text-xs",
      render: (r) => formatDateShort(r.date),
    },
    {
      key: "cust",
      header: "Cliente",
      className: "text-left",
      render: (r) => <span className="text-[var(--copilot-ink)]">{r.customerName}</span>,
    },
    {
      key: "doc",
      header: "Documento",
      className: "text-left",
      cellClassName: "text-xs",
      render: (r) => `${r.documentType} ${r.documentNumber ?? ""}`.trim(),
    },
    {
      key: "tipo",
      header: "Tipo",
      className: "text-left",
      render: (r) => <DocKindBadge row={r} />,
    },
    {
      key: "svc",
      header: "Servicio",
      className: "text-left",
      render: (r) => {
        const sub = secondaryDescription(r);
        return (
          <div className="min-w-0">
            <p className="truncate text-[var(--copilot-ink)]">{r.productName}</p>
            {sub ? <p className="truncate text-xs text-[var(--copilot-ink-muted)]">{sub}</p> : null}
          </div>
        );
      },
    },
    {
      key: "cur",
      header: "Moneda",
      className: "text-center",
      cellClassName: "text-center",
      render: (r) => r.currency,
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      cellClassName: "text-right tabular-nums",
      render: (r) => {
        const amount = formatMoneyCurrency(r.lineAmount, r.currency === "UNKNOWN" ? "UYU" : r.currency);
        if (r.kind === "credit_note") {
          return <span className="text-[var(--copilot-warning-text-strong)]">− {amount}</span>;
        }
        return amount;
      },
    },
    {
      key: "seller",
      header: "Vendedor",
      className: "text-left",
      cellClassName: "text-xs",
      render: (r) => (
        <SellerSelect
          documentId={r.documentId}
          sellerId={r.sellerId}
          sellerName={r.sellerName}
          kind={r.kind}
          people={people}
          onAssigned={() => void load()}
        />
      ),
    },
    {
      key: "act",
      header: "Acciones",
      className: "text-left",
      render: (r) => (
        <button
          type="button"
          className="text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
          aria-label={`Ver detalle de ${r.productName}`}
          onClick={(e) => {
            e.stopPropagation();
            setDetailRow(r);
          }}
        >
          Ver detalle
        </button>
      ),
    },
  ];

  return (
    <section className={copilotCardStandardClass}>
      <h2 className={copilotSectionTitleClass}>Detalle de ventas</h2>
      <p className={`${copilotCaptionClass} mt-1`}>
        Vendedor = quién realizó esta operación puntual (asignación manual). El ejecutivo del cliente (cartera) se
        gestiona por separado en Clientes.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cliente, servicio, documento…"
          aria-label="Buscar en el detalle"
          className="h-9 min-w-[200px] flex-1 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as typeof currency)}
          aria-label="Moneda"
          className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)]"
        >
          <option value="all">Todas las monedas</option>
          <option value="UYU">UYU</option>
          <option value="USD">USD</option>
        </select>
        <select
          value={seller}
          onChange={(e) => setSeller(e.target.value)}
          aria-label="Vendedor"
          className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)]"
        >
          <option value="all">Todos los vendedores</option>
          <option value={UNASSIGNED}>Sin vendedor identificado</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>

      <p className={`${copilotCaptionClass} mt-2`}>
        El vendedor se asigna manualmente por comprobante y es independiente del ejecutivo del cliente (pestaña
        Clientes). Las notas de crédito no admiten asignación.
      </p>

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
              minWidth="1040px"
              emptyState={
                <EmptyState icon={<ListFilter className="h-6 w-6" />} title="No encontramos ventas con estos filtros." variant="compact" />
              }
              mobileCard={(r) => {
                const sub = secondaryDescription(r);
                return (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-[var(--copilot-ink)]">{r.customerName}</p>
                      <StatusBadge tone={r.kind === "credit_note" ? "warning" : "neutral"}>{r.currency}</StatusBadge>
                    </div>
                    <p className="text-xs text-[var(--copilot-ink-muted)]">
                      {formatDateShort(r.date)} · {r.productName}
                      {sub ? ` · ${sub}` : ""}
                    </p>
                    <p className="text-xs text-[var(--copilot-ink-muted)]">
                      Vendedor: {r.kind === "credit_note" ? "—" : (r.sellerName ?? "Sin vendedor identificado")}
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {formatMoneyCurrency(r.lineAmount, r.currency === "UNKNOWN" ? "UYU" : r.currency)}
                    </p>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--copilot-accent)]"
                      onClick={() => setDetailRow(r)}
                    >
                      Ver detalle
                    </button>
                  </div>
                );
              }}
            />
            <div className="mt-3">
              <TablePagination
                page={page}
                totalPages={totalPages}
                from={pageFrom}
                to={pageTo}
                total={total}
                itemLabel="líneas"
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>

      {detailRow ? (
        <VentasAnalyticsDrawer title="Detalle de la venta" wide={false} onClose={() => setDetailRow(null)}>
          <DrawerSection title="Comprobante">
            <DrawerStatGrid
              items={[
                { label: "Cliente", value: detailRow.customerName },
                {
                  label: "Documento",
                  value: `${detailRow.documentType} ${detailRow.documentNumber ?? ""}`.trim(),
                },
                { label: "Fecha", value: formatDateShort(detailRow.date) },
                { label: "Vencimiento", value: formatDateShort(detailRow.dueDate) },
                { label: "Servicio", value: detailRow.productName },
                {
                  label: "Concepto original",
                  value: detailRow.originalConcept ?? detailRow.originalDescription ?? "—",
                },
                { label: "Código Zeta", value: detailRow.originalCode ?? "—" },
                {
                  label: "Cantidad facturada",
                  value: detailRow.quantity.toLocaleString("es-UY", { maximumFractionDigits: 2 }),
                },
                {
                  label: "Precio unitario",
                  value:
                    detailRow.unitPrice == null
                      ? "—"
                      : formatMoneyCurrency(detailRow.unitPrice, detailRow.currency === "UNKNOWN" ? "UYU" : detailRow.currency),
                },
                {
                  label: "Neto",
                  value:
                    detailRow.netAmount == null
                      ? "—"
                      : formatMoneyCurrency(detailRow.netAmount, detailRow.currency === "UNKNOWN" ? "UYU" : detailRow.currency),
                },
                {
                  label: "IVA",
                  value:
                    detailRow.taxAmount == null
                      ? "—"
                      : formatMoneyCurrency(detailRow.taxAmount, detailRow.currency === "UNKNOWN" ? "UYU" : detailRow.currency),
                },
                {
                  label: "Total",
                  value: formatMoneyCurrency(
                    detailRow.lineAmount,
                    detailRow.currency === "UNKNOWN" ? "UYU" : detailRow.currency
                  ),
                },
                { label: "Moneda", value: detailRow.currency },
                {
                  label: "Vendedor",
                  value:
                    detailRow.kind === "credit_note"
                      ? "—"
                      : detailRow.sellerName ?? "Sin vendedor identificado",
                },
                {
                  label: "Cobrado (doc.)",
                  value:
                    detailRow.currency === "USD"
                      ? formatUsdOrDash(detailRow.docApplied)
                      : formatUyuOrDash(detailRow.docApplied),
                },
                {
                  label: "Pendiente (doc.)",
                  value:
                    detailRow.currency === "USD"
                      ? formatUsdOrDash(detailRow.docPending)
                      : formatUyuOrDash(detailRow.docPending),
                },
              ]}
            />
          </DrawerSection>
          <div className="flex flex-col gap-2">
            {detailRow.customerId ? (
              <a
                href={clientFichaHref(detailRow.customerId)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
              >
                Abrir Cliente 360 <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : null}
            {detailRow.kind === "sale" ? (
              <div className="flex items-center gap-2">
                <span className={copilotCaptionClass}>Cambiar vendedor:</span>
                <SellerSelect
                  documentId={detailRow.documentId}
                  sellerId={detailRow.sellerId}
                  sellerName={detailRow.sellerName}
                  kind={detailRow.kind}
                  people={people}
                  onAssigned={(nextId) => {
                    setDetailRow((prev) =>
                      prev
                        ? {
                            ...prev,
                            sellerId: nextId,
                            sellerName: people.find((p) => p.id === nextId)?.displayName ?? null,
                          }
                        : prev
                    );
                    void load();
                  }}
                />
              </div>
            ) : null}
            <p className={copilotCaptionClass}>
              El ejecutivo del cliente se administra en la pestaña Clientes y no determina el vendedor de esta
              operación.
            </p>
          </div>
        </VentasAnalyticsDrawer>
      ) : null}
    </section>
  );
}

/** Etiqueta de tipo de comprobante: Factura / Nota de crédito / Anulado. */
function DocKindBadge({ row }: { row: SalesDetailRow }) {
  if (/anul/i.test(row.documentType)) {
    return <StatusBadge tone="danger">Anulado</StatusBadge>;
  }
  if (row.kind === "credit_note") {
    return <StatusBadge tone="warning">Nota de crédito</StatusBadge>;
  }
  return <StatusBadge tone="neutral">Factura</StatusBadge>;
}
