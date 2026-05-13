import type {
  BankReconciliationMovement,
  ManualCashMovement,
  PlannedCashObligation,
  TreasuryAccount,
} from "@/lib/treasury/treasury-types";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
}

function jsonRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function mapTreasuryAccountRow(row: Record<string, unknown>): TreasuryAccount {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    companyId: row.company_id != null ? str(row.company_id) || null : null,
    name: str(row.name),
    type: str(row.type) as TreasuryAccount["type"],
    bankName: row.bank_name != null ? str(row.bank_name) || null : null,
    accountNumber: row.account_number != null ? str(row.account_number) || null : null,
    currencyCode: str(row.currency_code) as TreasuryAccount["currencyCode"],
    active: Boolean(row.active),
    metadata: jsonRecord(row.metadata),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function mapManualCashMovementRow(row: Record<string, unknown>): ManualCashMovement {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    companyId: row.company_id != null ? str(row.company_id) || null : null,
    accountId: row.account_id != null ? str(row.account_id) || null : null,
    ledgerType: str(row.ledger_type) as ManualCashMovement["ledgerType"],
    movementType: str(row.movement_type) as ManualCashMovement["movementType"],
    source: str(row.source) as ManualCashMovement["source"],
    concept: str(row.concept),
    category: row.category != null ? str(row.category) || null : null,
    amount: num(row.amount),
    currencyCode: str(row.currency_code) as ManualCashMovement["currencyCode"],
    movementDate: str(row.movement_date),
    paymentMethod: row.payment_method != null ? str(row.payment_method) || null : null,
    counterparty: row.counterparty != null ? str(row.counterparty) || null : null,
    reference: row.reference != null ? str(row.reference) || null : null,
    notes: row.notes != null ? str(row.notes) || null : null,
    affectsCashflow: Boolean(row.affects_cashflow),
    reconciled: Boolean(row.reconciled),
    bankReconciliationId:
      row.bank_reconciliation_id != null ? str(row.bank_reconciliation_id) || null : null,
    status: str(row.status) as ManualCashMovement["status"],
    createdBy: row.created_by != null ? str(row.created_by) || null : null,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    rawPayload: jsonRecord(row.raw_payload),
    metadata: jsonRecord(row.metadata),
  };
}

export function mapBankReconciliationMovementRow(
  row: Record<string, unknown>
): BankReconciliationMovement {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    companyId: row.company_id != null ? str(row.company_id) || null : null,
    accountId: row.account_id != null ? str(row.account_id) || null : null,
    bankName: row.bank_name != null ? str(row.bank_name) || null : null,
    accountNumber: row.account_number != null ? str(row.account_number) || null : null,
    accountName: row.account_name != null ? str(row.account_name) || null : null,
    movementDate: str(row.movement_date),
    description: str(row.description),
    amount: num(row.amount),
    currencyCode: str(row.currency_code) as BankReconciliationMovement["currencyCode"],
    movementType: str(row.movement_type) as BankReconciliationMovement["movementType"],
    externalId: row.external_id != null ? str(row.external_id) || null : null,
    documentNumber: row.document_number != null ? str(row.document_number) || null : null,
    balanceAfter: numOrNull(row.balance_after),
    matched: Boolean(row.matched),
    matchStatus: str(row.match_status) as BankReconciliationMovement["matchStatus"],
    matchedSource: str(row.matched_source) as BankReconciliationMovement["matchedSource"],
    matchedRecordId: row.matched_record_id != null ? str(row.matched_record_id) || null : null,
    confidence: numOrNull(row.confidence),
    importedFrom: str(row.imported_from) as BankReconciliationMovement["importedFrom"],
    importedAt: str(row.imported_at),
    rawPayload: jsonRecord(row.raw_payload),
    notes: row.notes != null ? str(row.notes) || null : null,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function mapPlannedCashObligationRow(row: Record<string, unknown>): PlannedCashObligation {
  const reminderRaw = row.reminder_days_before;
  const reminderDaysBefore = Array.isArray(reminderRaw)
    ? reminderRaw.map((v) => Number(v)).filter((n) => Number.isFinite(n))
    : [];

  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    companyId: row.company_id != null ? str(row.company_id) || null : null,
    title: str(row.title),
    description: row.description != null ? str(row.description) || null : null,
    obligationType: str(row.obligation_type) as PlannedCashObligation["obligationType"],
    direction: str(row.direction) as PlannedCashObligation["direction"],
    amountEstimated: num(row.amount_estimated),
    amountFinal: numOrNull(row.amount_final),
    currencyCode: str(row.currency_code) as PlannedCashObligation["currencyCode"],
    dueDate: str(row.due_date),
    expectedPaymentDate:
      row.expected_payment_date != null ? str(row.expected_payment_date) || null : null,
    expectedSource: str(row.expected_source) as PlannedCashObligation["expectedSource"],
    expectedAccountId:
      row.expected_account_id != null ? str(row.expected_account_id) || null : null,
    recurrence: str(row.recurrence) as PlannedCashObligation["recurrence"],
    status: str(row.status) as PlannedCashObligation["status"],
    priority: str(row.priority) as PlannedCashObligation["priority"],
    affectsCashflow: Boolean(row.affects_cashflow),
    reminderDaysBefore,
    source: str(row.source) as PlannedCashObligation["source"],
    relatedManualMovementId:
      row.related_manual_movement_id != null ? str(row.related_manual_movement_id) || null : null,
    relatedBankMovementId:
      row.related_bank_movement_id != null ? str(row.related_bank_movement_id) || null : null,
    relatedZetaRecordId:
      row.related_zeta_record_id != null ? str(row.related_zeta_record_id) || null : null,
    notes: row.notes != null ? str(row.notes) || null : null,
    createdBy: row.created_by != null ? str(row.created_by) || null : null,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    metadata: jsonRecord(row.metadata),
  };
}
