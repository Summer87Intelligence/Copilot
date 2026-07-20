import { describe, it, expect } from "vitest";

import { reasonLabel, warningLabel, RECONCILIATION_REASON_LABELS, RECONCILIATION_WARNING_LABELS } from "@/lib/bank/canonical/reconciliation-reason-labels";
import type { ReconciliationReason, ReconciliationWarning } from "@/lib/bank/intelligence/reconciliation-matching";

const ALL_REASONS: ReconciliationReason[] = [
  "CONFIRMED_PAYER", "EXACT_AMOUNT", "MATCHING_RECEIPT", "MATCHING_INVOICE", "DATE_PROXIMITY",
  "REFERENCE_MATCH", "HISTORICAL_PATTERN", "NORMALIZED_NAME_MATCH", "MULTIPLE_CANDIDATES",
  "CURRENCY_MISMATCH", "RECEIPT_DATE_DOMINANCE",
];

const ALL_WARNINGS: ReconciliationWarning[] = [
  "MULTIPLE_STRONG_CANDIDATES", "AMOUNT_DIFFERENCE", "SHARED_PAYER", "POSSIBLE_DUPLICATE",
  "RECEIPT_ALREADY_RECONCILED", "INVOICE_FULLY_PAID", "OUT_OF_DATE_RANGE", "REVERSED_MOVEMENT",
  "NON_COMMERCIAL", "WORKSPACE_MISMATCH", "UNAPPLIED_BALANCE", "RECEIPT_CANDIDATE_COLLISION",
  "MATCHED_MOVEMENT_AUDIT", "HISTORICAL_SHADOW_AUDIT",
];

describe("reasonLabel / warningLabel — nunca exponen el código crudo en español", () => {
  it("traduce las 11 razones del motor a frases en español, ninguna en mayúsculas con guion bajo", () => {
    for (const r of ALL_REASONS) {
      const label = reasonLabel(r);
      expect(label).toBe(RECONCILIATION_REASON_LABELS[r]);
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("traduce las 14 alertas del motor a frases en español, ninguna en mayúsculas con guion bajo", () => {
    for (const w of ALL_WARNINGS) {
      const label = warningLabel(w);
      expect(label).toBe(RECONCILIATION_WARNING_LABELS[w]);
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });
});
