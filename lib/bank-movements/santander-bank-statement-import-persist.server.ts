import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BankStatementImportConfirmItem } from "@/lib/bank-movements/bank-movements-import-api";
import type { SantanderImportPreviewBody } from "@/lib/bank-movements/bank-movements-import-api";
import {
  type BulkConfirmData,
  type BulkConfirmErrorItem,
  type BulkConfirmResultItem,
  type BulkConfirmSkippedItem,
  resolveImportFileStatus,
} from "@/lib/bank-movements/bank-movements-import-bulk";
import {
  buildStatementImportRecord,
  emptyImportOutcomeCounts,
  inferBankStatementImportFileType,
  inferBankStatementParserId,
  planSantanderBankStatementImport,
  type BlockedAccountInfo,
  type ExistingBankMovementForDedupe,
  type ImportOutcomeCounts,
  type PlannedMovementInsert,
} from "@/lib/bank-movements/santander-bank-statement-import-service";
import {
  BANK_EXCLUSION_REASON_BEFORE_2026,
  isBankMovementDateHistorical,
} from "@/lib/bank/canonical/historical-policy";
import {
  bankAccountScopeReason,
  classifyBankAccount,
} from "@/lib/bank-movements/bank-account-scope";

export type ConfirmSantanderImportResult = {
  import_id: string | null;
  inserted_count: number;
  skipped_duplicates_count: number;
  already_exists_count: number;
  duplicate_in_file_count: number;
  excluded_before_2026_count: number;
  total_preview_count: number;
  outcomes: ImportOutcomeCounts;
  /** Duplicados cross-parser: misma operación real ya en DB desde otro archivo/parser. Nunca crean fila nueva. */
  cross_parser_duplicates_count: number;
  /** Presente si el extracto se rechazó por no ser cuenta de EASY. */
  blocked?: BlockedAccountInfo;
};

const CONFIRM_ERROR_MESSAGE = "No se pudo confirmar la importación del extracto.";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("duplicate key") || msg.includes("unique constraint");
}

function toMovementRow(
  workspaceId: string,
  importId: string,
  accountLabel: string,
  row: PlannedMovementInsert
) {
  const beforeCutoff = isBankMovementDateHistorical(row.movement_date);
  return {
    workspace_id: workspaceId,
    import_id: importId,
    bank_name: "Santander",
    account_label: accountLabel,
    movement_date: row.movement_date,
    description: row.description,
    raw_description: row.raw_description,
    normalized_description: row.normalized_description,
    amount: row.amount,
    currency: row.currency,
    direction: row.direction,
    bank_reference: row.bank_reference,
    status: row.status,
    metadata: beforeCutoff
      ? {
          ...row.metadata,
          exclusion_reason: BANK_EXCLUSION_REASON_BEFORE_2026,
        }
      : row.metadata,
    fingerprint_v1: row.fingerprint_v1,
    fingerprint_version: row.fingerprint_version,
    excluded_from_operations: beforeCutoff,
    duplicate_of: null,
  };
}

/**
 * Inserta filas nuevas. Si el índice único parcial está activo y hay carrera
 * concurrente, trata 23505 como already_exists (idempotente) sin fallar el lote.
 */
async function insertMovementsIdempotent(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  importId: string;
  accountLabel: string;
  rows: PlannedMovementInsert[];
}): Promise<{ inserted: number; racedAlreadyExists: number }> {
  if (params.rows.length === 0) return { inserted: 0, racedAlreadyExists: 0 };

  const movementRows = params.rows.map((row) =>
    toMovementRow(params.workspaceId, params.importId, params.accountLabel, row)
  );

  const { error } = await params.supabase.from("bank_movements").insert(movementRows);
  if (!error) return { inserted: movementRows.length, racedAlreadyExists: 0 };

  if (!isUniqueViolation(error)) {
    throw new Error("MOVEMENTS_INSERT_FAILED");
  }

  // Carrera concurrente o índice único: insertar uno a uno.
  let inserted = 0;
  let racedAlreadyExists = 0;
  for (const row of movementRows) {
    const { error: rowError } = await params.supabase.from("bank_movements").insert(row);
    if (!rowError) {
      inserted += 1;
      continue;
    }
    if (isUniqueViolation(rowError)) {
      racedAlreadyExists += 1;
      continue;
    }
    throw new Error("MOVEMENTS_INSERT_FAILED");
  }
  return { inserted, racedAlreadyExists };
}

