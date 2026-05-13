import {
  ADJUSTMENT_DIRECTIONS,
  BANK_IMPORTED_FROM,
  BANK_MATCH_STATUSES,
  BANK_MATCHED_SOURCES,
  BANK_MOVEMENT_TYPES,
  MANUAL_CASH_LEDGER_TYPES,
  MANUAL_CASH_MOVEMENT_TYPES,
  MANUAL_CASH_SOURCES,
  MANUAL_CASH_STATUSES,
  PLANNED_EXPECTED_SOURCES,
  PLANNED_OBLIGATION_DIRECTIONS,
  PLANNED_OBLIGATION_PRIORITIES,
  PLANNED_OBLIGATION_RECURRENCE,
  PLANNED_OBLIGATION_SOURCES,
  PLANNED_OBLIGATION_STATUSES,
  PLANNED_OBLIGATION_TYPES,
  TREASURY_ACCOUNT_TYPES,
  TREASURY_CURRENCY_CODES,
  type AdjustmentDirection,
  type BankMatchStatus,
  type BankMatchedSource,
  type BankReconciliationMovementInput,
  type ManualCashMovementInput,
  type ManualCashStatus,
  type PlannedCashObligationInput,
  type PlannedObligationStatus,
  type TreasuryAccount,
  type TreasuryAccountInput,
  type TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";

export type TreasuryValidationIssue = {
  field: string;
  code: string;
  message: string;
};

export type TreasuryValidationResult =
  | { ok: true }
  | { ok: false; issues: TreasuryValidationIssue[] };

function fail(issues: TreasuryValidationIssue[]): TreasuryValidationResult {
  return { ok: false, issues };
}

function ok(): TreasuryValidationResult {
  return { ok: true };
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function parsePositiveAmount(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function allowed<T extends string>(value: string, list: readonly T[]): value is T {
  return (list as readonly string[]).includes(value);
}

export function validateTreasuryAccountInput(input: TreasuryAccountInput): TreasuryValidationResult {
  const issues: TreasuryValidationIssue[] = [];
  if (!input.name?.trim()) {
    issues.push({ field: "name", code: "required", message: "Nombre requerido." });
  }
  if (!allowed(input.type, TREASURY_ACCOUNT_TYPES)) {
    issues.push({ field: "type", code: "invalid", message: "Tipo de cuenta inválido." });
  }
  if (!allowed(input.currencyCode, TREASURY_CURRENCY_CODES)) {
    issues.push({ field: "currencyCode", code: "invalid", message: "Moneda inválida." });
  }
  return issues.length ? fail(issues) : ok();
}

export function validateManualCashMovementInput(
  input: ManualCashMovementInput
): TreasuryValidationResult {
  const issues: TreasuryValidationIssue[] = [];
  if (!input.concept?.trim()) {
    issues.push({ field: "concept", code: "required", message: "Concepto requerido." });
  }
  if (!allowed(input.ledgerType, MANUAL_CASH_LEDGER_TYPES)) {
    issues.push({ field: "ledgerType", code: "invalid", message: "ledger_type inválido." });
  }
  if (!allowed(input.movementType, MANUAL_CASH_MOVEMENT_TYPES)) {
    issues.push({ field: "movementType", code: "invalid", message: "movement_type inválido." });
  }
  if (input.source != null && !allowed(input.source, MANUAL_CASH_SOURCES)) {
    issues.push({ field: "source", code: "invalid", message: "source inválido." });
  }
  if (!allowed(input.currencyCode, TREASURY_CURRENCY_CODES)) {
    issues.push({ field: "currencyCode", code: "invalid", message: "Moneda inválida." });
  }
  if (!isYmd(input.movementDate)) {
    issues.push({ field: "movementDate", code: "invalid", message: "Fecha inválida (YYYY-MM-DD)." });
  }
  if (parsePositiveAmount(input.amount) == null) {
    issues.push({ field: "amount", code: "invalid", message: "Monto debe ser > 0." });
  }
  if (input.movementType === "adjustment") {
    const dir = input.adjustmentDirection ?? readAdjustmentDirection(input.metadata);
    if (!dir || !allowed(dir, ADJUSTMENT_DIRECTIONS)) {
      issues.push({
        field: "adjustmentDirection",
        code: "required",
        message: "Ajuste requiere adjustment_direction increase|decrease.",
      });
    }
  }
  return issues.length ? fail(issues) : ok();
}

export function validateBankReconciliationMovementInput(
  input: BankReconciliationMovementInput
): TreasuryValidationResult {
  const issues: TreasuryValidationIssue[] = [];
  if (!input.description?.trim()) {
    issues.push({ field: "description", code: "required", message: "Descripción requerida." });
  }
  if (!allowed(input.movementType, BANK_MOVEMENT_TYPES)) {
    issues.push({ field: "movementType", code: "invalid", message: "movement_type inválido." });
  }
  if (!allowed(input.currencyCode, TREASURY_CURRENCY_CODES)) {
    issues.push({ field: "currencyCode", code: "invalid", message: "Moneda inválida." });
  }
  if (!isYmd(input.movementDate)) {
    issues.push({ field: "movementDate", code: "invalid", message: "Fecha inválida (YYYY-MM-DD)." });
  }
  if (parsePositiveAmount(input.amount) == null) {
    issues.push({ field: "amount", code: "invalid", message: "Monto debe ser > 0." });
  }
  if (input.importedFrom != null && !allowed(input.importedFrom, BANK_IMPORTED_FROM)) {
    issues.push({ field: "importedFrom", code: "invalid", message: "imported_from inválido." });
  }
  return issues.length ? fail(issues) : ok();
}

export function validatePlannedCashObligationInput(
  input: PlannedCashObligationInput
): TreasuryValidationResult {
  const issues: TreasuryValidationIssue[] = [];
  if (!input.title?.trim()) {
    issues.push({ field: "title", code: "required", message: "Título requerido." });
  }
  if (!allowed(input.obligationType, PLANNED_OBLIGATION_TYPES)) {
    issues.push({ field: "obligationType", code: "invalid", message: "obligation_type inválido." });
  }
  const direction = input.direction ?? "outflow";
  if (!allowed(direction, PLANNED_OBLIGATION_DIRECTIONS)) {
    issues.push({ field: "direction", code: "invalid", message: "direction inválido." });
  }
  if (!allowed(input.currencyCode, TREASURY_CURRENCY_CODES)) {
    issues.push({ field: "currencyCode", code: "invalid", message: "Moneda inválida." });
  }
  if (!isYmd(input.dueDate)) {
    issues.push({ field: "dueDate", code: "invalid", message: "Vencimiento inválido (YYYY-MM-DD)." });
  }
  if (input.expectedPaymentDate && !isYmd(input.expectedPaymentDate)) {
    issues.push({
      field: "expectedPaymentDate",
      code: "invalid",
      message: "expected_payment_date inválida.",
    });
  }
  if (parsePositiveAmount(input.amountEstimated) == null) {
    issues.push({ field: "amountEstimated", code: "invalid", message: "Monto estimado debe ser > 0." });
  }
  if (input.amountFinal != null && parsePositiveAmount(input.amountFinal) == null) {
    issues.push({ field: "amountFinal", code: "invalid", message: "amount_final debe ser > 0." });
  }
  if (input.expectedSource != null && !allowed(input.expectedSource, PLANNED_EXPECTED_SOURCES)) {
    issues.push({ field: "expectedSource", code: "invalid", message: "expected_source inválido." });
  }
  if (input.recurrence != null && !allowed(input.recurrence, PLANNED_OBLIGATION_RECURRENCE)) {
    issues.push({ field: "recurrence", code: "invalid", message: "recurrence inválido." });
  }
  if (input.status != null && !allowed(input.status, PLANNED_OBLIGATION_STATUSES)) {
    issues.push({ field: "status", code: "invalid", message: "status inválido." });
  }
  if (input.priority != null && !allowed(input.priority, PLANNED_OBLIGATION_PRIORITIES)) {
    issues.push({ field: "priority", code: "invalid", message: "priority inválido." });
  }
  if (input.source != null && !allowed(input.source, PLANNED_OBLIGATION_SOURCES)) {
    issues.push({ field: "source", code: "invalid", message: "source inválido." });
  }
  return issues.length ? fail(issues) : ok();
}

export function validateAccountCurrencyMatch(
  account: Pick<TreasuryAccount, "currencyCode"> | null | undefined,
  currencyCode: TreasuryCurrencyCode
): TreasuryValidationResult {
  if (!account) return ok();
  if (account.currencyCode !== currencyCode) {
    return fail([
      {
        field: "accountId",
        code: "currency_mismatch",
        message: "La moneda del movimiento no coincide con la cuenta treasury.",
      },
    ]);
  }
  return ok();
}

export function readAdjustmentDirection(
  metadata: Record<string, unknown> | null | undefined
): AdjustmentDirection | null {
  if (!metadata) return null;
  const raw = metadata.adjustment_direction ?? metadata.adjustmentDirection;
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase() as AdjustmentDirection;
  return allowed(v, ADJUSTMENT_DIRECTIONS) ? v : null;
}

export function readTransferPairId(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (!metadata) return null;
  const raw = metadata.transfer_pair_id ?? metadata.transferPairId;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

export function isManualCashStatus(value: string): value is ManualCashStatus {
  return allowed(value, MANUAL_CASH_STATUSES);
}

export function isBankMatchStatus(value: string): value is BankMatchStatus {
  return allowed(value, BANK_MATCH_STATUSES);
}

export function isBankMatchedSource(value: string): value is BankMatchedSource {
  return allowed(value, BANK_MATCHED_SOURCES);
}

export function isPlannedObligationStatus(value: string): value is PlannedObligationStatus {
  return allowed(value, PLANNED_OBLIGATION_STATUSES);
}
