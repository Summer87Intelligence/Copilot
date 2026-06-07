/**
 * Modelo de período para estado de cuenta — fuente única preview JSON + PDF.
 * `getPreviousBalance` / `filterBlockForPeriod` deben importarse desde aquí.
 */

import type {
  AccountStatementByCurrency,
  AccountStatementMovement,
  ClientAccountStatement,
} from "@/lib/copilot-client-account-statement";

export function toFiniteOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function resolveLedgerOpeningBalances(
  company: Record<string, unknown> | null | undefined
): { openingBalanceUyu: number | null; openingBalanceUsd: number | null } {
  return {
    openingBalanceUyu: toFiniteOrNull(company?.ledger_opening_balance_uyu),
    openingBalanceUsd: toFiniteOrNull(company?.ledger_opening_balance_usd),
  };
}

/**
 * Saldo anterior al inicio del período (`from`).
 * Si no hay movimientos previos al `from`, usa `baselineBalance` (opening ledger).
 */
export function getPreviousBalance(
  block: AccountStatementByCurrency,
  from: string | undefined
): number {
  if (!from) return block.baselineBalance ?? 0;
  const before = block.movements.filter((m) => m.date < from);
  return before.length > 0
    ? before[before.length - 1]!.runningBalance
    : (block.baselineBalance ?? 0);
}

export function filterBlockForPeriod(
  block: AccountStatementByCurrency,
  from: string | undefined,
  to: string | undefined
): AccountStatementByCurrency {
  if (!from && !to) return block;
  const mvs = block.movements.filter((m) => {
    if (from && m.date < from) return false;
    if (to && m.date > to) return false;
    return true;
  });
  let totalDebit = 0;
  let totalCredit = 0;
  for (const m of mvs) {
    totalDebit += m.debit;
    totalCredit += m.credit;
  }
  const netChange = totalDebit - totalCredit;
  const lastRunning = mvs[mvs.length - 1]?.runningBalance;
  return {
    ...block,
    movements: mvs,
    summary: {
      ...block.summary,
      totalDebit,
      totalCredit,
      finalBalance: lastRunning ?? getPreviousBalance(block, from),
      totalInvoiced: totalDebit,
      totalCollected: totalCredit,
      pendingBalance: lastRunning ?? getPreviousBalance(block, from),
      movementCount: mvs.length,
      hasNegativeBalance: (lastRunning ?? getPreviousBalance(block, from)) < 0,
    },
  };
}

export type AccountStatementPeriodBlock = {
  currency: "UYU" | "USD";
  previousBalance: number;
  finalBalance: number;
  summary: AccountStatementByCurrency["summary"];
  movements: Omit<AccountStatementMovement, "raw">[];
};

export function stripMovementRaw(
  mvs: readonly AccountStatementMovement[]
): Omit<AccountStatementMovement, "raw">[] {
  return mvs.map((mv) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { raw: _raw, ...rest } = mv;
    return rest;
  });
}

export function buildAccountStatementPeriodBlocks(
  statement: ClientAccountStatement,
  currencies: Array<"UYU" | "USD">,
  from: string | undefined,
  to: string | undefined
): AccountStatementPeriodBlock[] {
  return currencies.map((cur) => {
    const rawBlock = cur === "UYU" ? statement.uyu : statement.usd;
    const previousBalance = getPreviousBalance(rawBlock, from);
    const filtered = filterBlockForPeriod(rawBlock, from, to);
    const finalBalance =
      filtered.movements.length > 0
        ? filtered.movements[filtered.movements.length - 1]!.runningBalance
        : previousBalance;
    return {
      currency: cur,
      previousBalance,
      finalBalance,
      summary: filtered.summary,
      movements: stripMovementRaw(filtered.movements),
    };
  });
}

/** Monto con signo para columnas Saldo (es-UY). Debe/Haber siguen siendo positivos. */
export function formatSignedBalanceAmount(n: number): string {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n).toLocaleString("es-UY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (n === 0) return abs;
  return n < 0 ? `-${abs}` : abs;
}
