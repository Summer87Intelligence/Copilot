/**
 * Etiqueta de factura para `/copilot/datos`: prioriza Serie–Numero (negocio Zeta) sobre `invoice_number` técnico.
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
 * 3) `invoice_number` (hash técnico) solo como último recurso
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

/** Hash u opacos (`ZETA:CC:…`); no muestra la clave semántica `ZETA:CCV1:…` como “ref. interna”. */
export function formatInvoiceFacturaTechnicalSubtitle(row: DataRow, primary: string): string | null {
  const tech = String(row.invoice_number ?? "").trim();
  if (!tech || tech === primary) return null;
  if (tech.startsWith("ZETA:CCV1:")) return null;
  return tech;
}
