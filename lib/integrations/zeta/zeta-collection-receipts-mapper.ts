/**
 * Fila Zeta (`QueryComprobantes` recibos de cobranza) → modelo interno y `ProtoReceiptInput`.
 * Solo nombres de campo documentados u opcionales explícitos (lista cerrada); sin matching por nombre de cliente.
 */

import type { ZetaCollectionReceiptRecord } from "@/lib/integrations/zeta/contracts/zeta-collection-receipts.contract";
import type { ProtoReceiptInput } from "@/lib/copilot-proto-crud-types";
import { cleanZetaString, mapRutField } from "@/lib/integrations/zeta/zeta-client-mapper";
import { COPILOT_OPERATIONAL_START_DATE } from "@/lib/copilot-operational-period";

export type CopilotCollectionReceiptV1 = {
  schema_version: 1;
  zeta_registro_id: string;
  zeta_cliente_codigo: string | null;
  /** Solo si la fila trae claves documentadas u homónimas API (`ClienteDocumento`, `RUT`, …). */
  cliente_documento: string | null;
  receipt_date_ymd: string | null;
  moneda_codigo: string | null;
  moneda_simbolo: string | null;
  currency_code: "USD" | "UYU" | null;
  importe: number | null;
  medio_pago: string | null;
  referencia_documento: string | null;
  estado_emitido: string | null;
  comprobante_codigo: string | null;
  raw_payload: Record<string, unknown>;
};

function readOwn(row: ZetaCollectionReceiptRecord, names: readonly string[]): unknown {
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
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * `Total` con signo según `TotalSigno` cuando es numérico 1 o -1 (documentación Zeta: Total + TotalSigno).
 */
function parseSignedTotal(row: ZetaCollectionReceiptRecord): number | null {
  const total = parseNumber(readOwn(row, ["Total", "total"]));
  if (total === null) return null;
  const signo = readOwn(row, ["TotalSigno", "totalSigno"]);
  if (signo === -1 || signo === "-1" || signo === -1.0) return -Math.abs(total);
  if (signo === 1 || signo === "1" || signo === 1.0) return Math.abs(total);
  return Math.abs(total);
}

function normalizeZetaReceiptDateYmd(fecha: string | null): string | null {
  if (!fecha) return null;
  const s = fecha.trim();
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const ymd = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return null;
}

function mapEmitidoToReceiptStatus(emitido: string | null): string {
  if (!emitido) return "pending";
  const e = emitido.trim().toUpperCase();
  if (e === "S") return "paid";
  if (e === "N") return "pending";
  return "pending";
}

export function buildZetaCollectionReceiptNumber(registroId: string): string {
  return `ZETA:COB:${String(registroId).trim()}`;
}

function buildReference(row: ZetaCollectionReceiptRecord, registroId: string): string | null {
  const serie = cleanZetaString(readOwn(row, ["Serie", "serie"]));
  const numRaw = readOwn(row, ["Numero", "numero", "Número", "número"]);
  const numero = numRaw !== undefined && numRaw !== null ? String(numRaw).trim() : "";
  if (serie && numero) return `${serie}-${numero}`;
  if (serie) return serie;
  if (numero) return numero;
  const cc = cleanZetaString(readOwn(row, ["ComprobanteCodigo", "comprobanteCodigo"]));
  if (cc) return cc;
  return registroId ? `RID:${registroId}` : null;
}

function pickMedioPago(row: ZetaCollectionReceiptRecord): string | null {
  const descripcion = cleanZetaString(readOwn(row, ["Descripcion", "descripcion", "Descripción", "descripción"]));
  if (descripcion) return descripcion;
  const caja = cleanZetaString(readOwn(row, ["CajaNombre", "cajaNombre"]));
  if (caja) return caja;
  const cob = cleanZetaString(readOwn(row, ["CobradorNombre", "cobradorNombre"]));
  if (cob) return cob;
  return null;
}

export function normalizeZetaReceiptCurrency(
  monedaCodigo: string | null,
  monedaSimbolo: string | null
): "USD" | "UYU" | null {
  const codigo = (monedaCodigo ?? "").trim();
  if (codigo === "1") return "UYU";
  if (codigo === "2") return "USD";

  const simbolo = (monedaSimbolo ?? "").trim().toUpperCase();
  if (simbolo.startsWith("U$S") || simbolo.startsWith("USD")) return "USD";
  if (simbolo.startsWith("$") || simbolo.startsWith("UYU")) return "UYU";
  return null;
}

export function mapZetaCollectionReceiptToCopilot(row: ZetaCollectionReceiptRecord): CopilotCollectionReceiptV1 | null {
  const raw_payload: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    raw_payload[k] = row[k];
  }

  const regRaw = readOwn(row, ["RegistroId", "registroId"]);
  const registroId = regRaw !== undefined && regRaw !== null ? String(regRaw).trim() : "";
  if (!registroId) return null;

  const fecha = cleanZetaString(readOwn(row, ["Fecha", "fecha"]));
  const ymd = normalizeZetaReceiptDateYmd(fecha);
  const importe = parseSignedTotal(row);
  const clienteCodigo = cleanZetaString(readOwn(row, ["ClienteCodigo", "clienteCodigo"]));
  const monedaCodigo = cleanZetaString(readOwn(row, ["MonedaCodigo", "monedaCodigo"]));
  const monedaSimbolo = cleanZetaString(readOwn(row, ["MonedaSimbolo", "monedaSimbolo"]));
  const doc = mapRutField(
    readOwn(row, ["ClienteDocumento", "clienteDocumento", "ClienteRUT", "clienteRut", "RUT", "rut"])
  );

  return {
    schema_version: 1,
    zeta_registro_id: registroId,
    zeta_cliente_codigo: clienteCodigo,
    cliente_documento: doc,
    receipt_date_ymd: ymd,
    moneda_codigo: monedaCodigo,
    moneda_simbolo: monedaSimbolo,
    currency_code: normalizeZetaReceiptCurrency(monedaCodigo, monedaSimbolo),
    importe,
    medio_pago: pickMedioPago(row),
    referencia_documento: buildReference(row, registroId),
    estado_emitido: cleanZetaString(readOwn(row, ["Emitido", "emitido"])),
    comprobante_codigo: cleanZetaString(readOwn(row, ["ComprobanteCodigo", "comprobanteCodigo"])),
    raw_payload,
  };
}

