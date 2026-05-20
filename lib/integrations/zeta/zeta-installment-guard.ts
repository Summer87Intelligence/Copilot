/**
 * Guard helper: checks open installment saldo before allowing an invoice close.
 *
 * Returns the sum of open cuota_saldo for the invoice, or null if the query
 * fails. Callers MUST treat null as "block close" (conservative).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const INSTALLMENT_SALDO_EPSILON = 0.005;

/**
 * Sums `cuota_saldo` for all installments linked to the given invoice that
 * have a meaningful pending saldo (> INSTALLMENT_SALDO_EPSILON).
 *
 * Returns `null` on any DB error — callers should treat this as "block close".
 */
export async function sumOpenInstallmentSaldoForInvoice(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  invoiceId: string
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("proto_invoice_installments")
      .select("cuota_saldo")
      .eq("workspace_company_id", workspaceCompanyId)
      .eq("invoice_id", invoiceId)
      .gt("cuota_saldo", INSTALLMENT_SALDO_EPSILON);

    if (error) return null;

    const rows = (data ?? []) as Array<{ cuota_saldo: unknown }>;
    let total = 0;
    for (const row of rows) {
      const v = typeof row.cuota_saldo === "number" ? row.cuota_saldo : Number(row.cuota_saldo);
      if (Number.isFinite(v) && v > INSTALLMENT_SALDO_EPSILON) total += v;
    }
    return Math.round(total * 100) / 100;
  } catch {
    return null;
  }
}
