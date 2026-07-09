/**
 * Contratos de confirmación de importación Santander PDF (Sprint D + E).
 */
import { z } from "zod";

import { MAX_BULK_PDF_FILES } from "@/lib/bank-movements/bank-movements-import-constants";
import { BANK_MOVEMENT_DIRECTIONS } from "@/lib/bank-movements/bank-movements-types";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD).");
const rejectWorkspaceId = z.never().optional();
const rejectImportedBy = z.never().optional();

export const santanderPreviewMovementSchema = z
  .object({
    date: ymd,
    reference: z.union([z.string(), z.null()]),
    type: z.string(),
    description: z.string().trim().min(1).max(500),
    debit: z.union([z.number().finite().positive(), z.null()]),
    credit: z.union([z.number().finite().positive(), z.null()]),
    amount: z.number().finite(),
    direction: z.enum(BANK_MOVEMENT_DIRECTIONS),
    balance: z.union([z.number().finite(), z.null()]),
    raw_text: z.string(),
    source_file: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

export const santanderImportPreviewSchema = z
  .object({
    bank_name: z.literal("Santander"),
    account_number: z.string().trim().min(6).max(32),
    currency_code: z.enum(["UYU", "USD"]),
    period_start: ymd,
    period_end: ymd,
    opening_balance: z.union([z.number().finite(), z.null()]),
    closing_balance: z.union([z.number().finite(), z.null()]),
    movements: z.array(santanderPreviewMovementSchema).min(1),
  })
  .strict();

const confirmFileType = z.union([
  z.literal("application/pdf"),
  z.literal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
]);

export const bankStatementImportConfirmItemSchema = z
  .object({
    file_name: z.string().trim().min(1).max(255),
    preview: santanderImportPreviewSchema,
  })
  .strict();

export const bankStatementImportConfirmBodySchema = z.union([
  z
    .object({
      workspace_id: rejectWorkspaceId,
      imported_by: rejectImportedBy,
      file_name: z.string().trim().min(1).max(255),
      file_type: confirmFileType,
      preview: santanderImportPreviewSchema,
    })
    .strict(),
  z
    .object({
      workspace_id: rejectWorkspaceId,
      imported_by: rejectImportedBy,
      file_type: confirmFileType.optional(),
      previews: z.array(bankStatementImportConfirmItemSchema).min(1).max(MAX_BULK_PDF_FILES),
    })
    .strict(),
]);

export type SantanderImportPreviewBody = z.infer<typeof santanderImportPreviewSchema>;
export type BankStatementImportConfirmBody = z.infer<typeof bankStatementImportConfirmBodySchema>;
export type BankStatementImportConfirmItem = z.infer<typeof bankStatementImportConfirmItemSchema>;

export function buildSantanderAccountLabel(accountNumber: string, currencyCode: "UYU" | "USD"): string {
  return `Santander ${accountNumber} ${currencyCode}`;
}

export function isBulkBankStatementImportConfirmBody(
  body: BankStatementImportConfirmBody
): body is Extract<BankStatementImportConfirmBody, { previews: BankStatementImportConfirmItem[] }> {
  return "previews" in body;
}
