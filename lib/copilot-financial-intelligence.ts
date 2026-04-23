import { copilotApiFetch } from "@/lib/copilot-fetch";

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
  const res = await copilotApiFetch("/api/copilot/cash-status-amounts");
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { available_cash: 0 };
  }
  const body = json as {
    ok?: boolean;
    data?: { inflows: { amount: unknown }[]; outflows: { amount: unknown }[] };
  };
  if (!res.ok || !body.ok || !body.data) {
    return { available_cash: 0 };
  }
  const { inflows, outflows } = body.data;

  const totalInflows = sumAmountColumn(
    inflows as { amount: unknown }[] | null
  );
  const totalOutflows = sumAmountColumn(
    outflows as { amount: unknown }[] | null
  );

  const available_cash = totalInflows - totalOutflows;

  return { available_cash };
}
