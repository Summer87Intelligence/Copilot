// ---------------------------------------------------------------------------
// ZETA-11 — tipos de dominio tesorería manual
// ---------------------------------------------------------------------------

export const TREASURY_CURRENCY_CODES = ["UYU", "USD"] as const;
export type TreasuryCurrencyCode = (typeof TREASURY_CURRENCY_CODES)[number];

export const TREASURY_ACCOUNT_TYPES = [
  "cash",
  "bank",
  "wallet",
  "credit_card",
  "investment",
] as const;
export type TreasuryAccountType = (typeof TREASURY_ACCOUNT_TYPES)[number];

export const MANUAL_CASH_LEDGER_TYPES = [
  "cash",
  "bank",
  "virtual_wallet",
  "credit_card",
] as const;
export type ManualCashLedgerType = (typeof MANUAL_CASH_LEDGER_TYPES)[number];

export const MANUAL_CASH_MOVEMENT_TYPES = [
  "income",
  "expense",
  "adjustment",
  "transfer",
] as const;
export type ManualCashMovementType = (typeof MANUAL_CASH_MOVEMENT_TYPES)[number];

export const MANUAL_CASH_SOURCES = ["cash", "bank", "santander", "manual"] as const;
export type ManualCashSource = (typeof MANUAL_CASH_SOURCES)[number];

export const MANUAL_CASH_STATUSES = ["active", "archived"] as const;
export type ManualCashStatus = (typeof MANUAL_CASH_STATUSES)[number];

export const BANK_MOVEMENT_TYPES = ["credit", "debit"] as const;
export type BankMovementType = (typeof BANK_MOVEMENT_TYPES)[number];

export const BANK_MATCH_STATUSES = ["unmatched", "matched", "partial", "ignored"] as const;
export type BankMatchStatus = (typeof BANK_MATCH_STATUSES)[number];

export const BANK_MATCHED_SOURCES = [
  "zeta",
  "manual_cash",
  "planned_obligation",
  "none",
] as const;
export type BankMatchedSource = (typeof BANK_MATCHED_SOURCES)[number];

export const BANK_IMPORTED_FROM = ["manual", "csv", "api", "zeta"] as const;
export type BankImportedFrom = (typeof BANK_IMPORTED_FROM)[number];

export const PLANNED_OBLIGATION_TYPES = [
  "tax",
  "bps",
  "dgi",
  "iva",
  "salary",
  "bonus",
  "vacation",
  "supplier",
  "rent",
  "loan",
  "travel",
  "service",
  "other",
] as const;
export type PlannedObligationType = (typeof PLANNED_OBLIGATION_TYPES)[number];

export const PLANNED_OBLIGATION_DIRECTIONS = ["outflow", "inflow"] as const;
export type PlannedObligationDirection = (typeof PLANNED_OBLIGATION_DIRECTIONS)[number];

export const PLANNED_OBLIGATION_STATUSES = [
  "planned",
  "confirmed",
  "paid",
  "cancelled",
  "overdue",
] as const;
export type PlannedObligationStatus = (typeof PLANNED_OBLIGATION_STATUSES)[number];

export const PLANNED_OBLIGATION_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type PlannedObligationPriority = (typeof PLANNED_OBLIGATION_PRIORITIES)[number];

