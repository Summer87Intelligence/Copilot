import type { DebtorCollectionRow } from "@/lib/copilot-hoy-executive";

/** Prioridad de mora: 1 = más urgente (vencido >90d) … 5 = al día. */
export function debtorAgingSortRank(row: DebtorCollectionRow): number {
  if (!row.flags.hasOverdue) return 5;
  const days = row.overdueDays ?? 0;
  if (days > 90) return 1;
  if (days > 60) return 2;
  if (days > 30) return 3;
  return 4;
}

export function sortDebtorRowsByAging(rows: DebtorCollectionRow[]): DebtorCollectionRow[] {
  return [...rows].sort((a, b) => {
    const rankDiff = debtorAgingSortRank(a) - debtorAgingSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    const vA = a.vencido?.amount ?? 0;
    const vB = b.vencido?.amount ?? 0;
    if (vB !== vA) return vB - vA;
    if (b.deuda.amount !== a.deuda.amount) return b.deuda.amount - a.deuda.amount;
    if (a.currency !== b.currency) return a.currency === "UYU" ? -1 : 1;
    return a.name.localeCompare(b.name, "es");
  });
}
