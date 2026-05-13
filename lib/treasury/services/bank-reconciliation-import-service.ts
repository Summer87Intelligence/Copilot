import type { SupabaseClient } from "@supabase/supabase-js";

import type { BankReconciliationImportBody } from "@/lib/api/schemas/treasury-api-bodies";
import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import { manualCashMovementRepositoryList } from "@/lib/treasury/repositories/manual-cash-movement-repository";
import {
  bankReconciliationMovementRepositoryInsert,
  bankReconciliationMovementRepositoryListExternalIds,
} from "@/lib/treasury/repositories/bank-reconciliation-movement-repository";
import { treasuryAccountRepositoryGetById } from "@/lib/treasury/repositories/treasury-account-repository";
import {
  ensureTreasuryAccountForMovement,
  mapDbError,
} from "@/lib/treasury/treasury-db-helpers";
import { bestMatchSuggestionForBank } from "@/lib/treasury/treasury-reconciliation-match";
import { resolveTreasuryWorkspaceId } from "@/lib/treasury/treasury-tenant";
import type { BankReconciliationMovement } from "@/lib/treasury/treasury-types";
import {
  bankReconciliationMovementMarkMatched,
} from "@/lib/treasury/services/bank-reconciliation-movement-service";

const AUTO_MATCH_THRESHOLD = 85;

export type BankImportPreviewRow = {
  movementDate: string;
  description: string;
  amount: number;
  currencyCode: string;
  movementType: string;
  externalId: string;
  documentNumber: string | null;
  balanceAfter: number | null;
  duplicate: boolean;
  suggestion: {
    manualId: string;
    confidence: number;
    amountDelta: number;
    dayDelta: number;
  } | null;
};

export type BankImportResult = {
  preview: BankImportPreviewRow[];
  imported: BankReconciliationMovement[];
  importedCount: number;
  skippedDuplicates: number;
  autoMatchedCount: number;
};

export async function bankReconciliationImportSantander(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  body: BankReconciliationImportBody
): Promise<ProtoCrudResult<BankImportResult>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);
  const account = await treasuryAccountRepositoryGetById(supabase, workspaceId, body.account_id);
  if (account.error) return mapDbError(account.error);
  if (!account.row) return protoCrudResult.fail("NOT_FOUND", "Cuenta treasury no encontrada.");

  const manualList = await manualCashMovementRepositoryList(supabase, workspaceId, {}, 500);
  if (manualList.error) return mapDbError(manualList.error);

  const externalIds = body.rows.map((row) => row.external_id);
  const existing = await bankReconciliationMovementRepositoryListExternalIds(
    supabase,
    workspaceId,
    externalIds
  );
  if (existing.error) return mapDbError(existing.error);

  const preview: BankImportPreviewRow[] = body.rows.map((row) => {
    const suggestion = bestMatchSuggestionForBank(
      {
        id: "preview",
        workspaceId,
        companyId: null,
        accountId: body.account_id,
        bankName: account.row?.bankName ?? "Santander",
        accountNumber: account.row?.accountNumber ?? null,
        accountName: account.row?.name ?? null,
        movementDate: row.movement_date,
        description: row.description,
        amount: row.amount,
        currencyCode: row.currency_code,
        movementType: row.movement_type,
        externalId: row.external_id,
        documentNumber: row.document_number ?? null,
        balanceAfter: row.balance_after ?? null,
        matched: false,
        matchStatus: "unmatched",
        matchedSource: "none",
        matchedRecordId: null,
        confidence: null,
        importedFrom: "csv",
        importedAt: new Date().toISOString(),
        rawPayload: row.raw_payload ?? null,
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      manualList.rows
    );

    return {
      movementDate: row.movement_date,
      description: row.description,
      amount: row.amount,
      currencyCode: row.currency_code,
      movementType: row.movement_type,
      externalId: row.external_id,
      documentNumber: row.document_number ?? null,
      balanceAfter: row.balance_after ?? null,
      duplicate: existing.ids.has(row.external_id),
      suggestion: suggestion
        ? {
            manualId: suggestion.manualId,
            confidence: suggestion.confidence,
            amountDelta: suggestion.amountDelta,
            dayDelta: suggestion.dayDelta,
          }
        : null,
    };
  });

  if (!body.apply) {
    return protoCrudResult.ok(
      {
        preview,
        imported: [],
        importedCount: 0,
        skippedDuplicates: preview.filter((row) => row.duplicate).length,
        autoMatchedCount: 0,
      },
      "Preview de importación Santander generado."
    );
  }

  const imported: BankReconciliationMovement[] = [];
  let skippedDuplicates = 0;
  let autoMatchedCount = 0;

  for (const row of body.rows) {
    if (existing.ids.has(row.external_id)) {
      skippedDuplicates += 1;
      continue;
    }

    const accountCheck = await ensureTreasuryAccountForMovement(
      supabase,
      workspaceId,
      body.account_id,
      row.currency_code
    );
    if (!accountCheck.ok) return accountCheck;

    const { row: created, error } = await bankReconciliationMovementRepositoryInsert(
      supabase,
      workspaceId,
      {
        company_id: account.row.companyId,
        account_id: body.account_id,
        bank_name: account.row.bankName ?? "Santander",
        account_number: account.row.accountNumber,
        account_name: account.row.name,
        movement_date: row.movement_date,
        description: row.description,
        amount: row.amount,
        currency_code: row.currency_code,
        movement_type: row.movement_type,
        external_id: row.external_id,
        document_number: row.document_number ?? null,
        balance_after: row.balance_after ?? null,
        imported_from: "csv",
        raw_payload: row.raw_payload ?? null,
        matched: false,
        match_status: "unmatched",
        matched_source: "none",
        matched_record_id: null,
        confidence: null,
      }
    );
    if (error) return mapDbError(error);
    if (!created) {
      return protoCrudResult.fail("DATABASE", "No se pudo importar un movimiento bancario.");
    }

    existing.ids.add(row.external_id);
    imported.push(created);

    if (body.auto_match !== false) {
      const suggestion = bestMatchSuggestionForBank(created, manualList.rows);
      if (suggestion && suggestion.confidence >= AUTO_MATCH_THRESHOLD) {
        const matched = await bankReconciliationMovementMarkMatched(
          supabase,
          tenantCompanyId,
          created.id,
          {
            matched_source: "manual_cash",
            matched_record_id: suggestion.manualId,
            confidence: suggestion.confidence,
            notes: "Auto-match importación Santander",
          }
        );
        if (matched.ok) {
          autoMatchedCount += 1;
          imported[imported.length - 1] = matched.data;
        }
      }
    }
  }

  return protoCrudResult.ok(
    {
      preview,
      imported,
      importedCount: imported.length,
      skippedDuplicates,
      autoMatchedCount,
    },
    "Importación Santander completada."
  );
}
