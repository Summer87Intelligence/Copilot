import { describe, expect, it } from "vitest";

import { buildNumericPageTokens } from "@/lib/ui/numeric-pagination";
import {
  classifyDedupeGroup,
  isAutoSafeDedupeClass,
  planSafeDuplicateMarks,
} from "@/lib/bank-movements/bank-dedupe-safety";
import {
  BANK_OPERATIONAL_START_DATE,
  BANK_INTELLIGENCE_CUTOFF_DATE,
  MIN_BANK_OPERATIONAL_DATE,
  isBankMovementDateHistorical,
  isBankMovementDateBeforeIntelligenceCutoff,
} from "@/lib/bank/canonical/historical-policy";
import { listBankMonthOptions } from "@/lib/bank-movements/bank-period";
import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";

describe("BANK-2026-CLEANUP policy", () => {
  it("reusa el piso financiero Copilot 2026-01-01", () => {
    expect(MIN_BANK_OPERATIONAL_DATE).toBe(MIN_FINANCIAL_DATE);
    expect(BANK_OPERATIONAL_START_DATE).toBe("2026-01-01");
    expect(BANK_INTELLIGENCE_CUTOFF_DATE).toBe("2026-07-01");
  });

  it("2025 es histórico UI; junio 2026 no lo es", () => {
    expect(isBankMovementDateHistorical("2025-12-31")).toBe(true);
    expect(isBankMovementDateHistorical("2026-01-01")).toBe(false);
    expect(isBankMovementDateHistorical("2026-06-15")).toBe(false);
  });

  it("inteligencia shadow sigue cortando antes de julio 2026", () => {
    expect(isBankMovementDateBeforeIntelligenceCutoff("2026-06-30")).toBe(true);
    expect(isBankMovementDateBeforeIntelligenceCutoff("2026-07-01")).toBe(false);
  });

  it("selector de meses empieza en enero 2026 y no ofrece 2025", () => {
    const opts = listBankMonthOptions("2026-07-23");
    expect(opts[0]?.value).toBe("month:2026-07");
    expect(opts.some((o) => o.year === 2025)).toBe(false);
    expect(opts.some((o) => o.value === "month:2026-01")).toBe(true);
  });
});

describe("numeric pagination tokens", () => {
  it("incluye extremos y ellipsis", () => {
    expect(buildNumericPageTokens(1, 20)).toContain(1);
    expect(buildNumericPageTokens(1, 20)).toContain(20);
    expect(buildNumericPageTokens(10, 20)).toContain("ellipsis");
    expect(buildNumericPageTokens(10, 20)).toContain(10);
  });
});

describe("dedupe safety classification", () => {
  it("marca A/B como auto-safe y C como skipped", () => {
    const a = classifyDedupeGroup({
      fingerprint: "fp-a",
      canonicalMovementId: "c1",
      duplicateMovementIds: ["d1"],
      sameSource: true,
      hasConflictingAssociations: false,
      exactFieldMatch: true,
      crossParser: false,
    });
    const b = classifyDedupeGroup({
      fingerprint: "fp-b",
      canonicalMovementId: "c2",
      duplicateMovementIds: ["d2"],
      sameSource: false,
      hasConflictingAssociations: false,
      exactFieldMatch: true,
      crossParser: true,
    });
    const c = classifyDedupeGroup({
      fingerprint: "fp-c",
      canonicalMovementId: "c3",
      duplicateMovementIds: ["d3"],
      sameSource: true,
      hasConflictingAssociations: true,
      exactFieldMatch: true,
      crossParser: false,
    });
    expect(isAutoSafeDedupeClass(a)).toBe(true);
    expect(isAutoSafeDedupeClass(b)).toBe(true);
    expect(isAutoSafeDedupeClass(c)).toBe(false);

    const plan = planSafeDuplicateMarks([
      {
        fingerprint: "fp-a",
        canonicalMovementId: "c1",
        duplicateMovementIds: ["d1"],
        sameSource: true,
        hasConflictingAssociations: false,
        exactFieldMatch: true,
        crossParser: false,
      },
      {
        fingerprint: "fp-c",
        canonicalMovementId: "c3",
        duplicateMovementIds: ["d3"],
        sameSource: true,
        hasConflictingAssociations: true,
        exactFieldMatch: true,
        crossParser: false,
      },
    ]);
    expect(plan.apply).toHaveLength(1);
    expect(plan.apply[0]?.movementId).toBe("d1");
    expect(plan.skipped).toHaveLength(1);
  });
});
