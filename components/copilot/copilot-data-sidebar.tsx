"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { CopilotClientAccountStatement } from "@/components/copilot/copilot-client-account-statement";
import { ClientCurrentDebtSummary } from "@/components/copilot/copilot-client-current-debt-summary";
import { buildClientCurrentDebtSummary } from "@/lib/copilot-client-current-debt-summary";
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
  getProtoInvoicesByCompanyForLedger,
  getProtoPaymentsByCompany,
  getProtoReceiptsByCompany,
  getProtoReceiptsByCompanyForLedger,
  getProtoReceiptsByInvoice,
} from "@/lib/copilot-data";
import {
  describePeriodLabel,
  filterRowsByDateRange,
  filterRowsByPeriod,
  formatYmdDisplay,
  normalizeYmdInput,
  parseRowYmd,
  PERIOD_MONTH_OPTIONS,
  type PeriodMode,
  type PeriodSelector,
} from "@/lib/copilot-datos-period-filter";
import { buildClientAfterCutoffMovements } from "@/lib/copilot-client-account-statement-after-cutoff";

function rowTitle(row: DataRow, entity?: DataEntity): string {
  if (entity === "companies") {
    return companyPrimaryLabel(row);
  }
  if (entity === "invoices") {
    const label = formatInvoiceFacturaPrimary(row);
    if (label && label !== "—") return label;
  }
  if (entity === "receipts") {
    // Prefer visible reference (e.g. "A-768" → "A768") over internal ID "ZETA:COB:2732"
    const ref = String(row.reference ?? "").trim();
    if (ref && !ref.includes(":")) {
      return ref.replace(/^([A-Za-z]+)-(\d+)$/, "$1$2");
    }
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
  reference: "Número",
  receipt_date: "Fecha",
  amount: "Monto",
  currency_code: "Moneda",
  payment_method: "Método de cobro",
  status: "Estado",
  notes: "Notas",
};

/** Campos a mostrar (en orden) en el panel de detalle de recibos. */
const RECEIPT_SIDEBAR_PRIORITY = [
  "reference",
  "receipt_date",
  "amount",
  "currency_code",
  "payment_method",
  "status",
] as const;

/**
 * Campos técnicos / legacy que NO se muestran en el detalle de recibos.
 *  - `receipt_number` es el ID interno Zeta (ZETA:COB:2732); la referencia visible está en `reference`.
 *  - `notes` queda fuera porque es el JSON `zeta_collection_receipt_v1` (ya consumido por `readReceiptCurrency`).
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
  "receipt_number",
  "notes",
  "currency",
  "moneda",
  "moneda_codigo",
  "moneda_simbolo",
]);

const COMPANY_SIDEBAR_LABELS: Record<string, string> = {
  Codigo: "Código",
  RazonSocial: "Razón social",
  Nombre: "Nombre",
  Documento: "Documento",
  DocumentoTipo: "Tipo de documento",
  Email1: "Email",
  Telefono: "Teléfono",
  Celular: "Celular",
  DireccionCompleta: "Dirección",
  Direccion: "Dirección",
  Localidad: "Ciudad",
  RUT: "RUT",
  GiroNombre: "Actividad",
  status: "Estado",
  risk_level: "Riesgo",
};

/** Campos técnicos que no se muestran en la vista principal del drawer de cliente. */
const COMPANY_SIDEBAR_SKIP = new Set([
  "id",
  "workspace_company_id",
  "is_active",
  "zeta_metadata",
  "zeta_snapshot",
  "created_at",
  "updated_at",
  "DocumentoSigla",
  "ContactoActivo",
  // si DireccionCompleta existe, omitir la versión corta
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

// ── Helpers de detalle Zeta ───────────────────────────────────────────────────

type ZetaRawLinea = {
  Concepto?: string;
  Descripcion?: string;
  Notas?: string;
  Total?: string | number;
  Neto?: string | number;
  IVA?: string | number;
  Cantidad?: string | number;
  PrecioUnitario?: string | number;
  ArticuloCodigo?: string;
};

/** Lee raw_payload.Lineas desde zeta_metadata de una factura. */
function readInvoiceLineas(row: DataRow): ZetaRawLinea[] {
  try {
    const zm = row.zeta_metadata;
    if (!zm || typeof zm !== "object") return [];
    const v1 = (zm as Record<string, unknown>).zeta_customer_voucher_v1;
    if (!v1 || typeof v1 !== "object") return [];
    const rp = (v1 as Record<string, unknown>).raw_payload;
    if (!rp || typeof rp !== "object") return [];
    const lineas = (rp as Record<string, unknown>).Lineas;
    if (!Array.isArray(lineas)) return [];
    return lineas.filter((l) => l && typeof l === "object") as ZetaRawLinea[];
  } catch {
    return [];
  }
}

type ZetaReceiptPayload = {
  CajaNombre?: string;
  CobradorNombre?: string;
  LocalNombre?: string;
  ComprobanteNombre?: string;
  Descripcion?: string;
};

/** Lee zeta_collection_receipt_v1.raw_payload desde el campo notes de un recibo. */
function readReceiptZetaPayload(row: DataRow): ZetaReceiptPayload | null {
  try {
    const raw = row.notes;
    if (!raw || typeof raw !== "string") return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const v1 = parsed.zeta_collection_receipt_v1;
    if (!v1 || typeof v1 !== "object") return null;
    const rp = (v1 as Record<string, unknown>).raw_payload;
    if (!rp || typeof rp !== "object") return null;
    return rp as ZetaReceiptPayload;
  } catch {
    return null;
  }
}

function formatLineaAmount(val: string | number | undefined): string | null {
  if (val == null) return null;
  const n = parseFloat(String(val));
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Sección "Líneas del comprobante" para facturas — muestra los ítems de raw_payload.Lineas. */
function InvoiceLineasSection({ row }: { row: DataRow }) {
  const lineas = readInvoiceLineas(row);
  if (lineas.length === 0) return null;
  return (
    <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        Líneas del comprobante ({lineas.length})
      </h4>
      <ul className="space-y-1.5">
        {lineas.map((l, i) => {
          const concepto = String(l.Concepto ?? l.Descripcion ?? "—").trim() || "—";
          const notas = String(l.Notas ?? "").trim();
          const articulo = String(l.ArticuloCodigo ?? "").trim();
          const showArticulo = articulo && articulo !== "*";
          const total = formatLineaAmount(l.Total);
          return (
            <li
              key={i}
              className="rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-2"
            >
              <p className="text-sm font-medium text-[var(--copilot-ink)]">{concepto}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--copilot-ink-muted)]">
                {notas && <span>{notas}</span>}
                {showArticulo && <span>Art. {articulo}</span>}
                {total && (
                  <span className="ml-auto font-semibold text-[var(--copilot-ink)]">
                    $ {total}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Sección "Datos de cobro" para recibos — muestra caja, cobrador, local desde Zeta. */
function ReceiptCobroSection({ row }: { row: DataRow }) {
  const payload = readReceiptZetaPayload(row);
  const pm = String(row.payment_method ?? "").trim();
  const caja = payload?.CajaNombre?.trim() || pm || null;
  const cobrador = payload?.CobradorNombre?.trim() || null;
  const local = payload?.LocalNombre?.trim() || null;
  const descripcion = payload?.Descripcion?.trim() || null;

  if (!caja && !cobrador && !local && !descripcion) return null;

  const items = [
    caja && { label: "Caja / medio", value: caja },
    cobrador && { label: "Cobrador", value: cobrador },
    local && { label: "Local", value: local },
    descripcion && { label: "Descripción", value: descripcion },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        Datos de cobro
      </h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              {label}
            </p>
            <p className="mt-1 text-sm text-[var(--copilot-ink)]">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Listas compactas de registros relacionados ───────────────────────────────

function CompactList({
  title,
  rows,
  rowEntity,
  totalCount,
  periodSuffix,
}: {
  title: string;
  rows: DataRow[];
  rowEntity: DataEntity;
  /**
   * Total de filas disponibles antes de aplicar filtros del panel. Cuando se provee,
   * el contador muestra "X de N" para señalar que hay un subconjunto activo.
   */
  totalCount?: number;
  /**
   * Etiqueta humana del período activo del panel (ej. "Mayo 2026" o
   * "Del 01/12/2025 al 17/04/2026"). Se concatena al título cuando hay filtro
   * activo: "Facturas relacionadas (1 de 3) · Mayo 2026".
   */
  periodSuffix?: string;
}) {
  const showRange =
    typeof totalCount === "number" && totalCount > rows.length;
  return (
    <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {title} ({showRange ? `${rows.length} de ${totalCount}` : rows.length})
        {periodSuffix ? (
          <span className="ml-1 font-normal normal-case text-[var(--copilot-ink-muted)]">
            · {periodSuffix}
          </span>
        ) : null}
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

function ContactsBlock({ contacts }: { contacts: DataRow[] }) {
  return (
    <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        Contactos ({contacts.length})
      </h4>
      {contacts.length === 0 ? (
        <p className="text-sm text-[var(--copilot-ink-muted)]">
          No hay contactos registrados para este cliente.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {contacts.map((ct, i) => {
            const name = String(ct.full_name ?? ct.name ?? "Sin nombre").trim() || "Sin nombre";
            const cargo = ct.job_title ? String(ct.job_title).trim() : null;
            const email = ct.email ? String(ct.email).trim() : null;
            const phone = ct.phone ? String(ct.phone).trim() : null;
            const mobile = ct.mobile ? String(ct.mobile).trim() : null;
            const status = ct.status ? String(ct.status).trim() : null;
            return (
              <li
                key={String(ct.id ?? i)}
                className="space-y-1 rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-2 text-sm text-[var(--copilot-ink)]"
              >
                <p className="font-medium">{name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--copilot-ink-muted)]">
                  {cargo && <span>Cargo: {cargo}</span>}
                  {email && <span>Email: {email}</span>}
                  {phone && <span>Tel: {phone}</span>}
                  {mobile && <span>Cel: {mobile}</span>}
                  {status && <span>Estado: {status}</span>}
                </div>
              </li>
            );
          })}
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
  // Datos OPERACIONALES (sólo `is_active = true`). Alimentan las CompactList
  // y otras vistas que representan "lo vigente hoy".
  const [invoices, setInvoices] = useState<DataRow[]>([]);
  const [receipts, setReceipts] = useState<DataRow[]>([]);
  // Datos LEDGER / FINANCIEROS (activos + inactivos). Alimentan el Estado de
  // cuenta para reproducir el histórico contable: una factura archivada que
  // ya fue cobrada DEBE seguir apareciendo aunque `is_active = false`.
  const [ledgerInvoices, setLedgerInvoices] = useState<DataRow[]>([]);
  const [ledgerReceipts, setLedgerReceipts] = useState<DataRow[]>([]);
  const [payments, setPayments] = useState<DataRow[]>([]);
  const [invoice, setInvoice] = useState<DataRow | null>(null);

  // Filtros internos del panel (solo aplican al detalle del cliente, no a la tabla principal).
  // Default: modo "all" → muestra el histórico completo del cliente seleccionado.
  // Modos disponibles:
  //  - "all"        → sin filtro
  //  - "month_year" → mes y/o año (selector clásico)
  //  - "range"      → rango libre desde/hasta para reproducir reportes Zeta
  const [panelMode, setPanelMode] = useState<PeriodMode>("all");
  const [panelMonth, setPanelMonth] = useState<PeriodSelector>("all");
  const [panelYear, setPanelYear] = useState<PeriodSelector>("all");
  const [panelFrom, setPanelFrom] = useState<string>("");
  const [panelTo, setPanelTo] = useState<string>("");

  // Ref al input "Desde" para enfocarlo cuando el usuario activa
  // "Comparar contra PDF Zeta" en el estado de cuenta.
  const panelFromInputRef = useRef<HTMLInputElement | null>(null);

  const baseFields = useMemo(() => {
    if (!row) return [] as Array<[string, unknown]>;
    if (entity === "companies") {
      const priority = [
        "Codigo",
        "RazonSocial",
        "Nombre",
        "Documento",
        "DocumentoTipo",
        "Email1",
        "Telefono",
        "Celular",
        "DireccionCompleta",
        "Direccion",
        "Localidad",
        "RUT",
        "GiroNombre",
        "status",
        "risk_level",
      ] as const;
      const hasDireccionCompleta = "DireccionCompleta" in row && row["DireccionCompleta"] != null;
      const ordered: string[] = [];
      for (const k of priority) {
        if (k === "Direccion" && hasDireccionCompleta) continue;
        if (COMPANY_SIDEBAR_SKIP.has(k)) continue;
        if (k in row) ordered.push(k);
      }
      return ordered.slice(0, 16).map((k) => [k, row[k]] as [string, unknown]);
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
      setLedgerInvoices([]);
      setLedgerReceipts([]);
      setPayments([]);
      setInvoice(null);
      // Reset filtros del panel: cada cliente arranca con histórico completo.
      setPanelMode("all");
      setPanelMonth("all");
      setPanelYear("all");
      setPanelFrom("");
      setPanelTo("");
      try {
        if (entity === "companies") {
          const companyId = String(row.id ?? "");
          // Cargas en paralelo:
          //  - Operacional (is_active=true): contactos + facturas/recibos/pagos
          //    para las CompactList y datos del cliente vigente.
          //  - Ledger (activos + inactivos): facturas/recibos completos para el
          //    Estado de cuenta histórico.
          const [cts, inv, rec, pay, ledgerInv, ledgerRec] = await Promise.all([
            getProtoContactsByCompany(companyId),
            getProtoInvoicesByCompany(companyId),
            getProtoReceiptsByCompany(companyId),
            getProtoPaymentsByCompany(companyId),
            getProtoInvoicesByCompanyForLedger(companyId),
            getProtoReceiptsByCompanyForLedger(companyId),
          ]);
          if (cancelled) return;
          setContacts(cts);
          setInvoices(inv);
          setReceipts(rec);
          setPayments(pay);
          setLedgerInvoices(ledgerInv);
          setLedgerReceipts(ledgerRec);
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

  // ---------------------------------------------------------------------------
  // Filtros internos del panel (solo cliente seleccionado).
  //
  // Las dos capas conviven:
  //  - OPERACIONAL (`invoices` / `receipts`): solo `is_active = true`. Alimenta
  //    las CompactList "Facturas relacionadas" / "Recibos relacionados".
  //  - LEDGER (`ledgerInvoices` / `ledgerReceipts`): activos + inactivos.
  //    Alimenta el Estado de cuenta para reproducir el histórico contable.
  //
  // `availableYears` se deriva del LEDGER porque queremos que el filtro de año
  // pueda ofrecer años que sólo aparecen en facturas archivadas (cobradas).
  // ---------------------------------------------------------------------------
  const availableYears = useMemo<number[]>(() => {
    if (entity !== "companies") return [];
    const set = new Set<number>();
    for (const inv of ledgerInvoices) {
      const p = parseRowYmd(inv, "issue_date");
      if (p) set.add(p.y);
    }
    for (const rec of ledgerReceipts) {
      const p = parseRowYmd(rec, "receipt_date");
      if (p) set.add(p.y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [entity, ledgerInvoices, ledgerReceipts]);

  const normalizedFrom = useMemo(() => normalizeYmdInput(panelFrom), [panelFrom]);
  const normalizedTo = useMemo(() => normalizeYmdInput(panelTo), [panelTo]);

  const isPanelFiltered =
    (panelMode === "month_year" && (panelMonth !== "all" || panelYear !== "all")) ||
    (panelMode === "range" && (normalizedFrom !== null || normalizedTo !== null));

  const filteredInvoices = useMemo<DataRow[]>(() => {
    if (!isPanelFiltered) return invoices;
    if (panelMode === "range") {
      return filterRowsByDateRange(invoices, "issue_date", normalizedFrom, normalizedTo);
    }
    return filterRowsByPeriod(invoices, "issue_date", panelYear, panelMonth);
  }, [
    invoices,
    isPanelFiltered,
    panelMode,
    panelMonth,
    panelYear,
    normalizedFrom,
    normalizedTo,
  ]);

  const filteredReceipts = useMemo<DataRow[]>(() => {
    if (!isPanelFiltered) return receipts;
    if (panelMode === "range") {
      return filterRowsByDateRange(receipts, "receipt_date", normalizedFrom, normalizedTo);
    }
    return filterRowsByPeriod(receipts, "receipt_date", panelYear, panelMonth);
  }, [
    receipts,
    isPanelFiltered,
    panelMode,
    panelMonth,
    panelYear,
    normalizedFrom,
    normalizedTo,
  ]);

  // Mismas operaciones de filtrado, pero sobre el dataset LEDGER (activos + inactivos).
  const filteredLedgerInvoices = useMemo<DataRow[]>(() => {
    if (!isPanelFiltered) return ledgerInvoices;
    if (panelMode === "range") {
      return filterRowsByDateRange(ledgerInvoices, "issue_date", normalizedFrom, normalizedTo);
    }
    return filterRowsByPeriod(ledgerInvoices, "issue_date", panelYear, panelMonth);
  }, [
    ledgerInvoices,
    isPanelFiltered,
    panelMode,
    panelMonth,
    panelYear,
    normalizedFrom,
    normalizedTo,
  ]);

  const filteredLedgerReceipts = useMemo<DataRow[]>(() => {
    if (!isPanelFiltered) return ledgerReceipts;
    if (panelMode === "range") {
      return filterRowsByDateRange(ledgerReceipts, "receipt_date", normalizedFrom, normalizedTo);
    }
    return filterRowsByPeriod(ledgerReceipts, "receipt_date", panelYear, panelMonth);
  }, [
    ledgerReceipts,
    isPanelFiltered,
    panelMode,
    panelMonth,
    panelYear,
    normalizedFrom,
    normalizedTo,
  ]);

  // Tipping point para mostrar un aviso al usuario cuando la vista financiera
  // diverge del operacional (= hay filas archivadas dentro del período activo).
  const ledgerArchivedCount = useMemo<number>(() => {
    if (entity !== "companies") return 0;
    let count = 0;
    for (const inv of filteredLedgerInvoices) {
      if (inv.is_active === false) count += 1;
    }
    for (const rec of filteredLedgerReceipts) {
      if (rec.is_active === false) count += 1;
    }
    return count;
  }, [entity, filteredLedgerInvoices, filteredLedgerReceipts]);

  // Etiqueta visible del período activo (microcopy y headers del estado de cuenta).
  const periodLabel = useMemo(
    () =>
      describePeriodLabel({
        mode: panelMode,
        year: panelYear,
        month: panelMonth,
        from: normalizedFrom,
        to: normalizedTo,
      }),
    [panelMode, panelYear, panelMonth, normalizedFrom, normalizedTo]
  );

  // Cierre del período (para el footer del estado de cuenta tipo Zeta:
  // "SALDO U$S al 17/04/2026 ..."). Sólo se publica cuando el modo "range"
  // tiene un `to` real; en otros modos se omite el sufijo.
  const periodEndLabel = useMemo<string | undefined>(() => {
    if (panelMode === "range" && normalizedTo) {
      return formatYmdDisplay(normalizedTo);
    }
    return undefined;
  }, [panelMode, normalizedTo]);

  // Resumen de DEUDA ACTUAL del cliente — se calcula UNA SOLA VEZ con el
  // dataset ledger COMPLETO (`ledgerInvoices`). NO depende de los filtros del
  // panel: aunque el usuario filtre por mes/año o cargue un rango histórico,
  // este bloque sigue mostrando lo que el cliente debe HOY según
  // `proto_invoices.balance_amount`. Es la respuesta directa a "¿cuánto debe
  // ahora?" — independiente del relato contable del estado de cuenta.
  const currentDebtSummary = useMemo(() => {
    if (entity !== "companies") return null;
    return buildClientCurrentDebtSummary({ invoices: ledgerInvoices });
  }, [entity, ledgerInvoices]);

  // Movimientos sincronizados DESPUÉS del corte histórico (sólo cuando hay
  // rango con `to`). Se calcula sobre el dataset ledger COMPLETO (sin filtrar
  // por período) para no perder filas posteriores. Si no hay corte → null.
  const afterCutoff = useMemo(() => {
    if (panelMode !== "range" || !normalizedTo) return undefined;
    return buildClientAfterCutoffMovements({
      invoices: ledgerInvoices,
      receipts: ledgerReceipts,
      toDate: normalizedTo,
      ledgerMode: true,
    });
  }, [panelMode, normalizedTo, ledgerInvoices, ledgerReceipts]);

  // Acción rápida desde el estado de cuenta: "Comparar contra PDF Zeta".
  // Cambia el panel a modo rango con campos vacíos y pone foco en "Desde"
  // para que el usuario tipee inmediatamente las fechas del PDF.
  const handleCompareWithPdf = useCallback(() => {
    setPanelMode("range");
    setPanelMonth("all");
    setPanelYear("all");
    setPanelFrom("");
    setPanelTo("");
    requestAnimationFrame(() => {
      panelFromInputRef.current?.focus();
    });
  }, []);

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
                        : entity === "companies"
                          ? (COMPANY_SIDEBAR_LABELS[k] ?? k)
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
              {row?.id ? (
                <Link
                  href={`/copilot/clientes/${encodeURIComponent(String(row.id))}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Ver ficha completa
                </Link>
              ) : null}
              {currentDebtSummary ? (
                <ClientCurrentDebtSummary summary={currentDebtSummary} />
              ) : null}
              <ClientPanelFilters
                mode={panelMode}
                month={panelMonth}
                year={panelYear}
                from={panelFrom}
                to={panelTo}
                fromInputRef={panelFromInputRef}
                availableYears={availableYears}
                isFiltered={isPanelFiltered}
                totalInvoices={invoices.length}
                filteredCount={filteredInvoices.length}
                periodLabel={periodLabel}
                onModeChange={(m) => {
                  setPanelMode(m);
                  // Al cambiar de modo, limpiamos los inputs del modo opuesto para
                  // evitar estados inconsistentes (ej. mes seleccionado y rango con
                  // fechas viejas al volver a "month_year").
                  if (m === "all") {
                    setPanelMonth("all");
                    setPanelYear("all");
                    setPanelFrom("");
                    setPanelTo("");
                  } else if (m === "month_year") {
                    setPanelFrom("");
                    setPanelTo("");
                  } else if (m === "range") {
                    setPanelMonth("all");
                    setPanelYear("all");
                  }
                }}
                onMonthChange={setPanelMonth}
                onYearChange={setPanelYear}
                onFromChange={setPanelFrom}
                onToChange={setPanelTo}
                onClear={() => {
                  setPanelMode("all");
                  setPanelMonth("all");
                  setPanelYear("all");
                  setPanelFrom("");
                  setPanelTo("");
                }}
              />
              {isPanelFiltered ? (
                <p
                  role="note"
                  className="rounded-md border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--copilot-ink-muted)]"
                >
                  Vista filtrada por período del panel ·{" "}
                  <span className="font-semibold text-[var(--copilot-ink)]">{periodLabel}</span>
                </p>
              ) : null}
              {ledgerArchivedCount > 0 ? (
                <p
                  role="note"
                  className="rounded-md border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--copilot-ink-muted)]"
                >
                  El estado de cuenta incluye{" "}
                  <span className="font-semibold text-[var(--copilot-ink)]">
                    {ledgerArchivedCount} comprobante(s) archivado(s)
                  </span>{" "}
                  para reproducir el histórico contable. Las listas operacionales
                  (facturas/recibos relacionados) muestran únicamente registros
                  vigentes.
                </p>
              ) : null}
              <CopilotClientAccountStatement
                invoices={filteredLedgerInvoices}
                receipts={filteredLedgerReceipts}
                ledgerMode
                isFullHistory={!isPanelFiltered}
                clientName={String(row.name ?? "")}
                clientCode={(() => {
                  const code = String(row.Codigo ?? "").trim();
                  return code || undefined;
                })()}
                periodLabel={periodLabel}
                periodEndLabel={periodEndLabel}
                cutoffFromYmd={normalizedFrom ?? undefined}
                cutoffToYmd={normalizedTo ?? undefined}
                afterCutoff={afterCutoff}
                onCompareWithPdf={handleCompareWithPdf}
              />
              <ContactsBlock contacts={contacts} />
              {isPanelFiltered && filteredInvoices.length === 0 ? (
                <section className="space-y-2 rounded-xl border border-dashed border-[var(--copilot-border)] bg-white/70 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Facturas relacionadas (0 de {invoices.length}){" "}
                    <span className="font-normal normal-case text-[var(--copilot-ink-muted)]">
                      · {periodLabel}
                    </span>
                  </h4>
                  <p className="text-sm text-[var(--copilot-ink-muted)]">
                    No hay facturas del cliente para el período seleccionado.
                  </p>
                </section>
              ) : (
                <CompactList
                  title="Facturas relacionadas"
                  rows={filteredInvoices}
                  rowEntity="invoices"
                  totalCount={isPanelFiltered ? invoices.length : undefined}
                  periodSuffix={isPanelFiltered ? periodLabel : undefined}
                />
              )}
              <CompactList
                title="Recibos relacionados"
                rows={filteredReceipts}
                rowEntity="receipts"
                totalCount={isPanelFiltered ? receipts.length : undefined}
                periodSuffix={isPanelFiltered ? periodLabel : undefined}
              />
              <CompactList
                title="Pagos relacionados"
                rows={payments}
                rowEntity="payments"
              />
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
              <InvoiceLineasSection row={row} />
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
              <ReceiptCobroSection row={row} />
              {invoice ? (
                <section className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Factura asociada
                  </h4>
                  <p className="text-sm text-[var(--copilot-ink)]">{rowTitle(invoice)}</p>
                </section>
              ) : null}
            </>
          ) : null}

          {entity === "tax_obligations" ? (
            <p className="text-xs text-[var(--copilot-ink-muted)]">
              Los pagos registrados para esta obligación aparecen en la sección Pagos.
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

// ---------------------------------------------------------------------------
// Filtros internos del panel de cliente
//
// Modos:
//  - "all"        → sin filtro (default): histórico completo del cliente.
//  - "month_year" → selector tradicional Año + Mes ("Todos" en cualquiera).
//  - "range"      → rango libre desde / hasta. Diseñado para reproducir reportes
//    Zeta tipo "01/12/25 al 17/04/26".
//
// Reglas de UX:
//  - El botón "Limpiar filtros" sólo aparece cuando hay filtro activo y vuelve
//    al modo "all".
//  - El selector "Año" solo lista los años que aparecen en facturas/recibos del
//    cliente (derivado en el componente padre vía `availableYears`).
//  - Al cambiar de modo, el padre limpia el estado del modo opuesto (ver
//    `onModeChange` en el bloque companies del sidebar).
//  - NO afecta la tabla principal: opera exclusivamente sobre el detalle del
//    cliente seleccionado en el sidebar.
// ---------------------------------------------------------------------------
function ClientPanelFilters({
  mode,
  month,
  year,
  from,
  to,
  fromInputRef,
  availableYears,
  isFiltered,
  totalInvoices,
  filteredCount,
  periodLabel,
  onModeChange,
  onMonthChange,
  onYearChange,
  onFromChange,
  onToChange,
  onClear,
}: {
  mode: PeriodMode;
  month: PeriodSelector;
  year: PeriodSelector;
  from: string;
  to: string;
  /**
   * Ref expuesto al input "Desde". El estado de cuenta lo usa para enfocar el
   * campo cuando el usuario presiona "Comparar contra PDF Zeta".
   */
  fromInputRef?: React.RefObject<HTMLInputElement | null>;
  availableYears: readonly number[];
  isFiltered: boolean;
  totalInvoices: number;
  filteredCount: number;
  periodLabel: string;
  onModeChange: (m: PeriodMode) => void;
  onMonthChange: (v: PeriodSelector) => void;
  onYearChange: (v: PeriodSelector) => void;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear: () => void;
}) {
  const microcopy = !isFiltered
    ? "Mostrando todas las facturas sincronizadas del cliente."
    : `Mostrando facturas del cliente · ${periodLabel}`;

  return (
    <section
      aria-label="Filtros del detalle del cliente"
      className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-3"
    >
      <ModeTabs mode={mode} onChange={onModeChange} />

      {mode === "month_year" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-[var(--copilot-ink-muted)]">
            Año
            <select
              value={year === "all" ? "all" : String(year)}
              onChange={(e) => {
                const v = e.target.value;
                onYearChange(v === "all" ? "all" : Number(v));
              }}
              className="rounded-md border border-[var(--copilot-border)] bg-white px-2 py-1 text-xs text-[var(--copilot-ink)]"
            >
              <option value="all">Todos</option>
              {availableYears.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-[var(--copilot-ink-muted)]">
            Mes
            <select
              value={month === "all" ? "all" : String(month)}
              onChange={(e) => {
                const v = e.target.value;
                onMonthChange(v === "all" ? "all" : Number(v));
              }}
              className="rounded-md border border-[var(--copilot-border)] bg-white px-2 py-1 text-xs text-[var(--copilot-ink)]"
            >
              <option value="all">Todos</option>
              {PERIOD_MONTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {mode === "range" ? (
        <div className="space-y-2">
          {/*
            Microcopy específica para el caso "comparar contra PDF Zeta": el
            usuario llega acá típicamente desde el botón del estado de cuenta.
          */}
          <p className="text-[11px] text-[var(--copilot-ink-muted)]">
            Ingresá el período exacto que figura en el PDF de Zeta.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-[var(--copilot-ink-muted)]">
              Desde
              <input
                ref={fromInputRef}
                type="date"
                value={from}
                onChange={(e) => onFromChange(e.target.value)}
                className="rounded-md border border-[var(--copilot-border)] bg-white px-2 py-1 text-xs text-[var(--copilot-ink)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-[var(--copilot-ink-muted)]">
              Hasta
              <input
                type="date"
                value={to}
                onChange={(e) => onToChange(e.target.value)}
                className="rounded-md border border-[var(--copilot-border)] bg-white px-2 py-1 text-xs text-[var(--copilot-ink)]"
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {isFiltered ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-[var(--copilot-border)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--copilot-ink-muted)] transition hover:text-[var(--copilot-ink)]"
          >
            Limpiar filtros
          </button>
        ) : null}
        <p className="ml-auto text-[11px] tabular-nums text-[var(--copilot-ink-muted)]">
          {isFiltered
            ? `${filteredCount} de ${totalInvoices} factura(s)`
            : `${totalInvoices} factura(s)`}
        </p>
      </div>
      <p className="text-[11px] text-[var(--copilot-ink-muted)]">{microcopy}</p>
    </section>
  );
}

function ModeTabs({
  mode,
  onChange,
}: {
  mode: PeriodMode;
  onChange: (m: PeriodMode) => void;
}) {
  const tabs: Array<{ id: PeriodMode; label: string }> = [
    { id: "all", label: "Todos" },
    { id: "month_year", label: "Mes y año" },
    { id: "range", label: "Rango de fechas" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Modo de filtro del panel"
      className="inline-flex rounded-lg border border-[var(--copilot-border)] bg-white p-0.5 text-[11px]"
    >
      {tabs.map((t) => {
        const active = t.id === mode;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={
              active
                ? "rounded-md bg-[var(--copilot-accent-soft)] px-2.5 py-1 font-semibold text-[var(--copilot-accent)]"
                : "rounded-md px-2.5 py-1 font-medium text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
