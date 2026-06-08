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

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Opening ledger autoritativo para la moneda (null = derivar del historial). */
export function resolveAuthoritativeLedgerOpening(
  block: AccountStatementByCurrency
): number | null {
  return block.ledgerOpeningBalance;
}

/**
 * Saldo anterior al inicio del período (`from`).
 * Con `ledgerOpeningBalance` configurado: devuelve ese valor (no suma pre-período).
 * Sin opening ledger: último running balance pre-`from`, o baseline si no hay movimientos previos.
 */
export function getPreviousBalance(
  block: AccountStatementByCurrency,
  from: string | undefined
): number {
  const ledgerOpening = resolveAuthoritativeLedgerOpening(block);
  if (ledgerOpening != null) {
    return ledgerOpening;
  }
  if (!from) return block.baselineBalance ?? 0;
  const before = block.movements.filter((m) => m.date < from);
  return before.length > 0
    ? before[before.length - 1]!.runningBalance
    : (block.baselineBalance ?? 0);
}

function recomputeRunningBalancesFromOpening(
  movements: AccountStatementMovement[],
  opening: number
): AccountStatementMovement[] {
  let running = opening;
  return movements.map((m) => {
    running = round2(running + m.debit - m.credit);
    return { ...m, runningBalance: running };
  });
}

export function filterBlockForPeriod(
  block: AccountStatementByCurrency,
  from: string | undefined,
  to: string | undefined
): AccountStatementByCurrency {
  if (!from && !to) return block;
  let mvs = block.movements.filter((m) => {
    if (from && m.date < from) return false;
    if (to && m.date > to) return false;
    return true;
  });

  const ledgerOpening = resolveAuthoritativeLedgerOpening(block);
  const previousBalance = getPreviousBalance(block, from);

  if (ledgerOpening != null) {
    mvs = recomputeRunningBalancesFromOpening(mvs, ledgerOpening);
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const m of mvs) {
    totalDebit += m.debit;
    totalCredit += m.credit;
  }

  const finalBalance =
    mvs.length > 0
      ? mvs[mvs.length - 1]!.runningBalance
      : previousBalance;

  return {
    ...block,
    movements: mvs,
    summary: {
      ...block.summary,
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      finalBalance,
      totalInvoiced: round2(totalDebit),
      totalCollected: round2(totalCredit),
      pendingBalance: finalBalance,
      movementCount: mvs.length,
      hasNegativeBalance: finalBalance < 0,
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
    const filtered = filterBlockForPeriod(rawBlock, from, to);
    const previousBalance = getPreviousBalance(rawBlock, from);
    const finalBalance = filtered.summary.finalBalance;
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