export const PLANNED_OBLIGATION_RECURRENCE = [
  "none",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export type PlannedObligationRecurrence = (typeof PLANNED_OBLIGATION_RECURRENCE)[number];

export const PLANNED_OBLIGATION_SOURCES = ["manual", "zeta", "recurring_rule", "copilot"] as const;
export type PlannedObligationSource = (typeof PLANNED_OBLIGATION_SOURCES)[number];

export const PLANNED_EXPECTED_SOURCES = [
  "cash",
  "bank",
  "santander",
  "future_income",
  "unknown",
] as const;
export type PlannedExpectedSource = (typeof PLANNED_EXPECTED_SOURCES)[number];

export const ADJUSTMENT_DIRECTIONS = ["increase", "decrease"] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

export const TREASURY_TABLES = {
  accounts: "treasury_accounts",
  manualCash: "manual_cash_movements",
  bankReconciliation: "bank_reconciliation_movements",
  plannedObligations: "planned_cash_obligations",
} as const;

export type TreasuryAccount = {
  id: string;
  workspaceId: string;
  companyId: string | null;
  name: string;
  type: TreasuryAccountType;
  bankName: string | null;
  accountNumber: string | null;
  currencyCode: TreasuryCurrencyCode;
  active: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type ManualCashMovement = {
  id: string;
  workspaceId: string;
  companyId: string | null;
  accountId: string | null;
  ledgerType: ManualCashLedgerType;
  movementType: ManualCashMovementType;
  source: ManualCashSource;
  concept: string;
  category: string | null;
  amount: number;
  currencyCode: TreasuryCurrencyCode;
  movementDate: string;
  paymentMethod: string | null;
  counterparty: string | null;
  reference: string | null;
  notes: string | null;
  affectsCashflow: boolean;
  reconciled: boolean;
  bankReconciliationId: string | null;
  status: ManualCashStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  rawPayload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

export type BankReconciliationMovement = {
  id: string;
  workspaceId: string;
  companyId: string | null;
  accountId: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  movementDate: string;
  description: string;
  amount: number;
  currencyCode: TreasuryCurrencyCode;
  movementType: BankMovementType;
  externalId: string | null;
  documentNumber: string | null;
  balanceAfter: number | null;
  matched: boolean;
  matchStatus: BankMatchStatus;
  matchedSource: BankMatchedSource;
  matchedRecordId: string | null;
  confidence: number | null;
  importedFrom: BankImportedFrom;
  importedAt: string;
  rawPayload: Record<string, unknown> | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlannedCashObligation = {
  id: string;
  workspaceId: string;
  companyId: string | null;
  title: string;
  description: string | null;
  obligationType: PlannedObligationType;
  direction: PlannedObligationDirection;
  amountEstimated: number;
  amountFinal: number | null;
  currencyCode: TreasuryCurrencyCode;
  dueDate: string;
  expectedPaymentDate: string | null;
  expectedSource: PlannedExpectedSource;
  expectedAccountId: string | null;
  recurrence: PlannedObligationRecurrence;
  status: PlannedObligationStatus;
  priority: PlannedObligationPriority;
  affectsCashflow: boolean;
  reminderDaysBefore: number[];
  source: PlannedObligationSource;
  relatedManualMovementId: string | null;
  relatedBankMovementId: string | null;
  relatedZetaRecordId: string | null;
  recurringTemplateId: string | null;
  recurringInstanceKey: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
};

export type TreasuryAccountInput = {
  companyId?: string | null;
  name: string;
  type: TreasuryAccountType;
  bankName?: string | null;
  accountNumber?: string | null;
  currencyCode: TreasuryCurrencyCode;
  active?: boolean;
  metadata?: Record<string, unknown> | null;
};

export type ManualCashMovementInput = {
  companyId?: string | null;
  accountId?: string | null;
  ledgerType: ManualCashLedgerType;
  movementType: ManualCashMovementType;
  source?: ManualCashSource;
  concept: string;
  category?: string | null;
  amount: number;
  currencyCode: TreasuryCurrencyCode;
  movementDate: string;
  paymentMethod?: string | null;
  counterparty?: string | null;
  reference?: string | null;
  notes?: string | null;
  affectsCashflow?: boolean;
  adjustmentDirection?: AdjustmentDirection;
  transferPairId?: string | null;
  rawPayload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export type BankReconciliationMovementInput = {
  companyId?: string | null;
  accountId?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  movementDate: string;
  description: string;
  amount: number;
  currencyCode: TreasuryCurrencyCode;
  movementType: BankMovementType;
  externalId?: string | null;
  documentNumber?: string | null;
  balanceAfter?: number | null;
  importedFrom?: BankImportedFrom;
  rawPayload?: Record<string, unknown> | null;
  notes?: string | null;
};

export type PlannedCashObligationInput = {
  companyId?: string | null;
  title: string;
  description?: string | null;
  obligationType: PlannedObligationType;
  direction?: PlannedObligationDirection;
  amountEstimated: number;
  amountFinal?: number | null;
  currencyCode: TreasuryCurrencyCode;
  dueDate: string;
  expectedPaymentDate?: string | null;
  expectedSource?: PlannedExpectedSource;
  expectedAccountId?: string | null;
  recurrence?: PlannedObligationRecurrence;
  status?: PlannedObligationStatus;
  priority?: PlannedObligationPriority;
  affectsCashflow?: boolean;
  reminderDaysBefore?: number[];
  source?: PlannedObligationSource;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type TreasuryListFilters = {
  currencyCode?: TreasuryCurrencyCode;
  fromDate?: string;
  toDate?: string;
  status?: string;
  accountId?: string;
};

export type ManualCashListFilters = TreasuryListFilters & {
  movementType?: ManualCashMovementType;
  ledgerType?: ManualCashLedgerType;
  category?: string;
};

export type BankMovementListFilters = TreasuryListFilters & {
  movementType?: BankMovementType;
  matchStatus?: BankMatchStatus;
  bankName?: string;
};

export type PlannedObligationListFilters = TreasuryListFilters & {
  obligationType?: PlannedObligationType;
  priority?: PlannedObligationPriority;
  direction?: PlannedObligationDirection;
};

export type TreasuryAlertKind =
  | "obligation_due_7d"
  | "obligation_due_3d"
  | "obligation_due_1d"
  | "obligation_overdue"
  | "critical_outflow_threshold"
  | "bank_unmatched_threshold";

export type TreasuryAlert = {
  kind: TreasuryAlertKind;
  severity: "info" | "warning" | "critical";
  message: string;
  recordId: string;
  currencyCode: TreasuryCurrencyCode;
  amount: number;
  dueDate?: string;
};

export type TreasuryProjectionCurrencyBucket = {
  currencyCode: TreasuryCurrencyCode;
  manualNet: number;
  bankNet: number;
  obligationOutflow: number;
  obligationInflow: number;
  projectedNet: number;
};

export type TreasuryProjectionSnapshot = {
  asOfDate: string;
  buckets: TreasuryProjectionCurrencyBucket[];
};
