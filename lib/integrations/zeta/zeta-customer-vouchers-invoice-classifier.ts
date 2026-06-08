/**
 * Clasificación de filas `RESTComprobantesClienteV1Query` para el pipeline de **facturas** (`proto_invoices`).
 * Los **recibos de cobranza** deben importarse vía `zeta-collection-receipts-pipeline` → `proto_receipts`, no aquí.
 *
 * Códigos CFE (DGI Uruguay) según ayuda Zeta / API tipos de CFE.
 */

import type { ZetaCustomerVoucherRecord } from "@/lib/integrations/zeta/contracts/zeta-customer-vouchers.contract";

/** Recibo de cobranza Zeta (`RESTRecibosCobranzaV2` / comprobante cliente cobro). */
const ZETA_COMPROBANTE_CODIGO_RECOBRO = new Set(["5"]);

function readOwn(row: ZetaCustomerVoucherRecord, names: readonly string[]): unknown {
  for (const n of names) {
    if (Object.prototype.hasOwnProperty.call(row, n)) return row[n];
    const want = n.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === want) return row[k];
    }
  }
  return undefined;
}

/** CFE electrónicos y notas asociadas (no incluye comprobantes internos como recibo de cobranza). */
const CFE_TIPOS_DGI_FACTURA_O_DOCUMENTO_FISCAL = new Set([
  101, 102, 103,
  111, 112, 113,
  121, 122, 123, 124,
  131, 132, 133,
  141, 142, 143,
  181, 182,
  201, 202, 203,
  211, 212, 213,
  221, 222, 223, 224,
  231, 232, 233,
  241, 242, 243,
  281, 282,
]);

function readComprobanteCodigo(row: ZetaCustomerVoucherRecord): string | null {
  const raw = readOwn(row, ["ComprobanteCodigo", "comprobanteCodigo"]);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

/** Comprobante de cobro por código Zeta (p. ej. 5 = Recibo de Cobro). */
export function zetaCustomerVoucherRowIsReciboComprobanteCodigo(
  row: ZetaCustomerVoucherRecord
): boolean {
  const cc = readComprobanteCodigo(row);
  return cc != null && ZETA_COMPROBANTE_CODIGO_RECOBRO.has(cc);
}

function parseLineTotal(line: unknown): number {
  if (!line || typeof line !== "object") return 0;
  const rec = line as Record<string, unknown>;
  for (const k of ["Total", "total", "SubTotal", "subtotal"]) {
    const raw = rec[k];
    if (raw === null || raw === undefined) continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Factura interna Zeta con líneas de venta (p. ej. PRESTIS mar/2026: CFETipo=0, Numero=0, ComprobanteCodigo=701).
 */
export function zetaCustomerVoucherRowHasInvoiceLineas(row: ZetaCustomerVoucherRecord): boolean {
  const lineas = readOwn(row, ["Lineas", "lineas"]);
  if (!Array.isArray(lineas) || lineas.length === 0) return false;
  return lineas.some((line) => parseLineTotal(line) > 0);
}

function zetaCustomerVoucherRowHasFormasPago(row: ZetaCustomerVoucherRecord): boolean {
  const fp = readOwn(row, ["FormasPago", "formasPago"]);
  return Array.isArray(fp) && fp.length > 0;
}

function zetaCustomerVoucherRowTotalReciboPositive(row: ZetaCustomerVoucherRecord): boolean {
  const raw = readOwn(row, ["TotalRecibo", "totalRecibo"]);
  if (raw === null || raw === undefined || raw === "") return false;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n > 0;
}

export function parseZetaCfeTipoCodigo(row: ZetaCustomerVoucherRecord): number | null {
  const raw = readOwn(row, ["CFETipo", "cfeTipo", "CfeTipo", "TipoCFE", "tipoCFE", "TipoCfe"]);
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const s = String(raw).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Texto típico de “Recibo de cobro / cobranza” en configuración Zeta (Tipo básico cliente). */
export function zetaCustomerVoucherRowLooksLikeReciboCobranza(row: ZetaCustomerVoucherRecord): boolean {
  const candidates: unknown[] = [
    readOwn(row, ["TipoComprobanteNombre", "tipoComprobanteNombre"]),
    readOwn(row, ["NombreComprobante", "nombreComprobante"]),
    readOwn(row, ["ComprobanteTipoNombre", "comprobanteTipoNombre"]),
    readOwn(row, ["TipoNombre", "tipoNombre"]),
    readOwn(row, ["Nombre", "nombre"]),
    readOwn(row, ["Descripcion", "descripcion"]),
    readOwn(row, ["TipoComprobante", "tipoComprobante"]),
    readOwn(row, ["ComprobanteNombre", "comprobanteNombre"]),
  ];
  for (const c of candidates) {
    const s = String(c ?? "").toLowerCase();
    if (!s.trim()) continue;
    if (s.includes("recibo de cobranza") || s.includes("recibo de cobro")) return true;
    if (s.includes("recibo") && (s.includes("cobranza") || s.includes("cobro"))) return true;
    // Recibos internos (p. ej. "Recibo", "Recibo 655") sin texto "cobranza" en el tipo.
    const t = s.trim();
    if (t === "recibo" || t.startsWith("recibo ")) return true;
  }
  return false;
}

/** Motivo por el que el clasificador no persiste la fila en `proto_invoices`. */
export type ZetaCustomerVoucherClassifierRejectReason =
  | { code: "recibo_text" }
  | { code: "cfe_type_not_dgi"; cfeTipo: number };

/**
 * Si devuelve `null`, la fila pasa el clasificador (factura/CFE persistible).
 * Si no, es el motivo exacto del skip (debug / métricas).
 */
export function zetaCustomerVoucherClassifierRejectReason(
  row: ZetaCustomerVoucherRecord
): ZetaCustomerVoucherClassifierRejectReason | null {
  if (zetaCustomerVoucherRowLooksLikeReciboCobranza(row)) {
    return { code: "recibo_text" };
  }
  if (zetaCustomerVoucherRowIsReciboComprobanteCodigo(row)) {
    return { code: "recibo_text" };
  }
  if (zetaCustomerVoucherRowHasFormasPago(row) || zetaCustomerVoucherRowTotalReciboPositive(row)) {
    return { code: "recibo_text" };
  }
  const cfe = parseZetaCfeTipoCodigo(row);
  if (cfe == null) {
    return null;
  }
  if (cfe === 0 && zetaCustomerVoucherRowHasInvoiceLineas(row)) {
    return null;
  }
  if (!CFE_TIPOS_DGI_FACTURA_O_DOCUMENTO_FISCAL.has(cfe)) {
    return { code: "cfe_type_not_dgi", cfeTipo: cfe };
  }
  return null;
}

/**
 * `true` = fila que debe persistirse en `proto_invoices` por este pipeline.
 * - Excluye explícitamente recibos de cobranza (texto / tipo Zeta).
 * - Incluye solo comprobantes con **CFETipo** en catálogo DGI (e-Factura, e-Ticket, NC/ND, remito, etc.).
 * - Si **no** viene `CFETipo` pero tampoco parece recibo de cobranza → se incluye (compat. payloads incompletos).
 */
export function zetaCustomerVoucherRowIsPersistableSalesCfeInvoice(row: ZetaCustomerVoucherRecord): boolean {
  return zetaCustomerVoucherClassifierRejectReason(row) === null;
}
