/**
 * Utilidades UI para la pestaña Facturas en `/copilot/datos`: enriquecer con cliente y filtrar por emisión.
 */

import type { DataRow } from "@/lib/copilot-data";
import { companyPrimaryLabel } from "@/lib/copilot-datos-company-display";

export const INVOICE_CLIENT_CODIGO_KEY = "client_codigo_display" as const;
export const INVOICE_CLIENT_RAZON_KEY = "client_razon_display" as const;
export const INVOICE_IS_NC_KEY = "_invoice_is_nc" as const;
export const INVOICE_TIPO_DISPLAY_KEY = "_invoice_tipo_display" as const;
export const INVOICE_SOURCE_KEY = "_invoice_source" as const;

const CFE_NC_TIPOS: readonly number[] = [112, 181, 182];

const CFE_TIPO_LABELS: Record<number, string> = {
  111: "Factura",
  112: "Nota de crédito",
  181: "Nota de crédito",
  182: "Nota de crédito",
};

function readCfeTipoNumber(row: DataRow): number | null {
  // prefer raw_payload.Tipo (what detectIsNc uses)
  const raw = row.raw_payload;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const tipo = (raw as Record<string, unknown>).Tipo;
    if (tipo != null) {
      const n = typeof tipo === "number" ? tipo : parseInt(String(tipo), 10);
      if (Number.isFinite(n)) return n;
    }
  }
  // fallback to zeta_metadata.zeta_customer_voucher_v1.cfe_tipo
  const meta = row.zeta_metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const ccv1 = (meta as Record<string, unknown>).zeta_customer_voucher_v1;
    if (ccv1 && typeof ccv1 === "object" && !Array.isArray(ccv1)) {
      const ct = (ccv1 as Record<string, unknown>).cfe_tipo;
      if (ct != null) {
        const n = typeof ct === "number" ? ct : parseInt(String(ct), 10);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

function detectIsNc(row: DataRow): boolean {
  const n = readCfeTipoNumber(row);
  return n != null && CFE_NC_TIPOS.includes(n);
}

function detectTipoDisplay(row: DataRow): string {
  const n = readCfeTipoNumber(row);
  if (n == null) return "Factura";
  return CFE_TIPO_LABELS[n] ?? `CFE ${n}`;
}

function detectInvoiceSource(row: DataRow): string {
  const num = String(row.invoice_number ?? "").trim();
  if (num.startsWith("ZETA:")) return "Zeta";
  if (row.zeta_metadata != null) return "Zeta";
  return "Manual";
}

/** `issue_date` como Y-M-D sin depender de zona horaria del runtime. */
export function parseInvoiceIssueYmd(row: DataRow): { y: number; m: number; d: number } | null {
  const s = String(row.issue_date ?? "").trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { y, m: mo, d };
}

export function invoiceIssueInCalendarMonth(row: DataRow, year: number, month1to12: number): boolean {
  const p = parseInvoiceIssueYmd(row);
  if (!p) return false;
  return p.y === year && p.m === month1to12;
}

export function invoiceIssueInClosedRange(row: DataRow, fromYmd: string, toYmd: string): boolean {
  const p = parseInvoiceIssueYmd(row);
  if (!p) return false;
  const cur = `${String(p.y).padStart(4, "0")}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  const from = fromYmd.trim().slice(0, 10);
  const to = toYmd.trim().slice(0, 10);
  if (from && cur < from) return false;
  if (to && cur > to) return false;
  return true;
}

export function enrichInvoiceRowsForDatos(invoices: DataRow[], companies: DataRow[]): DataRow[] {
  const byId = new Map<string, DataRow>();
  for (const c of companies) {
    const id = String(c.id ?? "").trim();
    if (id) byId.set(id, c);
  }
  return invoices.map((inv) => {
    const c = byId.get(String(inv.company_id ?? "").trim());
    const cod = c != null ? String(c.Codigo ?? "").trim() : "";
    const razon = c != null ? companyPrimaryLabel(c) : "";
    return {
      ...inv,
      [INVOICE_CLIENT_CODIGO_KEY]: cod || "—",
      [INVOICE_CLIENT_RAZON_KEY]: razon || "—",
      [INVOICE_IS_NC_KEY]: detectIsNc(inv),
      [INVOICE_TIPO_DISPLAY_KEY]: detectTipoDisplay(inv),
      [INVOICE_SOURCE_KEY]: detectInvoiceSource(inv),
    };
  });
}
