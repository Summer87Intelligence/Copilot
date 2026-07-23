/**
 * Dry-run local de exclusión 2025 + duplicados A/B.
 * NO escribe producción.
 *
 * Uso: npx tsx scripts/bank-2026-cleanup-dry-run.ts
 */
import { classifyDedupeGroup, type DedupeCandidateGroup } from "../lib/bank-movements/bank-dedupe-safety";
import {
  BANK_EXCLUSION_REASON_BEFORE_2026,
  MIN_BANK_OPERATIONAL_DATE,
} from "../lib/bank/canonical/historical-policy";

export type CleanupSnapshot = {
  generatedAt: string;
  minBankOperationalDate: string;
  exclusionReason2026: string;
  note: string;
};

/** Clasifica grupos de ejemplo / audit para el reporte dry-run. */
export function summarizeDedupeClasses(groups: DedupeCandidateGroup[]) {
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const g of groups) {
    const c = classifyDedupeGroup(g);
    if (c === "A_exact_safe") counts.A += 1;
    else if (c === "B_cross_parser_safe") counts.B += 1;
    else if (c === "C_ambiguous") counts.C += 1;
    else counts.D += 1;
  }
  return counts;
}

export function buildCleanupDryRunSkeleton(): CleanupSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    minBankOperationalDate: MIN_BANK_OPERATIONAL_DATE,
    exclusionReason2026: BANK_EXCLUSION_REASON_BEFORE_2026,
    note:
      "Dry-run only. Apply exclusion/dedupe marks only after explicit authorization. No hard deletes.",
  };
}

const skeleton = buildCleanupDryRunSkeleton();
console.log(JSON.stringify(skeleton, null, 2));
console.log(
  "\nPara apply productivo: snapshot + dry-run A/B only + marcar excluded_from_operations (reversible)."
);
