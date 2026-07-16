/**
 * FASE 9 — Constructor del modelo canónico de ventas desde `proto_invoices`.
 *
 * Función PURA: recibe filas crudas (ya deduplicadas por el data source con
 * `dedupeZetaShadowInvoicesCanonical`) + un mapa de nombres de cliente + la
 * vista de catálogo, y devuelve documentos + líneas canónicas.
 *
 * NO toca DB. NO inventa datos. Preserva el texto original de Zeta.
 */

import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";
import {
  isCreditNoteFromMetadata,
  readCfeTipoFromZetaMetadata,
} from "@/lib/copilot-zeta-credit-note";
import { emptyCatalogView, type SalesCatalogView } from "@/lib/sales/canonical/catalog-types";
import { classifyLine, conceptKey, type LineClassificationResult } from "@/lib/sales/canonical/sales-normalization";
import { resolveCanonicalSaleCurrency } from "@/lib/sales/canonical/issued-sale-universe";
import type {
  CanonicalSaleDocument,
  CanonicalSaleLine,
  SalesCurrencyResolved,
  SalesDocumentKind,
  SalesDocumentStatus,
} from "@/lib/sales/canonical/types";

/** Fila cruda mínima de proto_invoices (select *). */
export type RawSaleInvoiceRow = {
  id?: string | number;
  invoice_number?: string | null;
  company_id?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  currency_code?: string | null;
  currency?: string | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  balance_amount?: number | string | null;
  status?: string | null;
  is_active?: boolean | null;
  zeta_metadata?: unknown;
  [key: string]: unknown;
};

export type BuildCanonicalSalesInput = {
  workspaceId: string;
  rows: readonly RawSaleInvoiceRow[];
  /** company_id (proto_companies.id) → nombre de cliente. */
  customerNames?: ReadonlyMap<string, string>;
  catalog?: SalesCatalogView;
  /** Fecha mínima financiera (default MIN_FINANCIAL_DATE = 2026-01-01). */
  minDate?: string;
};

const VOIDED_STATUSES = new Set([
  "void",
  "voided",
  "cancelled",
  "canceled",
  "anulada",
  "anulado",
  "annulled",
]);

const CFE_TIPO_LABEL: Record<number, string> = {
  101: "e-Factura",
  102: "e-Factura NC",
  111: "e-Ticket",
  112: "e-Ticket NC",
  121: "e-Factura Exportación",
  122: "e-Factura Exp. NC",
  181: "e-Remito / NC",
  182: "e-Resguardo / NC",
};

const MISSING_DETAIL_LABEL = "Sin detalle";
const MISSING_DETAIL_GROUP = "__missing_detail__";

/**
 * Resuelve el nombre visible y la clave de agrupación de una línea aplicando la
 * jerarquía canónica: producto del catálogo → concepto Zeta → descripción →
 * "Sin detalle". NUNCA devuelve "Sin clasificar": un concepto Zeta válido es un
 * producto comercial legítimo aunque no tenga alias todavía.
 */
function resolveLineDisplay(
  cls: LineClassificationResult,
  concept: string | null,
  code: string | null
): {
  displayProductName: string;
  productGroupKey: string;
  normalizationStatus: "canonical" | "original" | "missing_detail";
} {
  if (cls.status === "classified" && cls.productId && cls.productName) {
    return {
      displayProductName: cls.productName,
      productGroupKey: `p:${cls.productId}`,
      normalizationStatus: "canonical",
    };
  }
  const label = (concept ?? "").trim();
  if (label && label !== "(Sin concepto)") {
    return {
      displayProductName: label,
      productGroupKey: `c:${conceptKey(label, code)}`,
      normalizationStatus: "original",
    };
  }
  return {
    displayProductName: MISSING_DETAIL_LABEL,
    productGroupKey: MISSING_DETAIL_GROUP,
    normalizationStatus: "missing_detail",
  };
}

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * Resuelve moneda ISO usando la fuente canónica compartida con Finanzas
 * (`resolveCanonicalSaleCurrency`): currency_code → MonedaCodigo del payload.
 * `UNKNOWN` cuando no se puede resolver a UYU/USD.
 */
