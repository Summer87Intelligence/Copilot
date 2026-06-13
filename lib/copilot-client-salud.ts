/**
 * Estado visible de salud del cliente — reglas unificadas para listados y 360.
 * No mezcla sync/stale con deuda; usar "Datos por revisar" solo vía sync explícito.
 */

import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";

export type ClientSaludKey = "al_dia" | "pendiente" | "atrasado" | "critico";

export const CLIENT_SALUD_LABEL: Record<ClientSaludKey, string> = {
  al_dia: "Al día",
  pendiente: "Pendiente",
  atrasado: "Atrasado",
  critico: "Crítico",
};

export function maxOverdueDaysFromRow(row: {
  overdue_days_uyu?: number | null;
  overdue_days_usd?: number | null;
}): number {
  const days = [row.overdue_days_uyu, row.overdue_days_usd].filter(
    (d): d is number => typeof d === "number" && d > 0
  );
  return days.length ? Math.max(...days) : 0;
}

/** Portfolio hub / Clientes — total pendiente, atraso y +90 días. */
export function derivePortfolioSalud(row: ClientPortfolioRow): ClientSaludKey {
  const hasDebt = row.debt_uyu > 0 || row.debt_usd > 0;
  if (!hasDebt) return "al_dia";

  const hasOverdue = (row.overdue_uyu ?? 0) > 0 || (row.overdue_usd ?? 0) > 0;
  if (!hasOverdue) return "pendiente";

  if (maxOverdueDaysFromRow(row) >= 90) return "critico";
  return "atrasado";
}

export function computeMaxOverdueDaysFromInvoices(
  invoices: readonly { due_date?: string | null; balance_amount?: number | null }[],
  todayYmd: string
): number {
  let max = 0;
  for (const inv of invoices) {
    const bal = Number(inv.balance_amount ?? 0);
    const due = inv.due_date?.slice(0, 10) ?? "";
    if (bal <= 0 || !due || due >= todayYmd) continue;
    const dueMs = new Date(`${due}T12:00:00`).getTime();
    const todayMs = new Date(`${todayYmd}T12:00:00`).getTime();
    const days = Math.floor((todayMs - dueMs) / (24 * 60 * 60 * 1000));
    if (days > max) max = days;
  }
  return max;
}

export function deriveDebtSaludFromTotals(input: {
  debtUyu: number;
  debtUsd: number;
  overdueUyu: number;
  overdueUsd: number;
  maxOverdueDays?: number;
}): ClientSaludKey {
  const hasDebt = input.debtUyu > 0 || input.debtUsd > 0;
  if (!hasDebt) return "al_dia";
  const hasOverdue = input.overdueUyu > 0 || input.overdueUsd > 0;
  if (!hasOverdue) return "pendiente";
  if ((input.maxOverdueDays ?? 0) >= 90) return "critico";
  return "atrasado";
}
