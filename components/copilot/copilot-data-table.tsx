"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, ChevronDown, ChevronUp } from "lucide-react";

import { CopilotInteractiveText } from "@/components/copilot/copilot-interactive-text";
import {
  formatCopilotDataCell,
  sharedObligationPaymentStatusPillClass,
} from "@/lib/copilot-format";
import type { DataEntity, DataRow } from "@/lib/copilot-data";
import { companyCellValue, companyPrimaryLabel } from "@/lib/copilot-datos-company-display";
import {
  formatInvoiceFacturaPrimary,
  formatInvoiceFacturaTechnicalSubtitle,
  readInvoiceCurrency,
} from "@/lib/copilot-datos-invoice-display";
import { formatReceiptAmountWithCurrency } from "@/lib/copilot-datos-receipt-display";
import { INVOICE_CLIENT_CODIGO_KEY, INVOICE_CLIENT_RAZON_KEY } from "@/lib/copilot-datos-invoices-ui";
import { CopilotPremiumEmptyState } from "@/components/copilot/copilot-premium-empty-state";

const ENTITY_EMPTY_COPY: Record<
  DataEntity,
  { title: string; why: string; whatToDo: string; whatHappens: string }
> = {
  companies: {
    title: "No hay clientes en esta vista",
    why: "El filtro activo o la sincronización aún no trajo empresas para listar.",
    whatToDo: "Ampliá el filtro (Activos/Todos) o verificá la sincronización con Zeta.",
    whatHappens: "Cuando haya clientes, vas a ver razón social, código y estado acá.",
  },
  contacts: {
    title: "No hay contactos en esta vista",
    why: "Todavía no hay contactos cargados o el filtro los oculta.",
    whatToDo: "Revisá clientes en Zeta o agregá contactos desde la ficha del cliente.",
    whatHappens: "Aparecerán emails y teléfonos útiles para cobranza.",
  },
  invoices: {
    title: "No hay facturas en esta vista",
    why: "El período o filtros elegidos no tienen comprobantes pendientes.",
    whatToDo: "Probá «Mes actual», otro rango de fechas o quitá filtros de saldo.",
    whatHappens: "Verás facturas con saldo, moneda y antigüedad para conciliar cobranza.",
  },
  receipts: {
    title: "No hay recibos en esta vista",
    why: "No hay cobros registrados en el período o filtro seleccionado.",
    whatToDo: "Ampliá el rango de fechas o sincronizá recibos desde Zeta.",
    whatHappens: "Los cobros del período aparecerán con cliente, importe y medio de pago.",
  },
  payments: {
    title: "No hay pagos en esta vista",
    why: "No hay egresos registrados con los filtros actuales.",
    whatToDo: "Revisá Tesorería o ampliá el rango si esperás movimientos.",
    whatHappens: "Los pagos cargados se listarán con fecha, concepto e importe.",
  },
  tax_obligations: {
    title: "No hay obligaciones fiscales en esta vista",
    why: "El calendario fiscal aún no tiene vencimientos para mostrar.",
    whatToDo: "Configurá obligaciones fiscales o importá el calendario correspondiente.",
    whatHappens: "Verás vencimientos, montos estimados y estado de cumplimiento.",
  },
};

function sortableCellValue(entity: DataEntity, row: DataRow, colKey: string): unknown {
  if (entity === "invoices" && colKey === "invoice_number") {
    return formatInvoiceFacturaPrimary(row);
  }
  if (entity === "invoices" && colKey === "currency_code") {
    return readInvoiceCurrency(row) ?? "";
  }
  if (entity === "invoices" && colKey === "collection_probability") {
    const n = normalizeCollectionProbabilityToScale10(row[colKey]);
    return n ?? -1;
  }
  if (entity === "companies") {
    return companyCellValue(row, colKey);
  }
  return row[colKey];
}

