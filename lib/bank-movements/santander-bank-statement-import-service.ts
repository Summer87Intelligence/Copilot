/**
 * Lógica pura de confirmación de importación Santander (dedupe + filas).
 */
import { createHash } from "node:crypto";

import { computeCanonicalOperationFingerprint } from "@/lib/bank/canonical/canonical-operation-fingerprint";
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
  /** Opcional para no romper fixtures de test previos; requerido en producción
   *  para poder registrar evidencia cross-parser sobre la fila existente. */
  id?: string;
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
  /** Huella independiente del parser — ver canonical-operation-fingerprint.ts. Null sin referencia bancaria. */
  canonical_fingerprint: string | null;
};

/**
 * FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001
 * Movimiento planeado cuya huella canónica coincide con una fila YA EXISTENTE
 * en DB, importada por otro archivo/parser (p. ej. Excel consolidado vs PDF
 * mensual con el mismo bank_reference). No se inserta como fila operativa
 * nueva — el llamador con acceso a DB registra esto como evidencia sobre la
 * fila existente (`existingMovementId`), nunca crea un duplicado.
 */
export type CrossParserDuplicateSkip = {
  fingerprint: string;
  existingMovementId: string;
  movement: PlannedMovementInsert;
};

export type ImportPlanResult = {
  account_label: string;
  total_preview_count: number;
  to_insert: PlannedMovementInsert[];
  skipped_duplicates_count: number;
  /** Duplicados cross-parser detectados por huella canónica, no por dedupe_key exacto. */
  cross_parser_duplicates: CrossParserDuplicateSkip[];
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

/**
 * FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001
 * Huella canónica de una fila ya existente (independiente del parser). A
 * diferencia de `dedupeKeyFromExistingRow`, nunca depende de la descripción —
 * detecta la MISMA operación real vista antes por otro archivo/parser.
 * Devuelve null cuando la fila no tiene referencia bancaria.
 */
export function canonicalFingerprintFromExistingRow(
  row: ExistingBankMovementForDedupe,
  workspaceId: string
): string | null {
  const stored = row.metadata?.canonical_fingerprint;
  if (typeof stored === "string" && stored.length > 0) return stored;

  const accountNumber = extractAccountNumberFromLabel(row.account_label);
  return computeCanonicalOperationFingerprint({
    workspaceId,
    accountNumber,
    bankReference: row.bank_reference,
    movementDate: row.movement_date.slice(0, 10),
    amount: Number(row.amount),
    currency: row.currency,
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

  const canonical_fingerprint = computeCanonicalOperationFingerprint({
    workspaceId: ctx.workspaceId,
    accountNumber: ctx.accountNumber,
    bankReference: movement.reference,
    movementDate: movement.date,
    amount,
    currency: ctx.currencyCode,
  });

  const metadata: Record<string, unknown> = {
    balance: movement.balance,
    debit: movement.debit,
    credit: movement.credit,
    type: movement.type,
    parser: parserId,
    dedupe_key,
    canonical_fingerprint,
    account_number: ctx.accountNumber,
  };
  if (movement.source_file) {
    metadata.source_file = movement.source_file;
  }
  // Señales estructuradas de pagador (aprendizaje en confirmación). Nunca se
  // usa bank_reference / NRR / TT como identidad permanente.
  if (movement.payer_name_raw) metadata.payer_name_raw = movement.payer_name_raw;
  if (movement.payer_name_normalized) {
    metadata.payer_name_normalized = movement.payer_name_normalized;
  }
  if (movement.payer_token) metadata.payer_token = movement.payer_token;
  if (movement.operation_group_key) {
    metadata.operation_group_key = movement.operation_group_key;
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
    canonical_fingerprint,
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
      cross_parser_duplicates: [],
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
  // Mapa huella canónica -> id de fila existente. Solo filas con id (siempre
  // el caso en producción; algunos fixtures de test legacy lo omiten a
  // propósito y quedan fuera de este chequeo cross-parser adicional).
  const existingFingerprintToId = new Map<string, string>();
  for (const row of existingRows) {
    if (!row.id) continue;
    const fingerprint = canonicalFingerprintFromExistingRow(row, workspaceId);
    if (fingerprint && !existingFingerprintToId.has(fingerprint)) {
      existingFingerprintToId.set(fingerprint, row.id);
    }
  }

  const batchKeys = new Set<string>();
  const batchFingerprints = new Set<string>();
  const to_insert: PlannedMovementInsert[] = [];
  const cross_parser_duplicates: CrossParserDuplicateSkip[] = [];
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

    // Chequeo adicional independiente del dedupe_key exacto: la misma
    // operación real ya importada por otro archivo/parser (huella canónica
    // sin descripción). Nunca crea una segunda fila operativa — el llamador
    // con acceso a DB registra esto como evidencia sobre la fila existente.
    const existingMatchId = planned.canonical_fingerprint
      ? existingFingerprintToId.get(planned.canonical_fingerprint)
      : undefined;
    if (planned.canonical_fingerprint && existingMatchId) {
      cross_parser_duplicates.push({
        fingerprint: planned.canonical_fingerprint,
        existingMovementId: existingMatchId,
        movement: planned,
      });
      continue;
    }
    if (planned.canonical_fingerprint && batchFingerprints.has(planned.canonical_fingerprint)) {
      // Dos filas del mismo archivo comparten huella (misma operación real
      // duplicada dentro del propio extracto, p. ej. superposición de
      // páginas). La primera ya quedó en to_insert; esta segunda se omite
      // igual que un duplicado exacto — no hay fila existente en DB todavía
      // a la cual asociarle evidencia (ambas nacen del mismo lote).
      skipped_duplicates_count += 1;
      continue;
    }

    batchKeys.add(planned.dedupe_key);
    if (planned.canonical_fingerprint) batchFingerprints.add(planned.canonical_fingerprint);
    to_insert.push(planned);
  }

  return {
    account_label,
    total_preview_count: preview.movements.length,
    to_insert,
    skipped_duplicates_count,
    cross_parser_duplicates,
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
