/**
 * Clasificación de filas `RESTComprobantesClienteV1Query` para el pipeline de **facturas** (`proto_invoices`).
 * Los **recibos de cobranza** deben importarse vía `zeta-collection-receipts-pipeline` → `proto_receipts`, no aquí.
 *
 * Códigos CFE (DGI Uruguay) según ayuda Zeta / API tipos de CFE.
 */

import type { ZetaCustomerVoucherRecord } from "@/lib/integrations/zeta/contracts/zeta-customer-vouchers.contract";

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
  const cfe = parseZetaCfeTipoCodigo(row);
  if (cfe == null) {
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