function resolveCurrency(row: RawSaleInvoiceRow): SalesCurrencyResolved {
  return resolveCanonicalSaleCurrency(row) ?? "UNKNOWN";
}

function readVoucherPayload(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v1 = (metadata as Record<string, unknown>).zeta_customer_voucher_v1;
  if (!v1 || typeof v1 !== "object" || Array.isArray(v1)) return null;
  const payload = (v1 as Record<string, unknown>).raw_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

function readLineas(metadata: unknown): Record<string, unknown>[] {
  const payload = readVoucherPayload(metadata);
  const lineas = payload?.Lineas;
  if (!Array.isArray(lineas)) return [];
  return lineas.filter((l): l is Record<string, unknown> => !!l && typeof l === "object" && !Array.isArray(l));
}

function readCustomerCode(row: RawSaleInvoiceRow): string | null {
  const payload = readVoucherPayload(row.zeta_metadata);
  const code = str(payload?.ClienteCodigo).trim();
  return code || null;
}

function readDocNumber(row: RawSaleInvoiceRow): string | null {
  const payload = readVoucherPayload(row.zeta_metadata);
  const serie = str(payload?.Serie).trim();
  const numero = str(payload?.Numero).trim();
  if (serie && numero) return `${serie}-${numero}`;
  if (numero) return numero;
  return null;
}

/** Determina si la fila es una venta válida dentro del período financiero. */
function isEligibleRow(row: RawSaleInvoiceRow, minDate: string): boolean {
  if (row.is_active === false) return false;
  const issue = str(row.issue_date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue)) return false;
  if (issue < minDate) return false;
  return true;
}

function docStatus(row: RawSaleInvoiceRow, kind: SalesDocumentKind): SalesDocumentStatus {
  const s = str(row.status).trim().toLowerCase();
  if (s && VOIDED_STATUSES.has(s)) return "cancelled";
  if (kind === "credit_note") return "adjustment";
  return "valid";
}

/**
 * Construye documentos canónicos. Solo incluye filas elegibles (≥ minDate,
 * activas). Excluye documentos anulados de los totales de venta salvo que se
 * requiera trazarlos (se devuelven con status 'cancelled' para que la capa de
 * agregación los excluya de emitidas/NC).
 */
