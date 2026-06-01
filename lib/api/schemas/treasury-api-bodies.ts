import { z } from "zod";

import {
  BANK_IMPORTED_FROM,
  BANK_MATCHED_SOURCES,
  BANK_MOVEMENT_TYPES,
  MANUAL_CASH_LEDGER_TYPES,
  MANUAL_CASH_MOVEMENT_TYPES,
  MANUAL_CASH_SOURCES,
  PLANNED_EXPECTED_SOURCES,
  PLANNED_OBLIGATION_DIRECTIONS,
  PLANNED_OBLIGATION_PRIORITIES,
  PLANNED_OBLIGATION_RECURRENCE,
  PLANNED_OBLIGATION_SOURCES,
  PLANNED_OBLIGATION_STATUSES,
  PLANNED_OBLIGATION_TYPES,
  TREASURY_ACCOUNT_TYPES,
  TREASURY_CURRENCY_CODES,
} from "@/lib/treasury/treasury-types";

const optionalNullableString = z.union([z.string(), z.null()]).optional();
const optionalNullableUuid = z.union([z.string().uuid(), z.null()]).optional();
const optionalMetadata = z.record(z.string(), z.unknown()).nullable().optional();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD).");
const positiveAmount = z.number().finite().positive("Monto debe ser > 0.");
const currencyCode = z.enum(TREASURY_CURRENCY_CODES);

const rejectWorkspaceId = z.never().optional();

export const treasuryAccountCreateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    company_id: optionalNullableString,
    name: z.string().trim().min(1),
    type: z.enum(TREASURY_ACCOUNT_TYPES),
    bank_name: optionalNullableString,
    account_number: optionalNullableString,
    currency_code: currencyCode,
    active: z.boolean().optional(),
    metadata: optionalMetadata,
  })
  .strict();

export const treasuryAccountUpdateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    company_id: optionalNullableString,
    name: z.string().trim().min(1).optional(),
    type: z.enum(TREASURY_ACCOUNT_TYPES).optional(),
    bank_name: optionalNullableString,
    account_number: optionalNullableString,
    currency_code: currencyCode.optional(),
    active: z.boolean().optional(),
    metadata: optionalMetadata,
  })
  .strict()
  .refine((o) => Object.keys(o).some((k) => k !== "workspace_id"), {
    message: "Enviá al menos un campo para actualizar.",
  });

export const manualCashMovementCreateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    company_id: optionalNullableString,
    account_id: optionalNullableUuid,
    ledger_type: z.enum(MANUAL_CASH_LEDGER_TYPES),
    movement_type: z.enum(MANUAL_CASH_MOVEMENT_TYPES),
    source: z.enum(MANUAL_CASH_SOURCES).optional(),
    concept: z.string().trim().min(1),
    category: optionalNullableString,
    amount: positiveAmount,
    currency_code: currencyCode,
    movement_date: ymd,
    payment_method: optionalNullableString,
    counterparty: optionalNullableString,
    reference: optionalNullableString,
    notes: optionalNullableString,
    affects_cashflow: z.boolean().optional(),
    adjustment_direction: z.enum(["increase", "decrease"]).optional(),
    transfer_pair_id: optionalNullableUuid,
    raw_payload: optionalMetadata,
    metadata: optionalMetadata,
  })
  .strict();

export const manualCashMovementUpdateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    company_id: optionalNullableString,
    account_id: optionalNullableUuid,
    ledger_type: z.enum(MANUAL_CASH_LEDGER_TYPES).optional(),
    movement_type: z.enum(MANUAL_CASH_MOVEMENT_TYPES).optional(),
    source: z.enum(MANUAL_CASH_SOURCES).optional(),
    concept: z.string().trim().min(1).optional(),
    category: optionalNullableString,
    amount: positiveAmount.optional(),
    currency_code: currencyCode.optional(),
    movement_date: ymd.optional(),
    payment_method: optionalNullableString,
    counterparty: optionalNullableString,
    reference: optionalNullableString,
    notes: optionalNullableString,
    affects_cashflow: z.boolean().optional(),
    adjustment_direction: z.enum(["increase", "decrease"]).optional(),
    transfer_pair_id: optionalNullableUuid,
    raw_payload: optionalMetadata,
    metadata: optionalMetadata,
  })
  .strict()
  .refine((o) => Object.keys(o).some((k) => k !== "workspace_id"), {
    message: "Enviá al menos un campo para actualizar.",
  });

export const bankReconciliationMovementCreateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    company_id: optionalNullableString,
    account_id: optionalNullableUuid,
    bank_name: optionalNullableString,
    account_number: optionalNullableString,
    account_name: optionalNullableString,
    movement_date: ymd,
    description: z.string().trim().min(1),
    amount: positiveAmount,
    currency_code: currencyCode,
    movement_type: z.enum(BANK_MOVEMENT_TYPES),
    external_id: optionalNullableString,
    document_number: optionalNullableString,
    balance_after: z.number().finite().positive().nullable().optional(),
    imported_from: z.enum(BANK_IMPORTED_FROM).optional(),
    raw_payload: optionalMetadata,
    notes: optionalNullableString,
  })
  .strict();

export const bankReconciliationMovementUpdateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    company_id: optionalNullableString,
    account_id: optionalNullableUuid,
    bank_name: optionalNullableString,
    account_number: optionalNullableString,
    account_name: optionalNullableString,
    movement_date: ymd.optional(),
    description: z.string().trim().min(1).optional(),
    amount: positiveAmount.optional(),
    currency_code: currencyCode.optional(),
    movement_type: z.enum(BANK_MOVEMENT_TYPES).optional(),
    external_id: optionalNullableString,
    document_number: optionalNullableString,
    balance_after: z.number().finite().positive().nullable().optional(),
    notes: optionalNullableString,
    raw_payload: optionalMetadata,
  })
  .strict()
  .refine((o) => Object.keys(o).some((k) => k !== "workspace_id"), {
    message: "Enviá al menos un campo para actualizar.",
  });

export const bankReconciliationMatchBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    matched_source: z.enum(BANK_MATCHED_SOURCES),
    matched_record_id: z.string().uuid(),
    confidence: z.number().finite().min(0).max(100).nullable().optional(),
    notes: optionalNullableString,
  })
  .strict()
  .refine((o) => o.matched_source !== "none", {
    message: "matched_source no puede ser none.",
    path: ["matched_source"],
  });

export const bankReconciliationIgnoreBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    notes: optionalNullableString,
  })
  .strict();

export const bankReconciliationImportRowSchema = z
  .object({
    movement_date: ymd,
    description: z.string().trim().min(1),
    amount: positiveAmount,
    currency_code: currencyCode,
    movement_type: z.enum(BANK_MOVEMENT_TYPES),
    external_id: z.string().trim().min(1),
    document_number: optionalNullableString,
    balance_after: z.number().finite().positive().nullable().optional(),
    raw_payload: optionalMetadata,
  })
  .strict();

export const bankReconciliationImportBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    account_id: z.string().uuid().optional(),
    apply: z.boolean().optional(),
    auto_match: z.boolean().optional(),
    rows: z.array(bankReconciliationImportRowSchema).min(1).max(500),
  })
  .strict()
  .refine((body) => !body.apply || Boolean(body.account_id), {
    message: "Seleccioná una cuenta destino para guardar movimientos importados.",
    path: ["account_id"],
  });

export const plannedCashObligationCreateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    company_id: optionalNullableString,
    title: z.string().trim().min(1),
    description: optionalNullableString,
    obligation_type: z.enum(PLANNED_OBLIGATION_TYPES),
    direction: z.enum(PLANNED_OBLIGATION_DIRECTIONS).optional(),
    amount_estimated: positiveAmount,
    amount_final: positiveAmount.nullable().optional(),
    currency_code: currencyCode,
    due_date: ymd,
    expected_payment_date: ymd.nullable().optional(),
    expected_source: z.enum(PLANNED_EXPECTED_SOURCES).optional(),
    expected_account_id: optionalNullableUuid,
    recurrence: z.enum(PLANNED_OBLIGATION_RECURRENCE).optional(),
    status: z.enum(PLANNED_OBLIGATION_STATUSES).optional(),
    priority: z.enum(PLANNED_OBLIGATION_PRIORITIES).optional(),
    affects_cashflow: z.boolean().optional(),
    reminder_days_before: z.array(z.number().int().min(0)).optional(),
    source: z.enum(PLANNED_OBLIGATION_SOURCES).optional(),
    notes: optionalNullableString,
    metadata: optionalMetadata,
  })
  .strict();

