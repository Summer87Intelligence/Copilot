/**
 * Lógica pura de confirmación de importación Santander (dedupe + filas).
 * FASE BANK-IDEMPOTENT-IMPORT-CLIENT-BANKING-HISTORY-001 — fingerprint_v1 + clasificación.
 */
import { createHash } from "node:crypto";

import { computeCanonicalOperationFingerprint } from "@/lib/bank/canonical/canonical-operation-fingerprint";
import {
  BANK_MOVEMENT_FINGERPRINT_VERSION,
  computeBankMovementFingerprintV1,
  normalizeSantanderDescription,
} from "@/lib/bank-movements/bank-movement-fingerprint-v1";
import { buildSantanderAccountLabel } from "@/lib/bank-movements/bank-movements-import-api";
import type { SantanderImportPreviewBody } from "@/lib/bank-movements/bank-movements-import-api";
import {
  bankAccountScopeReason,
  classifyBankAccount,
} from "@/lib/bank-movements/bank-account-scope";
import { sanitizeBankMovementDescription } from "@/lib/bank-movements/sanitize-bank-movement-description";
import type { SantanderParsedBankMovement } from "@/lib/bank-movements/santander-pdf-parser";

/** Motivo por el que un extracto no se importa (cuenta fuera de EASY). */
export type BlockedAccountInfo = {
  account_number: string;
  scope: "blocked_personal" | "unknown";
  reason: string;
};

export const SANTANDER_PDF_PARSER_ID = "santander_pdf_v1";
export const SANTANDER_EXCEL_CONSOLIDATED_PARSER_ID = "santander_excel_consolidated_v1";

export type BankStatementImportFileType = "pdf" | "xlsx" | "csv";
export const SANTANDER_CSV_PARSER_ID = "santander_csv_v1";

export function inferBankStatementImportFileType(fileName: string): BankStatementImportFileType {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  if (lower.endsWith(".csv")) return "csv";
  return "pdf";
}

export function inferBankStatementParserId(fileName: string): string {
  const fileType = inferBankStatementImportFileType(fileName);
  if (fileType === "xlsx") return SANTANDER_EXCEL_CONSOLIDATED_PARSER_ID;
  if (fileType === "csv") return SANTANDER_CSV_PARSER_ID;
  return SANTANDER_PDF_PARSER_ID;
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
  fingerprint_v1?: string | null;
  excluded_from_operations?: boolean | null;
  duplicate_of?: string | null;
};

export type PlannedMovementInsert = {
  movement_date: string;
  description: string;
  raw_description: string | null;
  normalized_description: string;
  amount: number;
  currency: "UYU" | "USD";
  direction: "inflow" | "outflow";
  bank_reference: string | null;
  status: "pending";
  metadata: Record<string, unknown>;
  dedupe_key: string;
  /** Huella legacy (solo con referencia) — compatibilidad con audit previo. */
  canonical_fingerprint: string | null;
  /** Huella canónica v1 (PDF/Excel/CSV). Siempre presente. */
  fingerprint_v1: string;
  fingerprint_version: typeof BANK_MOVEMENT_FINGERPRINT_VERSION;
};

/** Clasificación por fila parseada (resumen de importación). */
export type ImportRowOutcome =
  | "inserted"
  | "already_exists"
  | "duplicate_in_file"
  | "invalid"
  | "ambiguous";

export type ImportOutcomeCounts = {
  read: number;
  inserted: number;
  already_exists: number;
  duplicate_in_file: number;
  invalid: number;
  ambiguous: number;
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
  /** Ya existentes en DB (exacto o cross-parser). No es error. */
  already_exists_count: number;
  /** Duplicados dentro del mismo archivo/lote. */
  duplicate_in_file_count: number;
  outcomes: ImportOutcomeCounts;
  /** Duplicados cross-parser detectados por huella canónica, no por dedupe_key exacto. */
  cross_parser_duplicates: CrossParserDuplicateSkip[];
  /** Presente si la cuenta no es de EASY: no se importa nada. */
  blocked?: BlockedAccountInfo;
};

export function emptyImportOutcomeCounts(read = 0): ImportOutcomeCounts {
  return {
    read,
    inserted: 0,
    already_exists: 0,
    duplicate_in_file: 0,
    invalid: 0,
    ambiguous: 0,
  };
}

