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
  inferBankStatementImportFileType,
  inferBankStatementParserId,
  planSantanderBankStatementImport,
  type BlockedAccountInfo,
  type ExistingBankMovementForDedupe,
} from "@/lib/bank-movements/santander-bank-statement-import-service";
import {
  bankAccountScopeReason,
  classifyBankAccount,
} from "@/lib/bank-movements/bank-account-scope";

export type ConfirmSantanderImportResult = {
  import_id: string | null;
  inserted_count: number;
  skipped_duplicates_count: number;
  total_preview_count: number;
  /** Presente si el extracto se rechazó por no ser cuenta de EASY. */
  blocked?: BlockedAccountInfo;
};

const CONFIRM_ERROR_MESSAGE = "No se pudo confirmar la importación del extracto.";

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

  // Guard duro de alcance (defensa en profundidad): si la cuenta no es de EASY,
  // no se toca la DB — ni import ni movimientos. Aunque el cliente esquive el preview.
  const scope = classifyBankAccount(preview.account_number);
  if (scope !== "business") {
    return {
      import_id: null,
      inserted_count: 0,
      skipped_duplicates_count: 0,
      total_preview_count: preview.movements.length,
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
      "movement_date, amount, currency, direction, bank_reference, description, account_label, bank_name, metadata"
    )
    .eq("workspace_id", workspaceId)
    .eq("bank_name", "Santander")
    .eq("account_label", accountLabel)
    .eq("currency", preview.currency_code);

  if (loadError) {
    throw new Error("LOAD_EXISTING_FAILED");
  }

  const plan = planSantanderBankStatementImport(
    preview,
    (existingRows ?? []) as ExistingBankMovementForDedupe[],
    workspaceId,
    parserId
  );

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

  if (plan.to_insert.length > 0) {
    const movementRows = plan.to_insert.map((row) => ({
      workspace_id: workspaceId,
      import_id: importId,
      bank_name: "Santander",
      account_label: plan.account_label,
      movement_date: row.movement_date,
      description: row.description,
      raw_description: row.raw_description,
      amount: row.amount,
      currency: row.currency,
      direction: row.direction,
      bank_reference: row.bank_reference,
      status: row.status,
      metadata: row.metadata,
    }));

    const { error: movementsError } = await supabase.from("bank_movements").insert(movementRows);
    if (movementsError) {
      throw new Error("MOVEMENTS_INSERT_FAILED");
    }
  }

  return {
    import_id: importId,
    inserted_count: plan.to_insert.length,
    skipped_duplicates_count: plan.skipped_duplicates_count,
    total_preview_count: plan.total_preview_count,
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
  let total_preview_count = 0;
  let imported_files_count = 0;
  let failed_files_count = 0;
  let skipped_files_count = 0;

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
      total_preview_count += result.total_preview_count;
      imported_files_count += 1;

      results.push({
        file_name: item.file_name,
        import_id: result.import_id ?? "",
        inserted_count: result.inserted_count,
        skipped_duplicates_count: result.skipped_duplicates_count,
        total_preview_count: result.total_preview_count,
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
    results,
    errors,
    skipped,
  };
}
