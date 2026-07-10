/**
 * Lógica pura de confirmación de importación Santander (dedupe + filas).
 */
import { createHash } from "node:crypto";

import { buildSantanderAccountLabel } from "@/lib/bank-movements/bank-movements-import-api";
import type { SantanderImportPreviewBody } from "@/lib/bank-movements/bank-movements-import-api";
import {
  bankAccountScopeReason,
  classifyBankAccount,
} from "@/lib/bank-movements/bank-account-scope";
import type { SantanderParsedBankMovement } from "@/lib/bank-movements/santander-pdf-parser";

/** Motivo por el que un extracto no se importa (cuenta fuera de EASY). */
export type BlockedAccountInfo = {
  account_number: string;
  scope: "blocked_personal" | "unknown";
  reason: string;
};

export const SANTANDER_PDF_PARSER_ID = "santander_pdf_v1";
export const SANTANDER_EXCEL_CONSOLIDATED_PARSER_ID = "santander_excel_consolidated_v1";

export type BankStatementImportFileType = "pdf" | "xlsx";

export function inferBankStatementImportFileType(fileName: string): BankStatementImportFileType {
  return fileName.trim().toLowerCase().endsWith(".xlsx") ? "xlsx" : "pdf";
}

export function inferBankStatementParserId(fileName: string): string {
  return inferBankStatementImportFileType(fileName) === "xlsx"
    ? SANTANDER_EXCEL_CONSOLIDATED_PARSER_ID
    : SANTANDER_PDF_PARSER_ID;
}

export type ExistingBankMovementForDedupe = {
  movement_date: string;
  amount: number;
  currency: string;
  direction: string;
  bank_reference: string | null;
  description: string;
  account_label: string | null;
  bank_name: string;
  metadata?: Record<string, unknown> | null;
};

export type PlannedMovementInsert = {
  movement_date: string;
  description: string;
  raw_description: string | null;
  amount: number;
  currency: "UYU" | "USD";
  direction: "inflow" | "outflow";
  bank_reference: string | null;
  status: "pending";
  metadata: Record<string, unknown>;
  dedupe_key: string;
};

export type ImportPlanResult = {
  account_label: string;
  total_preview_count: number;
  to_insert: PlannedMovementInsert[];
  skipped_duplicates_count: number;
  /** Presente si la cuenta no es de EASY: no se importa nada. */
  blocked?: BlockedAccountInfo;
};

