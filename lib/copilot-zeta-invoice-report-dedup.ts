import type { DataRow } from "@/lib/data/proto-operational-read-repository";
import { dedupeZetaShadowInvoicesCanonical } from "@/lib/copilot-zeta-invoice-canonical-dedup";

/**
 * Legacy wrapper — delegates to the canonical dedup.
 * Kept so existing importers (Trends, Net Sales Report, Finanzas CEO) don't
 * need to change their import paths; all dedup logic now lives in
 * `lib/copilot-zeta-invoice-canonical-dedup.ts`.
 */
export function dedupeZetaShadowInvoicesForReporting(invoices: DataRow[]): DataRow[] {
  return dedupeZetaShadowInvoicesCanonical(invoices);
}
