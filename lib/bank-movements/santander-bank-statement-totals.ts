import type { SantanderParsedBankMovement } from "@/lib/bank-movements/santander-pdf-parser";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeSantanderMovementTotals(movements: SantanderParsedBankMovement[]): {
  inflows: number;
  outflows: number;
  net: number;
} {
  let inflows = 0;
  let outflows = 0;
  for (const m of movements) {
    if (m.direction === "inflow" && m.credit != null) inflows += m.credit;
    if (m.direction === "outflow" && m.debit != null) outflows += m.debit;
  }
  return {
    inflows: roundMoney(inflows),
    outflows: roundMoney(outflows),
    net: roundMoney(inflows - outflows),
  };
}
