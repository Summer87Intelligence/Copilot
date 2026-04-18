import { loadCashStatusAmountRows } from "@/lib/data/proto-analytics-read-repository";
import { supabase } from "@/lib/supabase-client";

function sumAmountColumn(rows: { amount: unknown }[] | null): number {
  let t = 0;
  for (const r of rows ?? []) {
    const n = Number(r.amount ?? 0);
    if (Number.isFinite(n)) t += n;
  }
  return t;
}

/**
 * Posición de caja simplificada: ingresos (recibos) menos egresos (pagos operativos).
 * Usa suma de `amount` en proto_receipts y proto_payments.
 */
export async function getCashStatus(): Promise<{ available_cash: number }> {
  const { inflows, outflows } = await loadCashStatusAmountRows(supabase);

  const totalInflows = sumAmountColumn(
    inflows as { amount: unknown }[] | null
  );
  const totalOutflows = sumAmountColumn(
    outflows as { amount: unknown }[] | null
  );

  const available_cash = totalInflows - totalOutflows;

  return { available_cash };
}
