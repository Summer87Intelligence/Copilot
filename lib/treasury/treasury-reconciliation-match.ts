import type {
  BankReconciliationMovement,
  ManualCashMovement,
} from "@/lib/treasury/treasury-types";

export type TreasuryMatchSuggestion = {
  bankId: string;
  manualId: string;
  amountDelta: number;
  dayDelta: number;
  confidence: number;
};

export function computeMatchSuggestions(
  bankMovements: readonly BankReconciliationMovement[],
  manualMovements: readonly ManualCashMovement[]
): TreasuryMatchSuggestion[] {
  const openBank = bankMovements.filter(
    (b) => b.matchStatus === "unmatched" || b.matchStatus === "partial"
  );
  const openManual = manualMovements.filter((m) => m.status === "active" && !m.reconciled);
  const suggestions: TreasuryMatchSuggestion[] = [];

  for (const bank of openBank) {
    for (const manual of openManual) {
      if (bank.currencyCode !== manual.currencyCode) continue;
      const amountDelta = Math.abs(bank.amount - manual.amount);
      const bankMs = Date.parse(`${bank.movementDate}T12:00:00.000Z`);
      const manualMs = Date.parse(`${manual.movementDate}T12:00:00.000Z`);
      const dayDelta =
        Number.isFinite(bankMs) && Number.isFinite(manualMs)
          ? Math.abs(Math.round((bankMs - manualMs) / 86_400_000))
          : 99;
      if (amountDelta > 0.01 || dayDelta > 7) continue;
      const confidence = Math.max(40, Math.round(100 - amountDelta * 10 - dayDelta * 5));
      suggestions.push({
        bankId: bank.id,
        manualId: manual.id,
        amountDelta,
        dayDelta,
        confidence,
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 24);
}

export function bestMatchSuggestionForBank(
  bank: BankReconciliationMovement,
  manualMovements: readonly ManualCashMovement[]
): TreasuryMatchSuggestion | null {
  return (
    computeMatchSuggestions([bank], manualMovements).find((s) => s.bankId === bank.id) ?? null
  );
}
