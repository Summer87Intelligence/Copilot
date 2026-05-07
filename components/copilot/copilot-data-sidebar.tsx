"use client";

import { useEffect, useMemo, useState } from "react";

import { CopilotDataTrainingBlock } from "@/components/copilot/copilot-data-training-block";
import { CopilotGhostButton } from "@/components/copilot/copilot-ui";
import { InvoiceOperationalCallout } from "@/components/copilot/invoice-operational-callout";
import type { CopilotSeverity } from "@/lib/copilot-alerts-evidence-mock";
import type { DataEntity, DataRow } from "@/lib/copilot-data";
import { DATA_TRAINING } from "@/lib/copilot-data-integrity";
import {
  formatCopilotDataCell,
  sharedObligationPaymentStatusPillClass,
} from "@/lib/copilot-format";
import { companyPrimaryLabel } from "@/lib/copilot-datos-company-display";
import {
  formatInvoiceFacturaPrimary,
  readInvoiceCurrency,
} from "@/lib/copilot-datos-invoice-display";
import {
  formatReceiptAmountWithCurrency,
  readReceiptCurrency,
  readReceiptCurrencyIso,
} from "@/lib/copilot-datos-receipt-display";
import {
  getProtoCompanyById,
  getProtoContactsByCompany,
  getProtoInvoiceById,
  getProtoInvoicesByCompany,
  getProtoPaymentsByCompany,
  getProtoReceiptsByCompany,
  getProtoReceiptsByInvoice,
} from "@/lib/copilot-data";

function rowTitle(row: DataRow, entity?: DataEntity): string {
  if (entity === "companies") {
    return companyPrimaryLabel(row);
  }
  if (entity === "invoices") {
    const label = formatInvoiceFacturaPrimary(row);
    if (label && label !== "—") return label;
  }
  return String(
    row.full_name ??
      row.name ??
      row.invoice_number ??
      row.payment_number ??
      row.receipt_number ??
      row.file_name ??
      row.id ??
      "Registro"
  );
}

function compactDate(row: DataRow): string {
  const raw =
    row.created_at ?? row.issue_date ?? row.due_date ?? row.receipt_date ?? row.payment_date;
  if (!raw) return "—";
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString("es-UY");
}

function compactAmount(row: DataRow, rowEntity: DataEntity): string {
  const amount = row.amount ?? row.total_amount ?? row.balance_amount;
  if (amount == null) return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  /**
   * Para receipts/payments la fuente de verdad es `readReceiptCurrency` (lee
   * `currency_code` + fallbacks a `notes.zeta_collection_receipt_v1`); para el resto
   * (invoices, etc.) sigue valiendo `readInvoiceCurrency` (lee `zeta_metadata`).
   * Mezclar helpers entre entidades es lo que producía el mismatch grilla↔sidebar.
   */
  const cur =
    rowEntity === "receipts" || rowEntity === "payments"
      ? readReceiptCurrency(row)
      : readInvoiceCurrency(row);
  const formatted = n.toLocaleString("es-UY");
  return cur ? `${cur} ${formatted}` : formatted;
}

const INVOICE_SIDEBAR_LABELS: Record<string, string> = {
  issue_date: "Emisión",
  due_date: "Vencimiento",
  total_amount: "Importe total",
  balance_amount: "Saldo",
  currency_code: "Moneda",
  status: "Estado",
  category: "Categoría",
  notes: "Notas",
  collection_probability: "Prob. cobro",
};

/** Campos a mostrar (en orden) en el panel de detalle de facturas. */
const INVOICE_SIDEBAR_PRIORITY = [
  "issue_date",
  "due_date",
  "total_amount",
  "balance_amount",
  "currency_code",
  "status",
  "category",
  "notes",
  "collection_probability",
] as const;