export async function confirmSantanderBankStatementImport(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  importedBy: string;
  fileName: string;
  preview: SantanderImportPreviewBody;
}): Promise<ConfirmSantanderImportResult> {
  const { supabase, workspaceId, importedBy, fileName, preview } = params;
  const accountLabel = `Santander ${preview.account_number} ${preview.currency_code}`;
  const parserId = inferBankStatementParserId(fileName);
  const fileType = inferBankStatementImportFileType(fileName);

  const scope = classifyBankAccount(preview.account_number);
  if (scope !== "business") {
    return {
      import_id: null,
      inserted_count: 0,
      skipped_duplicates_count: 0,
      already_exists_count: 0,
      duplicate_in_file_count: 0,
      cross_parser_duplicates_count: 0,
      excluded_before_2026_count: 0,
      total_preview_count: preview.movements.length,
      outcomes: emptyImportOutcomeCounts(preview.movements.length),
      blocked: {
        account_number: preview.account_number,
        scope,
        reason: bankAccountScopeReason(scope, preview.account_number),
      },
    };
  }

  const { data: existingRows, error: loadError } = await supabase
    .from("bank_movements")
    .select(
      "id, movement_date, amount, currency, direction, bank_reference, description, account_label, bank_name, metadata, fingerprint_v1, excluded_from_operations, duplicate_of"
    )
    .eq("workspace_id", workspaceId)
    .eq("bank_name", "Santander")
    .eq("account_label", accountLabel)
    .eq("currency", preview.currency_code);

  if (loadError) {
    // Columnas nuevas pueden no estar aplicadas aún: fallback sin ellas.
    const { data: legacyRows, error: legacyError } = await supabase
      .from("bank_movements")
      .select(
        "id, movement_date, amount, currency, direction, bank_reference, description, account_label, bank_name, metadata"
      )
      .eq("workspace_id", workspaceId)
      .eq("bank_name", "Santander")
      .eq("account_label", accountLabel)
      .eq("currency", preview.currency_code);
    if (legacyError) throw new Error("LOAD_EXISTING_FAILED");
    return confirmWithExisting(supabase, {
      workspaceId,
      importedBy,
      fileName,
      preview,
      parserId,
      fileType,
      existingRows: (legacyRows ?? []) as ExistingBankMovementForDedupe[],
      writeFingerprintColumns: false,
    });
  }

  return confirmWithExisting(supabase, {
    workspaceId,
    importedBy,
    fileName,
    preview,
    parserId,
    fileType,
    existingRows: (existingRows ?? []) as ExistingBankMovementForDedupe[],
    writeFingerprintColumns: true,
  });
}

async function confirmWithExisting(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    importedBy: string;
    fileName: string;
    preview: SantanderImportPreviewBody;
    parserId: string;
    fileType: "pdf" | "xlsx" | "csv";
    existingRows: ExistingBankMovementForDedupe[];
    writeFingerprintColumns: boolean;
  }
): Promise<ConfirmSantanderImportResult> {
  const { workspaceId, importedBy, fileName, preview, parserId, fileType, existingRows } = params;

  const plan = planSantanderBankStatementImport(
    preview,
    existingRows,
    workspaceId,
    parserId
  );

  // Reimport sin filas nuevas: no crear import batch vacío (el resultado de
  // confirmación ya audita leídos / ya existentes / duplicados en archivo).
  if (plan.to_insert.length === 0) {
    return {
      import_id: null,
      inserted_count: 0,
      skipped_duplicates_count: plan.skipped_duplicates_count,
      already_exists_count: plan.already_exists_count,
      duplicate_in_file_count: plan.duplicate_in_file_count,
      excluded_before_2026_count: 0,
      cross_parser_duplicates_count: plan.cross_parser_duplicates.filter((d) => d.existingMovementId)
        .length,
      total_preview_count: plan.total_preview_count,
      outcomes: { ...plan.outcomes, inserted: 0 },
    };
  }

  const importInsert = buildStatementImportRecord({
    workspaceId,
    importedBy,
    fileName,
    fileType,
    parserId,
    preview,
    accountLabel: plan.account_label,
    insertedCount: plan.to_insert.length,
    skippedDuplicatesCount: plan.skipped_duplicates_count,
    totalPreviewCount: plan.total_preview_count,
    alreadyExistsCount: plan.already_exists_count,
    duplicateInFileCount: plan.duplicate_in_file_count,
    outcomes: plan.outcomes,
  });

  const { data: importRow, error: importError } = await supabase
    .from("bank_statement_imports")
    .insert(importInsert)
    .select("id")
    .single();

  if (importError || !importRow?.id) {
    throw new Error("IMPORT_INSERT_FAILED");
  }

  const importId = importRow.id as string;
  let insertedCount = 0;
  let racedAlreadyExists = 0;

  if (params.writeFingerprintColumns) {
    const result = await insertMovementsIdempotent({
      supabase,
      workspaceId,
      importId,
      accountLabel: plan.account_label,
      rows: plan.to_insert,
    });
    insertedCount = result.inserted;
    racedAlreadyExists = result.racedAlreadyExists;
  } else {
    const movementRows = plan.to_insert.map((row) => {
      const full = toMovementRow(workspaceId, importId, plan.account_label, row);
      const { fingerprint_v1: _fp, fingerprint_version: _ver, ...legacy } = full;
      return legacy;
    });
    const { error: movementsError } = await supabase.from("bank_movements").insert(movementRows);
    if (movementsError) throw new Error("MOVEMENTS_INSERT_FAILED");
    insertedCount = movementRows.length;
  }

  const crossParserDuplicates = plan.cross_parser_duplicates.filter((d) => d.existingMovementId);
  if (crossParserDuplicates.length > 0) {
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    for (const dup of crossParserDuplicates) {
      const existingRow = existingById.get(dup.existingMovementId);
      if (!existingRow) continue;
      const currentMetadata = (existingRow.metadata ?? {}) as Record<string, unknown>;
      const additionalSources = Array.isArray(currentMetadata.additional_sources)
        ? (currentMetadata.additional_sources as unknown[])
        : [];
      await supabase
        .from("bank_movements")
        .update({
          metadata: {
            ...currentMetadata,
            additional_sources: [
              ...additionalSources,
              {
                import_id: importId,
                file_name: fileName,
                parser: parserId,
                fingerprint_v1: dup.fingerprint,
                seen_at: new Date().toISOString(),
              },
            ],
          },
        })
        .eq("id", dup.existingMovementId);
    }
  }

  const alreadyExists = plan.already_exists_count + racedAlreadyExists;
  const excludedBefore2026 = plan.to_insert.filter((row) =>
    isBankMovementDateHistorical(row.movement_date)
  ).length;
  const outcomes: ImportOutcomeCounts = {
    ...plan.outcomes,
    inserted: insertedCount,
    already_exists: alreadyExists,
  };

  return {
    import_id: importId,
    inserted_count: insertedCount,
    skipped_duplicates_count: alreadyExists + plan.duplicate_in_file_count,
    already_exists_count: alreadyExists,
    duplicate_in_file_count: plan.duplicate_in_file_count,
    excluded_before_2026_count: excludedBefore2026,
    cross_parser_duplicates_count: crossParserDuplicates.length,
    total_preview_count: plan.total_preview_count,
    outcomes,
  };
}

