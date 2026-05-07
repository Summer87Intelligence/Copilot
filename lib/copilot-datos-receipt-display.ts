/**
 * Helpers de display para `proto_receipts` en `/copilot/datos`.
 *
 * El sync de recibos persiste:
 *  - `currency_code` ISO directo en columna (`USD` | `UYU`).
 *  - `notes` JSON con `zeta_collection_receipt_v1.{currency_code, moneda_simbolo, moneda_codigo, raw_payload}`
 *    como respaldo (formato del mapper `zeta-collection-receipts-mapper.ts`).
 *
 * El orden de prioridad emula `readInvoiceCurrency` para mantener consistencia visual con la grilla de facturas.
 * NO se infiere `$` por defecto cuando no hay info confirmada.
 */

import type { DataRow } from "@/lib/copilot-data";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function readReceiptZetaV1FromNotes(row: DataRow): Record<string, unknown> | null {
  const raw = row.notes;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) return null;
    const v1 = parsed.zeta_collection_receipt_v1;
    return isPlainObject(v1) ? v1 : null;
  } catch {
    return null;
  }
}

function classifyCurrencySymbol(s: string): "$" | "U$S" | null {
  const u = s.toUpperCase();
  if (!u) return null;
  if (u === "USD" || u.includes("U$S") || u.includes("US$") || u.includes("DOLAR")) return "U$S";
  if (u === "UYU" || u.includes("PES")) return "$";
  if (u.includes("$")) return "$";
  if (u === "2") return "U$S";
  if (u === "1") return "$";
  return null;
}

function symbolToIso(sym: "$" | "U$S"): "USD" | "UYU" {
  return sym === "U$S" ? "USD" : "UYU";
}

/**
 * Símbolo de moneda visible para un recibo. Devuelve `null` si no se puede determinar
 * (la grilla rendea `—` en ese caso, NO `$` por defecto).
 *
 * Prioridad:
 *  1) Columna `currency_code` (ISO).
 *  2) `notes → zeta_collection_receipt_v1.currency_code` (ISO de respaldo).
 *  3) `notes → zeta_collection_receipt_v1.moneda_simbolo` (display Zeta directo: `U$S`, `$`).
 *  4) `notes → zeta_collection_receipt_v1.moneda_codigo` (códigos numéricos Zeta: 1=UYU, 2=USD).
 *  5) Columnas legacy ad-hoc por si llegan importes manuales.
 */
export function readReceiptCurrency(row: DataRow): "$" | "U$S" | null {
  const direct = row.currency_code;
  if (direct != null) {
    const out = classifyCurrencySymbol(String(direct).trim());
    if (out) return out;
  }

  const v1 = readReceiptZetaV1FromNotes(row);
  if (v1) {
    const iso = v1.currency_code;
    if (iso != null) {
      const out = classifyCurrencySymbol(String(iso).trim());
      if (out) return out;
    }
    const simb = v1.moneda_simbolo;
    if (simb != null) {
      const out = classifyCurrencySymbol(String(simb).trim());
      if (out) return out;
    }
    const cod = v1.moneda_codigo;
    if (cod != null) {
      const out = classifyCurrencySymbol(String(cod).trim());
      if (out) return out;
    }
  }

  const legacy = row.currency ?? row.moneda ?? row.moneda_codigo;
  if (legacy != null) {
    const out = classifyCurrencySymbol(String(legacy).trim());
    if (out) return out;
  }

  return null;
}

/**
 * Versión ISO de `readReceiptCurrency` para mostrar la moneda como texto en paneles
 * de detalle (sidebar). Reutiliza la MISMA cadena de fallbacks que la grilla, así que
 * tabla y sidebar siempre coinciden:
 *  - "USD" cuando la tabla rendea "U$S".
 *  - "UYU" cuando la tabla rendea "$".
 *  - `null` cuando la grilla mostraría "—" (sin asumir UYU por defecto).
 */
export function readReceiptCurrencyIso(row: DataRow): "USD" | "UYU" | null {
  const sym = readReceiptCurrency(row);
  return sym ? symbolToIso(sym) : null;
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Formatea importe con símbolo de moneda en estilo es-UY (mismo formato que facturas).
 * Si no hay moneda determinable, devuelve solo el importe formateado (NO antepone `$`).
 */
export function formatReceiptAmountWithCurrency(row: DataRow, v: unknown): string {
  const n = parseAmount(v);
  if (n == null) return "—";
  const cur = readReceiptCurrency(row);
  const formatted = n.toLocaleString("es-UY", { maximumFractionDigits: 2 });
  return cur ? `${cur} ${formatted}` : formatted;
}