function statusPillEntities(entity: DataEntity): boolean {
  return entity === "payments" || entity === "receipts" || entity === "tax_obligations";
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatInvoiceAmountWithCurrency(row: DataRow, v: unknown): string {
  const n = parseAmount(v);
  if (n == null) return "—";
  const cur = readInvoiceCurrency(row);
  const formatted = n.toLocaleString("es-UY", { maximumFractionDigits: 2 });
  return cur ? `${cur} ${formatted}` : `${formatted} · sin moneda`;
}

function normalizeCollectionProbabilityToScale10(v: unknown): number | null {
  const n = parseAmount(v);
  if (n == null || !Number.isFinite(n)) return null;
  if (n <= 0) return 1;
  if (n <= 1) {
    return Math.min(10, Math.max(1, Math.round(n * 10)));
  }
  return Math.min(10, Math.max(1, Math.round(n)));
}

function collectionProbabilityTone(score: number): "red" | "yellow" | "green" {
  if (score <= 3) return "red";
  if (score <= 7) return "yellow";
  return "green";
}

function renderCollectionProbabilityCell(v: unknown) {
  const score = normalizeCollectionProbabilityToScale10(v);
  if (score == null) {
    return <span className="text-[var(--copilot-ink-muted)]">—</span>;
  }
  const tone = collectionProbabilityTone(score);
  const palette =
    tone === "red"
      ? "bg-rose-100 text-rose-800 ring-rose-200"
      : tone === "yellow"
        ? "bg-amber-100 text-amber-800 ring-amber-200"
        : "bg-emerald-100 text-emerald-800 ring-emerald-200";
  const dot =
    tone === "red"
      ? "bg-rose-500"
      : tone === "yellow"
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <span
      className={`inline-flex items-center justify-end gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ${palette}`}
      title={`Probabilidad de cobro: ${score}/10`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {score}
    </span>
  );
}

function invoiceHeaderClass(colKey: string): string {
  const base =
    "border-b border-[var(--copilot-border)] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]";
  if (colKey === "invoice_number") return `${base} w-[150px]`;
  if (colKey === INVOICE_CLIENT_CODIGO_KEY) return `${base} w-[60px]`;
  if (colKey === INVOICE_CLIENT_RAZON_KEY) return `${base} min-w-[260px]`;
  if (colKey === "issue_date") return `${base} w-[96px]`;
  if (colKey === "currency_code") return `${base} w-[56px] text-center`;
  if (colKey === "total_amount" || colKey === "balance_amount") return `${base} w-[130px] text-right`;
  if (colKey === "collection_probability") return `${base} w-[70px] text-right`;
  return base;
}

function invoiceCellClass(colKey: string): string {
  const base = "max-w-[280px] truncate px-3 py-2 text-sm text-[var(--copilot-ink)]";
  if (colKey === INVOICE_CLIENT_RAZON_KEY) return `${base} max-w-[420px]`;
  if (colKey === INVOICE_CLIENT_CODIGO_KEY) return `${base} w-[60px] text-center tabular-nums`;
  if (colKey === "issue_date") return `${base} w-[96px]`;
  if (colKey === "currency_code") return `${base} w-[56px] text-center font-mono font-semibold`;
  if (colKey === "total_amount" || colKey === "balance_amount") return `${base} w-[130px] text-right tabular-nums`;
  if (colKey === "collection_probability") return `${base} w-[70px] text-right tabular-nums`;
  return base;
}

/**
 * Alineación coherente con invoices para la única columna numérica con moneda en recibos (`amount`).
 * Resto de columnas (Recibo, Fecha, Método, Estado) conservan los estilos genéricos previos.
 */
function receiptHeaderClass(colKey: string): string {
  const base =
    "border-b border-[var(--copilot-border)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]";
  if (colKey === "amount") return `${base} text-right`;
  return base;
}

function receiptCellClass(colKey: string): string {
  const base = "max-w-[280px] truncate px-4 py-3 text-sm text-[var(--copilot-ink)]";
  if (colKey === "amount") return `${base} text-right tabular-nums`;
  return base;
}

export type DataColumn = {
  key: string;
  label: string;
};

type SortDirection = "asc" | "desc";

export function CopilotDataTable({
  data,
  columns,
  entity,
  selectedRowId,
  onRowClick,
  interactiveColumnKeys = [],
  inactiveBadge = false,
  defaultSortKey,
  defaultSortDir = "desc",
}: {
  data: DataRow[];
  columns: DataColumn[];
  entity: DataEntity;
  selectedRowId?: string | null;
  onRowClick: (row: DataRow) => void;
  /** Columnas cuyo valor se muestra como texto interactivo (abre detalle; no propaga al `tr`). */
  interactiveColumnKeys?: string[];
  /** Muestra badge "Inactivo" cuando `is_active === false` (vista con archivados). */
  inactiveBadge?: boolean;
  /** Columna de orden inicial. Omitir para usar la primera columna. */
  defaultSortKey?: string;
  /** Dirección de orden inicial. Default: "desc". */
  defaultSortDir?: SortDirection;
}) {
  const columnKeySig = columns.map((c) => c.key).join("|");
  const resolvedDefaultKey = defaultSortKey ?? columns[0]?.key ?? "";
  const [sortKey, setSortKey] = useState<string>(resolvedDefaultKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDir);
  const sortResetKey = `${entity}|${columnKeySig}|${defaultSortKey ?? ""}|${defaultSortDir}`;
  const [appliedSortResetKey, setAppliedSortResetKey] = useState(sortResetKey);

  if (appliedSortResetKey !== sortResetKey) {
    setAppliedSortResetKey(sortResetKey);
    setSortKey(defaultSortKey ?? columns[0]?.key ?? "");
    setSortDirection(defaultSortDir);
  }

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const list = [...data];
    list.sort((a, b) => {
      const av = sortableCellValue(entity, a, sortKey);
      const bv = sortableCellValue(entity, b, sortKey);
      const left = av == null ? "" : String(av).toLowerCase().trim();
      const right = bv == null ? "" : String(bv).toLowerCase().trim();
      if (left < right) return sortDirection === "asc" ? -1 : 1;
      if (left > right) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [data, entity, sortDirection, sortKey]);

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80">
      <div className="max-h-[60vh] overflow-auto">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--copilot-card)]">
            <tr>
              {inactiveBadge && entity !== "invoices" ? (
                <th className="w-24 border-b border-[var(--copilot-border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Activo
                </th>
              ) : null}
              {columns.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    className={
                      entity === "invoices"
                        ? invoiceHeaderClass(col.key)
                        : entity === "receipts"
                          ? receiptHeaderClass(col.key)
                          : "border-b border-[var(--copilot-border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center gap-1.5 hover:text-[var(--copilot-ink)]"
                    >
                      {col.label}
                      {active ? (
                        sortDirection === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        )
                      ) : (
                        <ArrowDownUp className="h-3.5 w-3.5 opacity-60" aria-hidden />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-4"
                  colSpan={((inactiveBadge && entity !== "invoices") ? 1 : 0) + (columns.length || 1)}
                >
                  <CopilotPremiumEmptyState {...ENTITY_EMPTY_COPY[entity]} />
                </td>
              </tr>
            ) : null}
            {sortedData.map((row, i) => {
              const rowId = String(row.id ?? i);
              const selected = selectedRowId != null && rowId === selectedRowId;
              const isInactive = row.is_active === false;
              return (
                <tr
                  key={rowId}
                  onClick={() => onRowClick(row)}
                  className={`cursor-pointer border-b border-[var(--copilot-border)] transition last:border-b-0 hover:bg-[var(--copilot-accent-soft)]/60 ${
                    selected ? "bg-[var(--copilot-accent-soft)] ring-1 ring-inset ring-[rgba(31,107,74,0.22)]" : ""
                  }`}
                >
                  {inactiveBadge && entity !== "invoices" ? (
                    <td className="px-3 py-2 align-middle">
                      {isInactive ? (
                        <span className="inline-flex rounded-full bg-[rgba(44,40,37,0.12)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          Inactivo
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--copilot-ink-muted)]">—</span>
                      )}
                    </td>
                  ) : null}
                  {columns.map((col) => {
                    const value =
                      entity === "companies"
                        ? companyCellValue(row, col.key)
                        : row[col.key];
                    const isInvoiceFacturaCol = entity === "invoices" && col.key === "invoice_number";
                    const facturaPrimary = isInvoiceFacturaCol ? formatInvoiceFacturaPrimary(row) : null;
                    const raw =
                      entity === "companies" && col.key === "RazonSocial"
                        ? companyPrimaryLabel(row)
                        : entity === "invoices" && col.key === "collection_probability"
                          ? String(normalizeCollectionProbabilityToScale10(value) ?? "—")
                        : entity === "invoices" && col.key === "currency_code"
                          ? (readInvoiceCurrency(row) ?? "—")
                        : entity === "invoices" &&
                            (col.key === "total_amount" || col.key === "balance_amount")
                          ? formatInvoiceAmountWithCurrency(row, value)
                        : entity === "receipts" && col.key === "amount"
                          ? formatReceiptAmountWithCurrency(row, value)
                        : isInvoiceFacturaCol && facturaPrimary && facturaPrimary !== "—"
                          ? facturaPrimary
                          : formatCopilotDataCell(entity, col.key, value);
                    const interactive = interactiveColumnKeys.includes(col.key);
                    const statusPill =
                      col.key === "status" &&
                      statusPillEntities(entity) &&
                      typeof value === "string" &&
                      value.trim() !== "";
                    const collectionProbPill = entity === "invoices" && col.key === "collection_probability";
                    const cellInner = statusPill ? (
                      <span
                        className={sharedObligationPaymentStatusPillClass(value)}
                        title={raw}
                      >
                        {raw}
                      </span>
                    ) : collectionProbPill ? (
                      renderCollectionProbabilityCell(value)
                    ) : interactive ? (
                      <CopilotInteractiveText
                        layout="block"
                        icon="panel"
                        className="text-sm font-medium"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowClick(row);
                        }}
                      >
                        {isInvoiceFacturaCol && facturaPrimary && facturaPrimary !== "—" ? (
                          <span className="font-medium">{facturaPrimary}</span>
                        ) : (
                          raw
                        )}
                      </CopilotInteractiveText>
                    ) : isInvoiceFacturaCol && facturaPrimary && facturaPrimary !== "—" ? (
                      <span className="font-medium">{facturaPrimary}</span>
                    ) : (
                      raw
                    );
                    const techSub =
                      isInvoiceFacturaCol && facturaPrimary && facturaPrimary !== "—"
                        ? formatInvoiceFacturaTechnicalSubtitle(row, facturaPrimary)
                        : null;
                    const cellTitle =
                      techSub != null
                        ? `${facturaPrimary} · ref. interna: ${techSub}`
                        : raw;
                    return (
                      <td
                        key={`${rowId}-${col.key}`}
                        className={
                          entity === "invoices"
                            ? invoiceCellClass(col.key)
                            : entity === "receipts"
                              ? receiptCellClass(col.key)
                              : "max-w-[280px] truncate px-3 py-2 text-sm text-[var(--copilot-ink)]"
                        }
                        title={cellTitle}
                      >
                        {cellInner}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