export async function confirmSantanderBankStatementImportsBulk(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  importedBy: string;
  previews: BankStatementImportConfirmItem[];
}): Promise<BulkConfirmData> {
  const results: BulkConfirmResultItem[] = [];
  const errors: BulkConfirmErrorItem[] = [];
  const skipped: BulkConfirmSkippedItem[] = [];
  let inserted_count = 0;
  let skipped_duplicates_count = 0;
  let already_exists_count = 0;
  let duplicate_in_file_count = 0;
  let excluded_before_2026_count = 0;
  let total_preview_count = 0;
  let imported_files_count = 0;
  let failed_files_count = 0;
  let skipped_files_count = 0;
  const outcomes = emptyImportOutcomeCounts(0);

  for (const item of params.previews) {
    try {
      const result = await confirmSantanderBankStatementImport({
        supabase: params.supabase,
        workspaceId: params.workspaceId,
        importedBy: params.importedBy,
        fileName: item.file_name,
        preview: item.preview,
      });

      if (result.blocked) {
        skipped_files_count += 1;
        skipped.push({
          file_name: item.file_name,
          status: "skipped",
          account_number: result.blocked.account_number,
          account_scope: result.blocked.scope,
          movements_count: result.total_preview_count,
          reason: result.blocked.reason,
        });
        continue;
      }

      inserted_count += result.inserted_count;
      skipped_duplicates_count += result.skipped_duplicates_count;
      already_exists_count += result.already_exists_count;
      duplicate_in_file_count += result.duplicate_in_file_count;
      excluded_before_2026_count += result.excluded_before_2026_count;
      total_preview_count += result.total_preview_count;
      outcomes.read += result.outcomes.read;
      outcomes.inserted += result.outcomes.inserted;
      outcomes.already_exists += result.outcomes.already_exists;
      outcomes.duplicate_in_file += result.outcomes.duplicate_in_file;
      outcomes.invalid += result.outcomes.invalid;
      outcomes.ambiguous += result.outcomes.ambiguous;
      imported_files_count += 1;

      results.push({
        file_name: item.file_name,
        import_id: result.import_id ?? "",
        inserted_count: result.inserted_count,
        skipped_duplicates_count: result.skipped_duplicates_count,
        already_exists_count: result.already_exists_count,
        duplicate_in_file_count: result.duplicate_in_file_count,
        excluded_before_2026_count: result.excluded_before_2026_count,
        total_preview_count: result.total_preview_count,
        outcomes: result.outcomes,
        status: resolveImportFileStatus(result.inserted_count, result.skipped_duplicates_count),
      });
    } catch {
      failed_files_count += 1;
      errors.push({
        file_name: item.file_name,
        status: "error",
        error: CONFIRM_ERROR_MESSAGE,
      });
    }
  }

  return {
    files_count: params.previews.length,
    imported_files_count,
    failed_files_count,
    skipped_files_count,
    total_preview_count,
    inserted_count,
    skipped_duplicates_count,
    already_exists_count,
    duplicate_in_file_count,
    excluded_before_2026_count,
    outcomes,
    results,
    errors,
    skipped,
  };
}
