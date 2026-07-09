import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SantanderImportPreviewBody } from "@/lib/bank-movements/bank-movements-import-api";
import {
  buildStatementImportRecord,
  planSantanderBankStatementImport,
  type ExistingBankMovementForDedupe,
} from "@/lib/bank-movements/santander-bank-statement-import-service";

export type ConfirmSantanderImportResult = {
  import_id: string;
  inserted_count: number;
  skipped_duplicates_count: number;
  total_preview_count: number;
};

export async function confirmSantanderBankStatementImport(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  importedBy: string;
  fileName: string;
  preview: SantanderImportPreviewBody;
}): Promise<ConfirmSantanderImportResult> {
  const { supabase, workspaceId, importedBy, fileName, preview } = params;
  const accountLabel = `Santander ${preview.account_number} ${preview.currency_code}`;

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
    workspaceId
  );

  const importInsert = buildStatementImportRecord({
    workspaceId,
    importedBy,
    fileName,
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