/** Campos técnicos o legacy que NO se muestran en el panel de detalle de facturas. */
const INVOICE_SIDEBAR_SKIP = new Set([
  "id",
  "workspace_company_id",
  "company_id",
  "invoice_number",
  "zeta_metadata",
  "is_active",
  "created_at",
  "updated_at",
  // campos legacy de moneda — sustituidos por currency_code vía readInvoiceCurrency
  "currency",
  "moneda",
  "moneda_codigo",
  // columnas virtuales de enriquecimiento de cliente
  "client_codigo_display",
  "client_razon_display",
]);

/** Renderiza el valor de un campo de factura en el sidebar usando readInvoiceCurrency para moneda. */
function formatInvoiceSidebarCellValue(row: DataRow, k: string, v: unknown): string {
  if (
    k === "currency_code" ||
    k === "currency" ||
    k === "moneda" ||
    k === "moneda_codigo"
  ) {
    return readInvoiceCurrency(row) ?? "—";
  }
  if (k === "total_amount" || k === "balance_amount") {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    const cur = readInvoiceCurrency(row);
    const formatted = n.toLocaleString("es-UY", { maximumFractionDigits: 2 });
    return cur ? `${cur} ${formatted}` : formatted;
  }
  return formatCopilotDataCell("invoices", k, v);
}

const RECEIPT_SIDEBAR_LABELS: Record<string, string> = {
  receipt_number: "Recibo",
  receipt_date: "Fecha",
  amount: "Monto",
  currency_code: "Moneda",
  payment_method: "Método",
  status: "Estado",
  reference: "Referencia",
  notes: "Notas",
};

/** Campos a mostrar (en orden) en el panel de detalle de recibos. */
const RECEIPT_SIDEBAR_PRIORITY = [
  "receipt_number",
  "receipt_date",
  "amount",
  "currency_code",
  "payment_method",
  "status",
  "reference",
] as const;

/**
 * Campos técnicos / legacy que NO se muestran en el detalle de recibos.
 *  - `notes` queda fuera porque es el JSON `zeta_collection_receipt_v1` (gigante, ya lo
 *    consume `readReceiptCurrency` internamente).
 *  - Las claves legacy de moneda se omiten para evitar valores divergentes con la grilla.
 */
const RECEIPT_SIDEBAR_SKIP = new Set([
  "id",
  "workspace_company_id",
  "company_id",
  "invoice_id",
  "is_active",
  "created_at",
  "updated_at",
  "notes",
  "currency",
  "moneda",
  "moneda_codigo",
  "moneda_simbolo",
]);

/**
 * Renderiza un campo del sidebar de recibos. Reutiliza EXACTAMENTE los mismos helpers que
 * la grilla (`readReceiptCurrency` / `formatReceiptAmountWithCurrency`) para garantizar
 * consistencia tabla↔sidebar (USD↔U$S, UYU↔$, "—" cuando no hay info).
 */
function formatReceiptSidebarCellValue(row: DataRow, k: string, v: unknown): string {
  if (
    k === "currency_code" ||
    k === "currency" ||
    k === "moneda" ||
    k === "moneda_codigo" ||
    k === "moneda_simbolo"
  ) {
    return readReceiptCurrencyIso(row) ?? "—";
  }
  if (k === "amount") {
    return formatReceiptAmountWithCurrency(row, v);
  }
  return formatCopilotDataCell("receipts", k, v);
}

