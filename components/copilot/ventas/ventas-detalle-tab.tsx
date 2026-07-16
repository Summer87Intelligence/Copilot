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
import { copilotCardStandardClass, copilotSectionTitleClass } from "@/components/copilot/ui/copilot-visual-system";
import type { SalesDetailRow } from "@/lib/sales/sales-api";
import type { SalesPeriodPreset } from "@/lib/sales/sales-period";
import type { SalespersonRow } from "@/lib/sales/sales-salesperson-repository";
import { SALESPERSON_START_DATE } from "@/lib/sales/canonical/types";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import { clientFichaHref } from "@/lib/copilot/client-360-href";
import { formatDateShort, formatUyuOrDash, formatUsdOrDash } from "@/components/copilot/ventas/ventas-format";
import {
  VentasAnalyticsDrawer,
  DrawerSection,
  DrawerStatGrid,
} from "@/components/copilot/ventas/ventas-analytics-drawer";

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
  canAssign,
  onAssignmentChange,
}: {
  preset: SalesPeriodPreset;
  canAssign: boolean;
  /** Se invoca tras una asignación exitosa para refrescar overview / Comerciales. */
  onAssignmentChange?: () => void;
}) {
  const [rows, setRows] = useState<SalesDetailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState<"all" | "UYU" | "USD">("all");
  const [salesperson, setSalesperson] = useState<string>("all");

  const [people, setPeople] = useState<SalespersonRow[]>([]);
  const [assigningDoc, setAssigningDoc] = useState<string | null>(null);
  const [assignMsg, setAssignMsg] = useState<{ tone: "positive" | "danger"; text: string } | null>(null);
  const [detailRow, setDetailRow] = useState<SalesDetailRow | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("preset", preset);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    if (search.trim()) p.set("search", search.trim());
    if (currency !== "all") p.set("currencies", currency);
    if (salesperson !== "all") p.set("salespersonIds", salesperson);
    return p.toString();
  }, [preset, page, search, currency, salesperson]);

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
  }, [search, currency, salesperson, preset]);

  const assign = useCallback(
    async (documentId: string, salespersonId: string | null) => {
      setAssigningDoc(documentId);
      setAssignMsg(null);
      try {
        const res = await fetch("/api/copilot/sales/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId, salespersonId }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setAssignMsg({ tone: "danger", text: json?.message ?? "No se pudo asignar el comercial." });
          return;
        }
        const name = salespersonId ? people.find((p) => p.id === salespersonId)?.displayName ?? null : null;
        setRows((prev) =>
          prev.map((r) => (r.documentId === documentId ? { ...r, salespersonId, salespersonName: name } : r))
        );
        setDetailRow((prev) =>
          prev && prev.documentId === documentId ? { ...prev, salespersonId, salespersonName: name } : prev
        );
        setAssignMsg({ tone: "positive", text: "Comercial actualizado." });
        onAssignmentChange?.();
      } catch {
        setAssignMsg({ tone: "danger", text: "No se pudo asignar el comercial." });
      } finally {
        setAssigningDoc(null);
      }
    },
    [people, onAssignmentChange]
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

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
      render: (r) => formatMoneyCurrency(r.lineAmount, r.currency === "UNKNOWN" ? "UYU" : r.currency),
    },
    {
      key: "sp",
      header: "Comercial",
      className: "text-left",
      render: (r) => (
        <SalespersonCell
          row={r}
          canAssign={canAssign}
          people={people}
          busy={assigningDoc === r.documentId}
          onAssign={assign}
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
          value={salesperson}
          onChange={(e) => setSalesperson(e.target.value)}
          aria-label="Comercial"
          className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm text-[var(--copilot-ink)]"
        >
          <option value="all">Todos los comerciales</option>
          <option value={UNASSIGNED}>Sin asignar</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>

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
                      Comercial: {r.salespersonName ?? "Sin asignar"}
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
                from={from}
                to={to}
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
                { label: "Comercial", value: detailRow.salespersonName ?? "Sin asignar" },
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
            {canAssign && detailRow.date.slice(0, 10) >= SALESPERSON_START_DATE ? (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Asignar comercial
                </span>
                <select
                  value={detailRow.salespersonId ?? ""}
                  disabled={assigningDoc === detailRow.documentId}
                  onChange={(e) => assign(detailRow.documentId, e.target.value || null)}
                  aria-label="Asignar comercial"
                  className="h-9 rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 text-sm"
                >
                  <option value="">Sin asignar</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </VentasAnalyticsDrawer>
      ) : null}
    </section>
  );
}

function SalespersonCell({
  row,
  canAssign,
  people,
  busy,
  onAssign,
}: {
  row: SalesDetailRow;
  canAssign: boolean;
  people: SalespersonRow[];
  busy: boolean;
  onAssign: (documentId: string, salespersonId: string | null) => void;
}) {
  const eligible = row.date.slice(0, 10) >= SALESPERSON_START_DATE;

  if (!canAssign || !eligible) {
    return (
      <span className="text-xs text-[var(--copilot-ink-muted)]">
        {row.salespersonName ?? (eligible ? "Sin asignar" : "—")}
      </span>
    );
  }

  return (
    <select
      value={row.salespersonId ?? ""}
      disabled={busy}
      onChange={(e) => onAssign(row.documentId, e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Comercial de ${row.customerName}`}
      className="h-8 max-w-[140px] rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2 text-xs text-[var(--copilot-ink)] disabled:opacity-40"
    >
      <option value="">Sin asignar</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.displayName}
        </option>
      ))}
    </select>
  );
}
