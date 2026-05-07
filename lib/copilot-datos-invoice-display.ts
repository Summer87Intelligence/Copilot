/**
 * Etiqueta de factura para `/copilot/datos`: prioriza Serie-Numero (negocio Zeta) sobre `invoice_number` tecnico.
 * Los datos de negocio provienen de `zeta_metadata.zeta_customer_voucher_v1` (sync vouchers) y respaldo en `notes`.
 */

import type { DataRow } from "@/lib/copilot-data";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function readZetaVoucherV1(row: DataRow): Record<string, unknown> | null {
  const zm = row.zeta_metadata;
  if (!isPlainObject(zm)) return null;
  const v1 = zm.zeta_customer_voucher_v1;
  if (!isPlainObject(v1)) return null;
  return v1;
}

function normalizeSerieNumeroStrings(v1: Record<string, unknown>): { serie: string; numero: string } {
  const serieRaw = v1.serie ?? v1.Serie;
  const numRaw = v1.numero ?? v1.Numero;
  const serie =
    typeof serieRaw === "string" ? serieRaw.trim() : serieRaw != null ? String(serieRaw).trim() : "";
  const numero =
    typeof numRaw === "string" ? numRaw.trim() : numRaw != null && String(numRaw).trim() !== ""
      ? String(numRaw).trim()
      : "";
  return { serie, numero };
}

/** Serie+Numero desde `zeta_metadata.zeta_customer_voucher_v1` (merge del pipeline de vouchers). */
export function readInvoiceSerieNumeroFromZetaMetadata(row: DataRow): { serie: string; numero: string } | null {
  const v1 = readZetaVoucherV1(row);
  if (!v1) return null;
  const { serie, numero } = normalizeSerieNumeroStrings(v1);
  if (serie && numero) return { serie, numero };
  return null;
}

/**
 * Respaldo: `notes` del mapper de vouchers es `zeta_vouchers:{run}|{cod}|{Serie}-{Numero}`.
 */
function readSerieNumeroFromNotes(row: DataRow): string | null {
  const notes = String(row.notes ?? "").trim();
  if (!notes.startsWith("zeta_vouchers:")) return null;
  const parts = notes.split("|");
  if (parts.length < 3) return null;
  const tail = parts[parts.length - 1]?.trim() ?? "";
  if (!tail || tail === "-" || tail === "?" || tail === "-?") return null;
  return tail;
}

/**
 * Etiqueta visible priorizando negocio:
 * 1) `Serie-Numero` desde metadata o notes
 * 2) solo `Numero` (o solo `Serie`) si el otro falta
 * 3) `invoice_number` (hash tecnico) solo como ultimo recurso
 */
export function formatInvoiceFacturaPrimary(row: DataRow): string {
  const pair = readInvoiceSerieNumeroFromZetaMetadata(row);
  if (pair) return `${pair.serie}-${pair.numero}`;
  const v1 = readZetaVoucherV1(row);
  if (v1) {
    const { serie, numero } = normalizeSerieNumeroStrings(v1);
    if (numero) return serie ? `${serie}-${numero}` : numero;
    if (serie) return serie;
  }
  const fromNotes = readSerieNumeroFromNotes(row);
  if (fromNotes) return fromNotes;
  const inv = String(row.invoice_number ?? "").trim();
  return inv || "—";
}

/** Hash u opacos (`ZETA:CC:...`); no muestra la clave semantica `ZETA:CCV1:...` como "ref. interna". */
export function formatInvoiceFacturaTechnicalSubtitle(row: DataRow, primary: string): string | null {
  const tech = String(row.invoice_number ?? "").trim();
  if (!tech || tech === primary) return null;
  if (tech.startsWith("ZETA:CCV1:")) return null;
  return tech;
}

/**
 * Moneda real de la factura leyendo en orden de prioridad:
 * 1) currency_code columna directa (ISO normalizado: 'USD' | 'UYU') — escrito por enrichment pipeline
 * 2) zeta_metadata.zeta_customer_voucher_v1.moneda_simbolo (display Zeta: 'U$S' | '$')
 * 3) zeta_metadata.zeta_customer_voucher_v1.moneda_codigo (puede ser numerico o texto)
 * 4) columnas legacy: moneda_codigo, currency, moneda
 * 5) null si no hay informacion confirmada (NO se infiere $ por defecto).
 */
export function readInvoiceCurrency(row: DataRow): "$" | "U$S" | null {
  // 1. currency_code columna directa (ISO: 'USD' | 'UYU')
  const directCode = row.currency_code;
  if (directCode != null) {
    const dc = String(directCode).trim().toUpperCase();
    if (dc === "USD" || dc.includes("U$S") || dc.includes("US$") || dc.includes("DOLAR")) return "U$S";
    if (dc === "UYU" || dc.includes("$") || dc.includes("PES")) return "$";
  }

  const v1 = readZetaVoucherV1(row);

  // 2. moneda_simbolo dentro de zeta_metadata (display Zeta directo)
  if (v1) {
    const simb = v1.moneda_simbolo;
    if (simb != null) {
      const s = String(simb).trim().toUpperCase();
      if (s.includes("U$S") || s.includes("USD") || s.includes("US$") || s.includes("DOLAR")) return "U$S";
      if (s.includes("$") || s.includes("UYU") || s.includes("PES")) return "$";
    }
  }

  // 3. moneda_codigo dentro de zeta_metadata (puede ser numerico)
  const rawMeta = v1 ? v1.moneda_codigo : null;
  const raw = rawMeta ?? row.moneda_codigo ?? row.currency ?? row.moneda;
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  if (s.includes("U$S") || s.includes("USD") || s.includes("US$") || s.includes("DOLAR")) return "U$S";
  if (s.includes("$") || s.includes("UYU") || s.includes("PES")) return "$";
  // Codigos numericos Zeta: 2=USD, 1=UYU
  if (s === "2") return "U$S";
  if (s === "1") return "$";
  return null;
}
