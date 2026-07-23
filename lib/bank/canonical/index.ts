/**
 * Capa bancaria canónica (FASE-3). Barrel público.
 *
 * Fuente oficial: `bank_movements`. Legacy read-only: `bank_reconciliation_movements`.
 * Ver docs/technical/canonical-bank-movements.md.
 */
export {
  BANK_OPERATIONAL_START_DATE,
  BANK_INTELLIGENCE_CUTOFF_DATE,
  MIN_BANK_OPERATIONAL_DATE,
  BANK_EXCLUSION_REASON_BEFORE_2026,
  isBankMovementDateHistorical,
  isBankMovementHistorical,
  isBankMovementDateBeforeIntelligenceCutoff,
  normalizeMovementDate,
  partitionByHistorical,
} from "@/lib/bank/canonical/historical-policy";

export type {
  BankActivityReportCurrencyRow,
  BankActivityReportModel,
  CanonicalBankCurrency,
  CanonicalBankCurrencyBlock,
  CanonicalBankDiagnostic,
  CanonicalBankDiagnosticCode,
  CanonicalBankDirection,
  CanonicalBankMovement,
  CanonicalBankSnapshot,
  CanonicalBankSource,
} from "@/lib/bank/canonical/types";

export { toCanonicalFromBankMovement } from "@/lib/bank/canonical/adapters/bank-movements";
export { toCanonicalFromLegacy } from "@/lib/bank/canonical/adapters/legacy-reconciliation";

export {
  buildBankMovementFingerprint,
  classifyDuplicate,
  detectCrossSourceDuplicates,
  fingerprintOf,
  normalizeDescription,
  type CrossSourceDuplicate,
  type DuplicateConfidence,
} from "@/lib/bank/canonical/dedup";

export {
  buildCanonicalBankSnapshot,
  type BuildCanonicalBankSnapshotParams,
} from "@/lib/bank/canonical/snapshot";

export { buildBankActivityReportModel } from "@/lib/bank/canonical/report";
