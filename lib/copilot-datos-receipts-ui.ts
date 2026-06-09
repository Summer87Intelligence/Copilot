import type { DataRow } from "@/lib/copilot-data";
import { companyPrimaryLabel } from "@/lib/copilot-datos-company-display";

export const RECEIPT_REF_DISPLAY_KEY = "receipt_ref_display" as const;
export const RECEIPT_CLIENT_NAME_KEY = "receipt_client_name_display" as const;
export const RECEIPT_SOURCE_KEY = "_receipt_source" as const;

function detectReceiptSource(rec: DataRow): string {
  const num = String(rec.receipt_number ?? "").trim();
  if (num.startsWith("ZETA:")) return "Zeta";
  if (rec.zeta_metadata != null) return "Zeta";
  return "Manual";
}

export function enrichReceiptRowsForDatos(receipts: DataRow[], companies: DataRow[]): DataRow[] {
  const byId = new Map<string, DataRow>();
  for (const c of companies) {
    const id = String(c.id ?? "").trim();
    if (id) byId.set(id, c);
  }
  return receipts.map((rec) => {
    const ref = String(rec.reference ?? "").trim();
    const refDisplay =
      ref && !ref.startsWith("ZETA:") ? ref : String(rec.receipt_number ?? "").trim() || "—";
    const c = byId.get(String(rec.company_id ?? "").trim());
    const clientName = c != null ? companyPrimaryLabel(c) : "Cliente no identificado";
    return {
      ...rec,
      [RECEIPT_REF_DISPLAY_KEY]: refDisplay,
      [RECEIPT_CLIENT_NAME_KEY]: clientName,
      [RECEIPT_SOURCE_KEY]: detectReceiptSource(rec),
    };
  });
}