function CompactList({
  title,
  rows,
  rowEntity,
}: {
  title: string;
  rows: DataRow[];
  rowEntity: DataEntity;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {title} ({rows.length})
      </h4>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--copilot-ink-muted)]">Sin registros relacionados.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.slice(0, 10).map((r, i) => (
            <li
              key={String(r.id ?? i)}
              className="space-y-1 rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-2 text-sm text-[var(--copilot-ink)]"
            >
              <p className="font-medium">{rowTitle(r, rowEntity)}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--copilot-ink-muted)]">
                <span className="inline-flex flex-wrap items-center gap-1">
                  Estado:{" "}
                  {rowEntity === "payments" ||
                  rowEntity === "receipts" ||
                  rowEntity === "tax_obligations" ? (
                    typeof r.status === "string" && r.status.trim() !== "" ? (
                      <span
                        className={sharedObligationPaymentStatusPillClass(r.status)}
                      >
                        {formatCopilotDataCell(rowEntity, "status", r.status)}
                      </span>
                    ) : (
                      formatCopilotDataCell(rowEntity, "status", r.status)
                    )
                  ) : (
                    formatCopilotDataCell(rowEntity, "status", r.status)
                  )}
                </span>
                <span>Monto: {compactAmount(r, rowEntity)}</span>
                <span>Fecha: {compactDate(r)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const CRUD_ENTITIES: DataEntity[] = [
  "companies",
  "invoices",
  "receipts",
  "payments",
  "tax_obligations",
];

/** Etiqueta visible en el encabezado del panel (no confundir con `DataEntity` técnico). */
const DETAIL_ENTITY_LABEL: Record<DataEntity, string> = {
  companies: "Cliente",
  contacts: "Contacto",
  invoices: "Factura",
  receipts: "Recibo",
  payments: "Pago",
  tax_obligations: "Obligación fiscal",
};

function sidebarCrudTraining(
  entity: DataEntity
): { severity: CopilotSeverity; paragraphs: readonly string[] } | null {
  switch (entity) {
    case "companies":
      return DATA_TRAINING.companies;
    case "invoices":
      return DATA_TRAINING.invoices;
    case "receipts":
      return DATA_TRAINING.receipts;
    case "payments":
      return DATA_TRAINING.payments;
    case "tax_obligations":
      return DATA_TRAINING.tax_obligations;
    default:
      return null;
  }
}

export function CopilotDataSidebar({
  entity,
  row,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onRestore,
  restoreBusy,
}: {
  entity: DataEntity;
  row: DataRow | null;
  isOpen: boolean;
  onClose: () => void;
  /** Solo entidades con CRUD en Datos. */
  onEdit?: () => void;
  /** Archivar (registro activo). */
  onDelete?: () => void;
  /** Reactivar (registro inactivo). */
  onRestore?: () => void;
  /** Deshabilita el botón Reactivar mientras corre la petición. */
  restoreBusy?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<DataRow | null>(null);
  const [contacts, setContacts] = useState<DataRow[]>([]);
  const [invoices, setInvoices] = useState<DataRow[]>([]);
  const [receipts, setReceipts] = useState<DataRow[]>([]);
  const [payments, setPayments] = useState<DataRow[]>([]);
  const [invoice, setInvoice] = useState<DataRow | null>(null);

  const baseFields = useMemo(() => {
    if (!row) return [] as Array<[string, unknown]>;
    if (entity === "companies") {
      const priority = [
        "Codigo",
        "RazonSocial",
        "Nombre",
        "Documento",
        "DocumentoTipo",
        "DocumentoSigla",
        "Email1",
        "Telefono",
        "Celular",
        "DireccionCompleta",
        "Direccion",
        "Localidad",
        "RUT",
        "GiroNombre",
        "ContactoActivo",
        "status",
        "risk_level",
        "is_active",
        "workspace_company_id",
      ] as const;
      const ordered: string[] = [];
      for (const k of priority) {
        if (k in row) ordered.push(k);
      }
      for (const k of Object.keys(row)) {
        if (!ordered.includes(k)) ordered.push(k);
      }
      return ordered.slice(0, 24).map((k) => [k, row[k]] as [string, unknown]);
    }
    if (entity === "invoices") {
      const ordered: string[] = [];
      for (const k of INVOICE_SIDEBAR_PRIORITY) {
        if (k in row) ordered.push(k);
      }
      for (const k of Object.keys(row)) {
        if (!ordered.includes(k) && !INVOICE_SIDEBAR_SKIP.has(k)) ordered.push(k);
      }
      return ordered.slice(0, 12).map((k) => [k, row[k]] as [string, unknown]);
    }
    if (entity === "receipts") {
      const ordered: string[] = [];
      for (const k of RECEIPT_SIDEBAR_PRIORITY) {
        if (k in row) ordered.push(k);
      }
      for (const k of Object.keys(row)) {
        if (!ordered.includes(k) && !RECEIPT_SIDEBAR_SKIP.has(k)) ordered.push(k);
      }
      // Garantizamos que `currency_code` aparezca aunque sea NULL en DB: la moneda real
      // se deriva por `readReceiptCurrencyIso` desde la cadena de fallbacks de la grilla.
      if (!ordered.includes("currency_code")) {
        ordered.splice(ordered.indexOf("amount") + 1 || ordered.length, 0, "currency_code");
      }
      return ordered.slice(0, 10).map((k) => [k, row[k]] as [string, unknown]);
    }
    const keys = Object.keys(row).slice(0, 8);
    return keys.map((k) => [k, row[k]] as [string, unknown]);
  }, [row, entity]);

  useEffect(() => {
    if (!isOpen || !row) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      setCompany(null);
      setContacts([]);
      setInvoices([]);
      setReceipts([]);
      setPayments([]);
      setInvoice(null);
      try {
        if (entity === "companies") {
          const companyId = String(row.id ?? "");
          const [cts, inv, rec, pay] = await Promise.all([
            getProtoContactsByCompany(companyId),
            getProtoInvoicesByCompany(companyId),
            getProtoReceiptsByCompany(companyId),
            getProtoPaymentsByCompany(companyId),
          ]);
          if (cancelled) return;
          setContacts(cts);
          setInvoices(inv);
          setReceipts(rec);
          setPayments(pay);
        } else if (entity === "invoices") {
          const companyId = String(row.company_id ?? "");
          const invoiceId = String(row.id ?? "");
          const [comp, rec] = await Promise.all([
            companyId ? getProtoCompanyById(companyId) : Promise.resolve(null),
            getProtoReceiptsByInvoice(invoiceId),
          ]);
          if (cancelled) return;
          setCompany(comp);
          setReceipts(rec);
        } else if (entity === "contacts") {
          const companyId = String(row.company_id ?? "");
          if (companyId) {
            const comp = await getProtoCompanyById(companyId);
            if (cancelled) return;
            setCompany(comp);
          }
        } else if (entity === "receipts") {
          const companyId = String(row.company_id ?? "");
          const invoiceId = String(row.invoice_id ?? "");
          const [comp, inv] = await Promise.all([
            companyId ? getProtoCompanyById(companyId) : Promise.resolve(null),
            invoiceId ? getProtoInvoiceById(invoiceId) : Promise.resolve(null),
          ]);
          if (cancelled) return;
          setCompany(comp);
          setInvoice(inv);
        } else if (entity === "payments") {
          const companyId = String(row.company_id ?? "");
          if (companyId) {
            const comp = await getProtoCompanyById(companyId);
            if (cancelled) return;
            setCompany(comp);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "No se pudieron cargar relaciones.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [entity, isOpen, row]);

  if (!isOpen || !row) return null;

  const rowInactive = row.is_active === false;
  const crudTip = CRUD_ENTITIES.includes(entity) ? sidebarCrudTraining(entity) : null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-30 bg-[rgba(19,23,22,0.24)]"
        onClick={onClose}
        aria-label="Cerrar panel de datos"
      />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--copilot-border)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Detalle · {DETAIL_ENTITY_LABEL[entity]}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--copilot-ink)]">{rowTitle(row, entity)}</h3>
          </div>
          <CopilotGhostButton onClick={onClose} className="px-3 py-1.5">
            Cerrar
          </CopilotGhostButton>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {error}
            </div>
          ) : null}

          {crudTip ? (
            <CopilotDataTrainingBlock
              title="Capacitación · impacto de este registro"
              severity={crudTip.severity}
              paragraphs={crudTip.paragraphs}
            />
          ) : null}

          <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Datos básicos
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {baseFields.map(([k, v]) => (
                <div key={k} className="rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    {entity === "invoices"
                      ? (INVOICE_SIDEBAR_LABELS[k] ?? k)
                      : entity === "receipts"
                        ? (RECEIPT_SIDEBAR_LABELS[k] ?? k)
                        : k}
                  </p>
                  <p className="mt-1 text-sm text-[var(--copilot-ink)]">
                    {entity === "invoices"
                      ? formatInvoiceSidebarCellValue(row, k, v)
                      : entity === "receipts"
                        ? formatReceiptSidebarCellValue(row, k, v)
                        : formatCopilotDataCell(entity, k, v)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {loading ? (
            <p className="text-sm text-[var(--copilot-ink-muted)]">Cargando relaciones…</p>
          ) : null}

          {entity === "companies" ? (
            <>
              <CompactList title="Contactos relacionados" rows={contacts} rowEntity="contacts" />
              <CompactList title="Facturas relacionadas" rows={invoices} rowEntity="invoices" />
              <CompactList title="Recibos relacionados" rows={receipts} rowEntity="receipts" />
              <CompactList title="Pagos relacionados" rows={payments} rowEntity="payments" />
            </>
          ) : null}

          {entity === "invoices" ? (
            <>
              <InvoiceOperationalCallout row={row} />
              <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Cliente
                </h4>
                <p className="text-sm text-[var(--copilot-ink)]">
                  {company ? rowTitle(company, "companies") : "Sin cliente asociado."}
                </p>
              </section>
              <CompactList title="Recibos asociados" rows={receipts} rowEntity="receipts" />
            </>
          ) : null}

          {entity === "payments" ? (
            <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Cliente
              </h4>
              <p className="text-sm text-[var(--copilot-ink)]">
                {company ? rowTitle(company, "companies") : "Sin cliente asociado."}
              </p>
            </section>
          ) : null}

          {entity === "contacts" ? (
            <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Cliente
              </h4>
              <p className="text-sm text-[var(--copilot-ink)]">
                {company ? rowTitle(company, "companies") : "Sin cliente asociado."}
              </p>
            </section>
          ) : null}

          {entity === "receipts" ? (
            <>
              <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Cliente
                </h4>
                <p className="text-sm text-[var(--copilot-ink)]">
                  {company ? rowTitle(company, "companies") : "Sin cliente asociado."}
                </p>
              </section>
              <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Factura
                </h4>
                <p className="text-sm text-[var(--copilot-ink)]">
                  {invoice ? rowTitle(invoice) : "Sin factura relacionada."}
                </p>
              </section>
            </>
          ) : null}

          {entity === "tax_obligations" ? (
            <p className="text-xs text-[var(--copilot-ink-muted)]">
              Obligación fiscal del prototipo. Los pagos asociados viven en{" "}
              <code className="rounded bg-[rgba(44,40,37,0.06)] px-1">proto_tax_payments</code>.
            </p>
          ) : null}

          {CRUD_ENTITIES.includes(entity) && onEdit && (onDelete || onRestore) ? (
            <div className="flex flex-wrap gap-2 border-t border-[var(--copilot-border)] pt-4">
              <CopilotGhostButton type="button" className="px-3 py-2" onClick={onEdit}>
                Editar
              </CopilotGhostButton>
              {rowInactive && onRestore ? (
                <button
                  type="button"
                  disabled={restoreBusy}
                  onClick={onRestore}
                  className="rounded-xl border border-[rgba(31,107,74,0.35)] bg-[var(--copilot-accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--copilot-accent)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {restoreBusy ? "Reactivando…" : "Reactivar"}
                </button>
              ) : null}
              {!rowInactive && onDelete ? (
                <button
                  type="button"
                  onClick={onDelete}
                  className="rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--copilot-ink)] transition hover:bg-white/80"
                >
                  Archivar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
