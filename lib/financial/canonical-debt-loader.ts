/**
 * CANONICAL DEBT LOADER — capa de datos única para debt units.
 *
 * Mapea filas `proto_invoices` / `proto_invoice_installments` a las entradas
 * canónicas y carga cuotas EN BATCH (nunca una query por factura ni por
 * cliente). Cliente 360, Cartera, Hoy y Reportes deben cargar cuotas por acá.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import { toSafeNumber } from "@/lib/copilot-numeric-parse";
import type {
  CanonicalInstallmentInput,
  CanonicalInvoiceInput,
} from "@/lib/financial/canonical/types";

/** Chunk para `.in(...)` — evita URLs demasiado largas con muchos ids. */
const IN_CHUNK = 300;

function num(v: unknown): number {
  return toSafeNumber(v) ?? 0;
}

/** Mapea una fila `proto_invoices` a la entrada canónica de deuda. */
export function invoiceRowToCanonical(row: Record<string, unknown>): CanonicalInvoiceInput {
  return {
    id: row.id != null ? String(row.id) : null,
    company_id: row.company_id != null ? String(row.company_id) : null,
    currency_code: row.currency_code != null ? String(row.currency_code) : null,
    total_amount: num(row.total_amount),
    balance_amount: row.balance_amount != null ? num(row.balance_amount) : null,
    status: row.status != null ? String(row.status) : null,
    issue_date: row.issue_date != null ? String(row.issue_date) : null,
    due_date: row.due_date != null ? String(row.due_date) : null,
    is_credit_note: isCreditNoteFromMetadata(row.zeta_metadata),
    is_active: (row.is_active as boolean | null | undefined) ?? null,
  };
}

function installmentRowToCanonical(row: Record<string, unknown>): CanonicalInstallmentInput {
  return {
    id: row.id != null ? String(row.id) : undefined,
    invoice_id: row.invoice_id != null ? String(row.invoice_id) : null,
    currency_code: row.currency_code != null ? String(row.currency_code) : null,
    cuota_saldo: num(row.cuota_saldo),
    cuota_vencimiento: row.cuota_vencimiento != null ? String(row.cuota_vencimiento) : null,
    is_active: (row.is_active as boolean | null | undefined) ?? null,
  };
}

/**
 * Carga cuotas abiertas de un conjunto de facturas EN BATCH (chunked). Degrada
 * a `[]` si la tabla no existe o la consulta falla — el aging cae a nivel
 * factura sin regresión. Nunca hace una query por factura.
 */
export async function fetchCanonicalInstallments(
  client: SupabaseClient,
  workspaceCompanyId: string,
  invoiceIds: readonly string[]
): Promise<CanonicalInstallmentInput[]> {
  const ids = invoiceIds.filter(Boolean);
  if (ids.length === 0) return [];
  const out: CanonicalInstallmentInput[] = [];
  try {
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const chunk = ids.slice(i, i + IN_CHUNK);
      const { data, error } = await client
        .from("proto_invoice_installments")
        .select("id, invoice_id, currency_code, cuota_saldo, cuota_vencimiento, is_active")
        .eq("workspace_company_id", workspaceCompanyId)
        .in("invoice_id", chunk as string[]);
      if (error) return []; // tabla ausente o error → degradar sin romper
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        out.push(installmentRowToCanonical(r));
      }
    }
  } catch {
    return [];
  }
  return out;
}