export const plannedCashObligationUpdateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    company_id: optionalNullableString,
    title: z.string().trim().min(1).optional(),
    description: optionalNullableString,
    obligation_type: z.enum(PLANNED_OBLIGATION_TYPES).optional(),
    direction: z.enum(PLANNED_OBLIGATION_DIRECTIONS).optional(),
    amount_estimated: positiveAmount.optional(),
    amount_final: positiveAmount.nullable().optional(),
    currency_code: currencyCode.optional(),
    due_date: ymd.optional(),
    expected_payment_date: ymd.nullable().optional(),
    expected_source: z.enum(PLANNED_EXPECTED_SOURCES).optional(),
    expected_account_id: optionalNullableUuid,
    recurrence: z.enum(PLANNED_OBLIGATION_RECURRENCE).optional(),
    status: z.enum(PLANNED_OBLIGATION_STATUSES).optional(),
    priority: z.enum(PLANNED_OBLIGATION_PRIORITIES).optional(),
    affects_cashflow: z.boolean().optional(),
    reminder_days_before: z.array(z.number().int().min(0)).optional(),
    source: z.enum(PLANNED_OBLIGATION_SOURCES).optional(),
    notes: optionalNullableString,
    metadata: optionalMetadata,
  })
  .strict()
  .refine((o) => Object.keys(o).some((k) => k !== "workspace_id"), {
    message: "Enviá al menos un campo para actualizar.",
  });

export const plannedCashObligationPaidBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    amount_final: positiveAmount.optional(),
    notes: optionalNullableString,
  })
  .strict();

export const plannedCashObligationCancelBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    notes: optionalNullableString,
  })
  .strict();

export const plannedCashObligationConfirmBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    notes: optionalNullableString,
  })
  .strict();

export const recurringObligationTemplateCreateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    title: z.string().trim().min(1),
    category: z.string().trim().min(1),
    currency: currencyCode,
    amount: positiveAmount,
    recurrence_type: z.enum(["monthly", "quarterly", "yearly", "custom"]),
    recurrence_interval: z.number().int().positive().optional(),
    next_occurrence_date: ymd,
    auto_generate: z.boolean().optional(),
    active: z.boolean().optional(),
    metadata: optionalMetadata,
  })
  .strict();

export const recurringObligationTemplateUpdateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    title: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
    currency: currencyCode.optional(),
    amount: positiveAmount.optional(),
    recurrence_type: z.enum(["monthly", "quarterly", "yearly", "custom"]).optional(),
    recurrence_interval: z.number().int().positive().optional(),
    next_occurrence_date: ymd.optional(),
    auto_generate: z.boolean().optional(),
    active: z.boolean().optional(),
    metadata: optionalMetadata,
  })
  .strict()
  .refine((o) => Object.keys(o).some((k) => k !== "workspace_id"), {
    message: "Enviá al menos un campo para actualizar.",
  });

export const recurringObligationGenerateBodySchema = z
  .object({
    workspace_id: rejectWorkspaceId,
    within_days: z.number().int().min(1).max(365).optional(),
    as_of_date: ymd.optional(),
    persist: z.boolean().optional(),
  })
  .strict();

export type TreasuryAccountCreateBody = z.infer<typeof treasuryAccountCreateBodySchema>;
export type TreasuryAccountUpdateBody = z.infer<typeof treasuryAccountUpdateBodySchema>;
export type ManualCashMovementCreateBody = z.infer<typeof manualCashMovementCreateBodySchema>;
export type ManualCashMovementUpdateBody = z.infer<typeof manualCashMovementUpdateBodySchema>;
export type BankReconciliationMovementCreateBody = z.infer<
  typeof bankReconciliationMovementCreateBodySchema
>;
export type BankReconciliationMovementUpdateBody = z.infer<
  typeof bankReconciliationMovementUpdateBodySchema
>;
export type BankReconciliationMatchBody = z.infer<typeof bankReconciliationMatchBodySchema>;
export type BankReconciliationImportBody = z.infer<typeof bankReconciliationImportBodySchema>;
export type PlannedCashObligationCreateBody = z.infer<typeof plannedCashObligationCreateBodySchema>;
export type PlannedCashObligationUpdateBody = z.infer<typeof plannedCashObligationUpdateBodySchema>;
export type RecurringObligationTemplateCreateBody = z.infer<
  typeof recurringObligationTemplateCreateBodySchema
>;
export type RecurringObligationTemplateUpdateBody = z.infer<
  typeof recurringObligationTemplateUpdateBodySchema
>;
export type RecurringObligationGenerateBody = z.infer<typeof recurringObligationGenerateBodySchema>;
