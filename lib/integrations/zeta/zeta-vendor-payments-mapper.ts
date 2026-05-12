/**
 * Fila Zeta (`QueryComprobantes` recibos de pago) → modelo interno y
 * `ProtoPaymentInput`.
 */

import type { ProtoPaymentInput } from "@/lib/copilot-proto-crud-types";
import { COPILOT_OPERATIONAL_START_DATE } from "@/lib/copilot-operational-period";
import type { ZetaVendorPaymentRecord } from "@/lib/integrations/zeta/contracts/zeta-vendor-payments.contract";
import { cleanZetaString } from "@/lib/integrations/zeta/zeta-client-mapper";

export type CopilotVendorPaymentV1 = {
  schema_version: 1;
  zeta_registro_id: string;
  comprobante_codigo: string | null;
  comprobante_abreviacion: string | null;
  comprobante_nombre: string | null;
  proveedor_codigo: string | null;
  proveedor_nombre: string | null;
  proveedor_razon_social: string | null;
  payment_date_ymd: string | null;
  serie: string | null;
  numero: string | null;
  moneda_codigo: string | null;
  moneda_simbolo: string | null;
  currency_code: "USD" | "UYU" | null;
  total: number | null;
  saldo: number | null;
  caja_codigo: string | null;
  caja_nombre: string | null;
  estado_emitido: string | null;
  descripcion: string | null;
  raw_payload: Record<string, unknown>;
};

function readOwn(row: ZetaVendorPaymentRecord, names: readonly string[]): unknown {
  for (const n of names) {
    if (Object.prototype.hasOwnProperty.call(row, n)) return row[n];
    const want = n.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === want) return row[k];
    }
  }
  return undefined;
}

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const normalized =
    s.includes(",") && s.includes(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseSignedTotal(row: ZetaVendorPaymentRecord): number | null {
  const total = parseNumber(readOwn(row, ["Total", "total"]));
  if (total === null) return null;
  const signo = readOwn(row, ["TotalSigno", "totalSigno"]);
  if (signo === -1 || signo === "-1" || signo === -1.0) return -Math.abs(total);
  if (signo === 1 || signo === "1" || signo === 1.0) return Math.abs(total);
  return Math.abs(total);
}

function normalizeZetaPaymentDateYmd(fecha: string | null): string | null {
  if (!fecha) return null;
  const s = fecha.trim();
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const ymd = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return null;
}

export function mapEmitidoToVendorPaymentStatus(emitido: string | null): "paid" | "void" {
  const e = (emitido ?? "").trim().toUpperCase();
  if (e === "N") return "void";
  return "paid";
}

export function buildZetaVendorPaymentNumber(registroId: string): string {
  return `ZETA:PAG:${String(registroId).trim()}`;
}

function buildReference(m: Pick<CopilotVendorPaymentV1, "serie" | "numero" | "zeta_registro_id">): string | null {
  if (m.serie && m.numero) return `${m.serie}-${m.numero}`;
  if (m.serie) return m.serie;
  if (m.numero) return m.numero;
  return m.zeta_registro_id ? `RID:${m.zeta_registro_id}` : null;
}

export function normalizeZetaVendorPaymentCurrency(
  monedaCodigo: string | null,
  monedaSimbolo: string | null
): "USD" | "UYU" | null {
  const codigo = (monedaCodigo ?? "").trim();
  if (codigo === "1") return "UYU";
  if (codigo === "2") return "USD";

  const simbolo = (monedaSimbolo ?? "").trim().toUpperCase();
  if (simbolo.startsWith("U$S") || simbolo.startsWith("US$") || simbolo.startsWith("USD")) return "USD";
  if (simbolo.startsWith("$") || simbolo.startsWith("UYU")) return "UYU";
  return null;
}

export function mapZetaVendorPaymentToCopilot(row: ZetaVendorPaymentRecord): CopilotVendorPaymentV1 | null {
  const raw_payload: Record<string, unknown> = {};
  for (const k of Object.keys(row)) raw_payload[k] = row[k];

  const regRaw = readOwn(row, ["RegistroId", "registroId"]);
  const registroId = regRaw !== undefined && regRaw !== null ? String(regRaw).trim() : "";
  if (!registroId) return null;

  const fecha = cleanZetaString(readOwn(row, ["Fecha", "fecha"]));
  const monedaCodigo = cleanZetaString(readOwn(row, ["MonedaCodigo", "monedaCodigo"]));
  const monedaSimbolo = cleanZetaString(readOwn(row, ["MonedaSimbolo", "monedaSimbolo"]));
  const serie = cleanZetaString(readOwn(row, ["Serie", "serie"]));
  const numRaw = readOwn(row, ["Numero", "numero", "Número", "número"]);

  return {
    schema_version: 1,
    zeta_registro_id: registroId,
    comprobante_codigo: cleanZetaString(readOwn(row, ["ComprobanteCodigo", "comprobanteCodigo"])),
    comprobante_abreviacion: cleanZetaString(readOwn(row, ["ComprobanteAbreviacion", "comprobanteAbreviacion"])),
    comprobante_nombre: cleanZetaString(readOwn(row, ["ComprobanteNombre", "comprobanteNombre"])),
    proveedor_codigo: cleanZetaString(readOwn(row, ["ProveedorCodigo", "proveedorCodigo"])),
    proveedor_nombre: cleanZetaString(readOwn(row, ["ProveedorNombre", "proveedorNombre"])),
    proveedor_razon_social: cleanZetaString(readOwn(row, ["ProveedorRazonSocial", "proveedorRazonSocial"])),
    payment_date_ymd: normalizeZetaPaymentDateYmd(fecha),
    serie,
    numero: numRaw !== undefined && numRaw !== null ? String(numRaw).trim() : null,
    moneda_codigo: monedaCodigo,
    moneda_simbolo: monedaSimbolo,
    currency_code: normalizeZetaVendorPaymentCurrency(monedaCodigo, monedaSimbolo),
    total: parseSignedTotal(row),
    saldo: parseNumber(readOwn(row, ["Saldo", "saldo"])),
    caja_codigo: cleanZetaString(readOwn(row, ["CajaCodigo", "cajaCodigo"])),
    caja_nombre: cleanZetaString(readOwn(row, ["CajaNombre", "cajaNombre"])),
    estado_emitido: cleanZetaString(readOwn(row, ["Emitido", "emitido"])),
    descripcion: cleanZetaString(readOwn(row, ["Descripcion", "descripcion", "Descripción", "descripción"])),
    raw_payload,
  };
}

export function buildZetaVendorPaymentMetadata(m: CopilotVendorPaymentV1, syncRunId: string): Record<string, unknown> {
  return {
    zeta_registro_id: m.zeta_registro_id,
    sync_run_id: syncRunId,
    comprobante_codigo: m.comprobante_codigo,
    comprobante_abreviacion: m.comprobante_abreviacion,
    comprobante_nombre: m.comprobante_nombre,
    proveedor_codigo: m.proveedor_codigo,
    proveedor_nombre: m.proveedor_nombre,
    proveedor_razon_social: m.proveedor_razon_social,
    moneda_codigo: m.moneda_codigo,
    moneda_simbolo: m.moneda_simbolo,
    currency_code: m.currency_code,
    caja_codigo: m.caja_codigo,
    caja_nombre: m.caja_nombre,
    saldo: m.saldo,
  };
}

export function buildZetaVendorPaymentNotes(m: CopilotVendorPaymentV1, syncRunId: string): string {
  const payload = {
    zeta_vendor_payment_v1: {
      ...buildZetaVendorPaymentMetadata(m, syncRunId),
      raw_payload: m.raw_payload,
    },
  };
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      zeta_vendor_payment_v1: {
        sync_run_id: syncRunId,
        zeta_registro_id: m.zeta_registro_id,
        error: "raw_payload_no_serializable",
      },
    });
  }
}

