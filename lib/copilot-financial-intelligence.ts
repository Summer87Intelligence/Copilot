import { supabase } from "@/lib/supabase-client";

const ROW_CAP = 5000;

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
  const [inRes, outRes] = await Promise.all([
    supabase
      .from("proto_receipts")
      .select("amount")
      .eq("is_active", true)
      .limit(ROW_CAP),
    supabase
      .from("proto_payments")
      .select("amount")
      .eq("is_active", true)
      .limit(ROW_CAP),
  ]);

  if (inRes.error) throw new Error(inRes.error.message);
  if (outRes.error) throw new Error(outRes.error.message);

  const totalInflows = sumAmountColumn(
    inRes.data as { amount: unknown }[] | null
  );
  const totalOutflows = sumAmountColumn(
    outRes.data as { amount: unknown }[] | null
  );

  const available_cash = totalInflows - totalOutflows;

  return { available_cash };
}
