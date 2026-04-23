/**
 * Utilidades UI para la pestaña Facturas en `/copilot/datos`: enriquecer con cliente y filtrar por emisión.
 */

import type { DataRow } from "@/lib/copilot-data";
import { companyPrimaryLabel } from "@/lib/copilot-datos-company-display";

export const INVOICE_CLIENT_CODIGO_KEY = "client_codigo_display" as const;
export const INVOICE_CLIENT_RAZON_KEY = "client_razon_display" as const;

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
    };
  });
}