export type MapVendorPaymentToProtoPaymentResult =
  | { ok: true; input: ProtoPaymentInput }
  | { ok: false; reason: "invalid_fecha"; raw_fecha: string | null }
  | { ok: false; reason: "invalid_amount"; amount: number | null }
  | { ok: false; reason: "negative_amount"; amount: number }
  | { ok: false; reason: "pre_operational_date"; payment_date: string };

export function mapCopilotVendorPaymentToProtoPaymentInput(
  m: CopilotVendorPaymentV1,
  syncRunId: string
): MapVendorPaymentToProtoPaymentResult {
  const amount = m.total;
  if (amount !== null && amount < 0) {
    return { ok: false, reason: "negative_amount", amount };
  }
  if (amount === null || !(amount > 0)) {
    return { ok: false, reason: "invalid_amount", amount };
  }
  const ymd = m.payment_date_ymd;
  if (!ymd) {
    const rawFecha = m.raw_payload.Fecha ?? m.raw_payload.fecha;
    return {
      ok: false,
      reason: "invalid_fecha",
      raw_fecha: rawFecha == null ? null : String(rawFecha),
    };
  }
  if (ymd < COPILOT_OPERATIONAL_START_DATE) {
    return { ok: false, reason: "pre_operational_date", payment_date: ymd };
  }

  const vendorName = m.proveedor_razon_social || m.proveedor_nombre || null;
  const category = m.comprobante_nombre || m.comprobante_abreviacion || "Pago a proveedor";

  return {
    ok: true,
    input: {
      company_id: null,
      payment_number: buildZetaVendorPaymentNumber(m.zeta_registro_id),
      payment_date: ymd,
      amount,
      category,
      vendor_name: vendorName,
      status: mapEmitidoToVendorPaymentStatus(m.estado_emitido),
      reference: buildReference(m),
      notes: buildZetaVendorPaymentNotes(m, syncRunId),
      obligation_id: null,
      currency_code: m.currency_code,
      source: "zeta",
      zeta_metadata: buildZetaVendorPaymentMetadata(m, syncRunId),
    },
  };
}