export function normalizeDescriptionForDedupe(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

export function extractAccountNumberFromLabel(accountLabel: string | null): string {
  return accountLabel?.match(/(\d{6,})/)?.[1] ?? "";
}

export function movementAbsoluteAmount(movement: SantanderParsedBankMovement): number {
  if (movement.direction === "outflow") {
    return movement.debit ?? Math.abs(movement.amount);
  }
  return movement.credit ?? Math.abs(movement.amount);
}

export function buildMovementDedupeKey(input: {
  workspaceId: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  movementDate: string;
  bankReference: string | null;
  amount: number;
  description: string;
}): string {
  const ref = input.bankReference?.trim() ?? "";
  const normDesc = normalizeDescriptionForDedupe(input.description);
  const payload = [
    input.workspaceId,
    input.bankName,
    input.accountNumber,
    input.currency,
    input.movementDate,
    ref,
    input.amount.toFixed(2),
    normDesc,
  ].join("|");

  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function dedupeKeyFromExistingRow(
  row: ExistingBankMovementForDedupe,
  workspaceId: string
): string {
  const stored = row.metadata?.dedupe_key;
  if (typeof stored === "string" && stored.length > 0) return stored;

  const accountNumber = extractAccountNumberFromLabel(row.account_label);
  return buildMovementDedupeKey({
    workspaceId,
    bankName: row.bank_name,
    accountNumber,
    currency: row.currency,
    movementDate: row.movement_date.slice(0, 10),
    bankReference: row.bank_reference,
    amount: Number(row.amount),
    description: row.description,
  });
}

export function buildMovementInsertFromPreview(
  movement: SantanderParsedBankMovement,
  ctx: {
    workspaceId: string;
    accountNumber: string;
    currencyCode: "UYU" | "USD";
    parserId?: string;
  }
): PlannedMovementInsert {
  const amount = movementAbsoluteAmount(movement);
  const parserId = ctx.parserId ?? SANTANDER_PDF_PARSER_ID;
  const dedupe_key = buildMovementDedupeKey({
    workspaceId: ctx.workspaceId,
    bankName: "Santander",
    accountNumber: ctx.accountNumber,
    currency: ctx.currencyCode,
    movementDate: movement.date,
    bankReference: movement.reference,
    amount,
    description: movement.description,
  });

  const metadata: Record<string, unknown> = {
    balance: movement.balance,
    debit: movement.debit,
    credit: movement.credit,
    type: movement.type,
    parser: parserId,
    dedupe_key,
    account_number: ctx.accountNumber,
  };
  if (movement.source_file) {
    metadata.source_file = movement.source_file;
  }

  return {
    movement_date: movement.date,
    description: movement.description.trim(),
    raw_description: movement.raw_text?.trim() || movement.description.trim(),
    amount,
    currency: ctx.currencyCode,
    direction: movement.direction,
    bank_reference: movement.reference,
    status: "pending",
    metadata,
    dedupe_key,
  };
}

export function planSantanderBankStatementImport(
  preview: SantanderImportPreviewBody,
  existingRows: ExistingBankMovementForDedupe[],
  workspaceId: string,
  parserId: string = SANTANDER_PDF_PARSER_ID
): ImportPlanResult {
  const account_label = buildSantanderAccountLabel(preview.account_number, preview.currency_code);

  // Guard de alcance: solo cuentas de empresa EASY se importan. Cuenta personal
  // bloqueada o no reconocida ⇒ 0 movimientos, sin insertar nada.
  const scope = classifyBankAccount(preview.account_number);
  if (scope !== "business") {
    return {
      account_label,
      total_preview_count: preview.movements.length,
      to_insert: [],
      skipped_duplicates_count: 0,
      blocked: {
        account_number: preview.account_number,
        scope,
        reason: bankAccountScopeReason(scope, preview.account_number),
      },
    };
  }

  const existingKeys = new Set(
    existingRows.map((row) => dedupeKeyFromExistingRow(row, workspaceId))
  );
  const batchKeys = new Set<string>();
  const to_insert: PlannedMovementInsert[] = [];
  let skipped_duplicates_count = 0;

  for (const movement of preview.movements) {
    const planned = buildMovementInsertFromPreview(movement, {
      workspaceId,
      accountNumber: preview.account_number,
      currencyCode: preview.currency_code,
      parserId,
    });

    if (existingKeys.has(planned.dedupe_key) || batchKeys.has(planned.dedupe_key)) {
      skipped_duplicates_count += 1;
      continue;
    }

    batchKeys.add(planned.dedupe_key);
    to_insert.push(planned);
  }

  return {
    account_label,
    total_preview_count: preview.movements.length,
    to_insert,
    skipped_duplicates_count,
  };
}

export function buildStatementImportRecord(input: {
  workspaceId: string;
  importedBy: string;
  fileName: string;
  fileType?: BankStatementImportFileType;
  parserId?: string;
  preview: SantanderImportPreviewBody;
  accountLabel: string;
  insertedCount: number;
  skippedDuplicatesCount: number;
  totalPreviewCount: number;
}): Record<string, unknown> {
  const fileType = input.fileType ?? inferBankStatementImportFileType(input.fileName);
  const parserId = input.parserId ?? inferBankStatementParserId(input.fileName);

  return {
    workspace_id: input.workspaceId,
    bank_name: "Santander",
    account_label: input.accountLabel,
    file_name: input.fileName,
    file_type: fileType,
    imported_by: input.importedBy,
    status: "parsed",
    row_count: input.insertedCount,
    metadata: {
      account_number: input.preview.account_number,
      currency_code: input.preview.currency_code,
      period_start: input.preview.period_start,
      period_end: input.preview.period_end,
      opening_balance: input.preview.opening_balance,
      closing_balance: input.preview.closing_balance,
      total_preview_count: input.totalPreviewCount,
      inserted_count: input.insertedCount,
      skipped_duplicates_count: input.skippedDuplicatesCount,
      parser: parserId,
    },
  };
}