export function buildCanonicalSaleDocuments(
  input: BuildCanonicalSalesInput
): CanonicalSaleDocument[] {
  const minDate = input.minDate ?? MIN_FINANCIAL_DATE;
  const catalog = input.catalog ?? emptyCatalogView();
  const names = input.customerNames ?? new Map<string, string>();
  const out: CanonicalSaleDocument[] = [];

  for (const row of input.rows) {
    if (!isEligibleRow(row, minDate)) continue;

    const documentId = str(row.id);
    if (!documentId) continue;

    const currency = resolveCurrency(row);
    const kind: SalesDocumentKind = isCreditNoteFromMetadata(row.zeta_metadata)
      ? "credit_note"
      : "sale";
    const cfeTipo = readCfeTipoFromZetaMetadata(row.zeta_metadata);
    const status = docStatus(row, kind);

    const companyId = str(row.company_id).trim() || null;
    const customerCode = readCustomerCode(row);
    const payload = readVoucherPayload(row.zeta_metadata);
    const payloadName = str(payload?.ClienteNombre).trim();
    const customerName =
      (companyId && names.get(companyId)) ||
      payloadName ||
      (customerCode ? `Cliente ${customerCode}` : "Consumidor final");

    const grossAmount = Math.abs(toNum(row.total_amount));
    const appliedAmount = Math.abs(toNum(row.paid_amount));
    const pendingAmount = Math.abs(toNum(row.balance_amount));

    const rawLines = readLineas(row.zeta_metadata);
    const lines: CanonicalSaleLine[] = [];

    if (rawLines.length === 0) {
      // Documento sin detalle (vino por pipeline de saldos): línea sintética.
      const cls = classifyLine("(Sin detalle de líneas)", null, catalog);
      const display = resolveLineDisplay(cls, null, null);
      lines.push({
        lineId: `${documentId}:0`,
        documentId,
        originalCode: null,
        originalDescription: "(Sin detalle de líneas)",
        originalConcept: null,
        canonicalProductId: cls.productId,
        canonicalProductName: cls.productName,
        canonicalCategoryId: cls.categoryId,
        canonicalCategoryName: cls.categoryName,
        displayProductName: display.displayProductName,
        productGroupKey: display.productGroupKey,
        normalizationStatus: display.normalizationStatus,
        classificationStatus: cls.status,
        classificationSource: cls.source,
        quantity: 1,
        unitPrice: grossAmount || null,
        lineAmount: grossAmount,
        netAmount: null,
        taxAmount: null,
        currency,
        synthetic: true,
      });
    } else {
      rawLines.forEach((l, idx) => {
        const description = str(l.Concepto).trim() || "(Sin concepto)";
        const codeRaw = str(l.ArticuloCodigo).trim();
        const code = codeRaw || null;
        const qty = toNum(l.Cantidad);
        const quantity = qty > 0 ? qty : 1;
        const total = toNum(l.Total);
        const net = toNumOrNull(l.Neto);
        const iva = toNumOrNull(l.IVA);
        const lineAmount = total || (net ?? 0) + (iva ?? 0);
        const cls = classifyLine(description, code, catalog);
        const hasConcept = description !== "(Sin concepto)";
        const display = resolveLineDisplay(cls, hasConcept ? description : null, code);
        lines.push({
          lineId: `${documentId}:${idx}`,
          documentId,
          originalCode: code,
          originalDescription: description,
          originalConcept: hasConcept ? description : null,
          canonicalProductId: cls.productId,
          canonicalProductName: cls.productName,
          canonicalCategoryId: cls.categoryId,
          canonicalCategoryName: cls.categoryName,
          displayProductName: display.displayProductName,
          productGroupKey: display.productGroupKey,
          normalizationStatus: display.normalizationStatus,
          classificationStatus: cls.status,
          classificationSource: cls.source,
          quantity,
          unitPrice: toNumOrNull(l.PrecioUnitario),
          lineAmount: Math.abs(lineAmount),
          netAmount: net === null ? null : Math.abs(net),
          taxAmount: iva === null ? null : Math.abs(iva),
          currency,
          synthetic: false,
        });
      });
    }

    out.push({
      workspaceId: input.workspaceId,
      documentId,
      externalId: str(row.invoice_number).trim() || null,
      kind,
      documentType: cfeTipo != null ? CFE_TIPO_LABEL[cfeTipo] ?? `CFE ${cfeTipo}` : "Comprobante",
      cfeTipo,
      documentNumber: readDocNumber(row),
      customerId: companyId,
      customerCode,
      customerName,
      issueDate: str(row.issue_date).slice(0, 10),
      dueDate: str(row.due_date).slice(0, 10) || null,
      currency,
      grossAmount,
      appliedAmount,
      // Zeta no expone imputación recibo↔factura (DIV-CONT-005): a nivel
      // documento, cobrado registrado coincide con aplicado. La distinción real
      // se computa a nivel workspace en la capa de cobros.
      registeredAmount: appliedAmount,
      pendingAmount,
      status,
      salespersonId: null,
      salespersonName: null,
      lines,
    });
  }

  // Orden determinístico: fecha desc, luego documentId asc.
  out.sort((a, b) => {
    if (a.issueDate !== b.issueDate) return a.issueDate < b.issueDate ? 1 : -1;
    return a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0;
  });
  return out;
}