export function buildZetaCollectionReceiptNotes(m: CopilotCollectionReceiptV1, syncRunId: string): string {
  const payload = {
    zeta_collection_receipt_v1: {
      sync_run_id: syncRunId,
      moneda_codigo: m.moneda_codigo,
      moneda_simbolo: m.moneda_simbolo,
      currency_code: m.currency_code,
      comprobante_codigo: m.comprobante_codigo,
      raw_payload: m.raw_payload,
    },
  };
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      zeta_collection_receipt_v1: {
        sync_run_id: syncRunId,
        zeta_registro_id: m.zeta_registro_id,
        error: "raw_payload_no_serializable",
      },
    });
  }
}

export function mapCopilotCollectionReceiptToProtoReceiptInput(
  companyId: string | null,
  m: CopilotCollectionReceiptV1,
  syncRunId: string
): MapCollectionReceiptToProtoReceiptResult {
  const amount = m.importe ?? 0;
  if (amount < 0) {
    return { ok: false, reason: "negative_amount", amount };
  }
  if (!(amount > 0)) {
    return { ok: false, reason: "invalid_amount", amount };
  }
  const ymd = m.receipt_date_ymd;
  if (!ymd) {
    const rawFecha = m.raw_payload.Fecha ?? m.raw_payload.fecha;
    return {
      ok: false,
      reason: "invalid_fecha",
      raw_fecha: rawFecha == null ? null : String(rawFecha),
    };
  }
  if (ymd < COPILOT_OPERATIONAL_START_DATE) {
    return {
      ok: false,
      reason: "pre_operational_date",
      receipt_date: ymd,
    };
  }

  return {
    ok: true,
    input: {
      company_id: companyId,
      invoice_id: null,
      receipt_number: buildZetaCollectionReceiptNumber(m.zeta_registro_id),
      receipt_date: ymd,
      amount,
      currency_code: m.currency_code,
      payment_method: m.medio_pago,
      status: mapEmitidoToReceiptStatus(m.estado_emitido),
      reference: m.referencia_documento,
      notes: buildZetaCollectionReceiptNotes(m, syncRunId),
    },
  };
}

export type MapCollectionReceiptToProtoReceiptResult =
  | { ok: true; input: ProtoReceiptInput }
  | { ok: false; reason: "invalid_fecha"; raw_fecha: string | null }
  | { ok: false; reason: "invalid_amount"; amount: number }
  | { ok: false; reason: "negative_amount"; amount: number }
  | { ok: false; reason: "pre_operational_date"; receipt_date: string };