export function normalizeDescriptionForDedupe(description: string): string {
  return normalizeSantanderDescription(description);
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
 * Huella canónica v1 de una fila existente (PDF/Excel/CSV).
 * Prefiere columna/metadata persistida; si no, la recalcula.
 */
export function fingerprintV1FromExistingRow(
  row: ExistingBankMovementForDedupe,
  workspaceId: string
): string {
  if (typeof row.fingerprint_v1 === "string" && row.fingerprint_v1.length > 0) {
    return row.fingerprint_v1;
  }
  const storedMeta = row.metadata?.fingerprint_v1;
  if (typeof storedMeta === "string" && storedMeta.length > 0) return storedMeta;

  const accountNumber = extractAccountNumberFromLabel(row.account_label);
  const balanceRaw = row.metadata?.balance;
  const balanceAfter =
    typeof balanceRaw === "number"
      ? balanceRaw
      : typeof balanceRaw === "string" && balanceRaw.trim()
        ? Number(balanceRaw)
        : null;

  return computeBankMovementFingerprintV1({
    workspaceId,
    accountNumber,
    bankName: row.bank_name,
    bankReference: row.bank_reference,
    movementDate: row.movement_date.slice(0, 10),
    amount: Number(row.amount),
    currency: row.currency,
    direction: row.direction,
    description: row.description,
    balanceAfter: Number.isFinite(balanceAfter as number) ? (balanceAfter as number) : null,
  }).fingerprint;
}

/**
 * FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001
 * Huella canónica legacy de una fila ya existente (independiente del parser).
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

  // Regla global de importación: ningún texto de saldo de cuenta ("Saldo
  // final/inicial/disponible/contable", "Nuevo saldo", "Balance") se
  // persiste — para nadie, independiente de rol o permiso. `dedupe_key` /
  // `canonical_fingerprint` / `fingerprint_v1` de más abajo se calculan
  // igual que siempre a partir de `movement.description` SIN sanear: son la
  // identidad del movimiento para deduplicar contra filas ya importadas
  // (antes de este fix), y cambiar su input rompería esa continuidad en un
  // reimport del mismo extracto.
  // Fallback defensivo: `description` nunca debe quedar vacía (constraint de
  // DB `trim(description) <> ''`) — en la práctica un movimiento real
  // siempre tiene contenido más allá de un posible texto de saldo.
  const sanitizedDescription =
    sanitizeBankMovementDescription(movement.description) || movement.description.trim();
  const rawDescriptionSource = movement.raw_text?.trim() || movement.description.trim();
  const sanitizedRawDescription =
    sanitizeBankMovementDescription(rawDescriptionSource) || sanitizedDescription;
  const normalized_description = normalizeSantanderDescription(sanitizedDescription);
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

  const fp = computeBankMovementFingerprintV1({
    workspaceId: ctx.workspaceId,
    accountNumber: ctx.accountNumber,
    bankName: "Santander",
    bankReference: movement.reference,
    movementDate: movement.date,
    amount,
    currency: ctx.currencyCode,
    direction: movement.direction,
    description: movement.description,
    balanceAfter: movement.balance ?? null,
  });

  const metadata: Record<string, unknown> = {
    balance: movement.balance,
    debit: movement.debit,
    credit: movement.credit,
    type: movement.type,
    parser: parserId,
    source_parser: parserId,
    dedupe_key,
    canonical_fingerprint,
    fingerprint_v1: fp.fingerprint,
    fingerprint_version: fp.version,
    fingerprint_strength: fp.strength,
    account_number: ctx.accountNumber,
    normalized_description,
  };
  if (movement.source_file) {
    metadata.source_file = movement.source_file;
  }
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
    description: sanitizedDescription,
    raw_description: sanitizedRawDescription,
    normalized_description,
    amount,
    currency: ctx.currencyCode,
    direction: movement.direction,
    bank_reference: movement.reference,
    status: "pending",
    metadata,
    dedupe_key,
    canonical_fingerprint,
    fingerprint_v1: fp.fingerprint,
    fingerprint_version: fp.version,
  };
}

export function planSantanderBankStatementImport(
  preview: SantanderImportPreviewBody,
  existingRows: ExistingBankMovementForDedupe[],
  workspaceId: string,
  parserId: string = SANTANDER_PDF_PARSER_ID
): ImportPlanResult {
  const account_label = buildSantanderAccountLabel(preview.account_number, preview.currency_code);
  const outcomes = emptyImportOutcomeCounts(preview.movements.length);

  const scope = classifyBankAccount(preview.account_number);
  if (scope !== "business") {
    return {
      account_label,
      total_preview_count: preview.movements.length,
      to_insert: [],
      skipped_duplicates_count: 0,
      already_exists_count: 0,
      duplicate_in_file_count: 0,
      outcomes,
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
  const existingFingerprintToId = new Map<string, string>();
  for (const row of existingRows) {
    if (!row.id) continue;
    if (row.excluded_from_operations || row.duplicate_of) continue;
    const fingerprint = fingerprintV1FromExistingRow(row, workspaceId);
    if (fingerprint && !existingFingerprintToId.has(fingerprint)) {
      existingFingerprintToId.set(fingerprint, row.id);
    }
    // Compat: filas antiguas solo con canonical_fingerprint (ref).
    const legacy = canonicalFingerprintFromExistingRow(row, workspaceId);
    if (legacy && !existingFingerprintToId.has(legacy)) {
      existingFingerprintToId.set(legacy, row.id);
    }
  }

  const batchKeys = new Set<string>();
  const batchFingerprints = new Set<string>();
  const to_insert: PlannedMovementInsert[] = [];
  const cross_parser_duplicates: CrossParserDuplicateSkip[] = [];
  let already_exists_count = 0;
  let duplicate_in_file_count = 0;

  for (const movement of preview.movements) {
    if (!movement.date || !Number.isFinite(movementAbsoluteAmount(movement))) {
      outcomes.invalid += 1;
      continue;
    }

    const planned = buildMovementInsertFromPreview(movement, {
      workspaceId,
      accountNumber: preview.account_number,
      currencyCode: preview.currency_code,
      parserId,
    });

    const existsInDb =
      existingKeys.has(planned.dedupe_key) ||
      existingFingerprintToId.has(planned.fingerprint_v1) ||
      (planned.canonical_fingerprint
        ? existingFingerprintToId.has(planned.canonical_fingerprint)
        : false);

    if (existsInDb) {
      const existingMatchId =
        existingFingerprintToId.get(planned.fingerprint_v1) ??
        (planned.canonical_fingerprint
          ? existingFingerprintToId.get(planned.canonical_fingerprint)
          : undefined);
      if (
        existingMatchId &&
        !existingKeys.has(planned.dedupe_key) &&
        (planned.canonical_fingerprint || planned.fingerprint_v1)
      ) {
        cross_parser_duplicates.push({
          fingerprint: planned.fingerprint_v1,
          existingMovementId: existingMatchId,
          movement: planned,
        });
      }
      already_exists_count += 1;
      outcomes.already_exists += 1;
      continue;
    }

    if (batchKeys.has(planned.dedupe_key) || batchFingerprints.has(planned.fingerprint_v1)) {
      duplicate_in_file_count += 1;
      outcomes.duplicate_in_file += 1;
      continue;
    }

    batchKeys.add(planned.dedupe_key);
    batchFingerprints.add(planned.fingerprint_v1);
    to_insert.push(planned);
    outcomes.inserted += 1;
  }

  const skipped_duplicates_count = already_exists_count + duplicate_in_file_count;

  return {
    account_label,
    total_preview_count: preview.movements.length,
    to_insert,
    skipped_duplicates_count,
    already_exists_count,
    duplicate_in_file_count,
    outcomes,
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
  alreadyExistsCount?: number;
  duplicateInFileCount?: number;
  outcomes?: ImportOutcomeCounts;
  /**
   * "uploaded" mientras el insert idempotente de movimientos todavía no
   * terminó (el caller lo pasa a "parsed" recién cuando confirma éxito).
   * Sin movimientos nuevos por insertar, el proceso ya terminó al leer/
   * deduplicar: el caller puede pasar "parsed" directamente.
   */
  status?: "uploaded" | "parsed";
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
    status: input.status ?? "parsed",
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
      already_exists_count: input.alreadyExistsCount ?? 0,
      duplicate_in_file_count: input.duplicateInFileCount ?? 0,
      outcomes: input.outcomes ?? null,
      parser: parserId,
      fingerprint_version: BANK_MOVEMENT_FINGERPRINT_VERSION,
    },
  };
}
