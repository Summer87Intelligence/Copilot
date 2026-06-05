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
  enrichSantanderImportRows,
  buildSantanderImportSummary,
  type EnrichedSantanderImportRow,
  type SantanderImportSummary,
  type ClientMatchInput,
  type ZetaReceiptMatchInput,
} from "@/lib/treasury/santander-import-reconciliation";
import {
  ensureTreasuryAccountForMovement,
  mapDbError,
} from "@/lib/treasury/treasury-db-helpers";
import { resolveTreasuryWorkspaceId } from "@/lib/treasury/treasury-tenant";
import type { BankReconciliationMovement, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

export type BankImportPreviewRow = EnrichedSantanderImportRow;

export type BankImportResult = {
  preview: BankImportPreviewRow[];
  summary: SantanderImportSummary;
  imported: BankReconciliationMovement[];
  importedCount: number;
  skippedDuplicates: number;
  autoMatchedCount: number;
};

async function loadZetaReceipts(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<ZetaReceiptMatchInput[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - 18);
  const sinceYmd = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("proto_receipts")
    .select("id, amount, currency_code, receipt_date, receipt_number, company_id, status")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true)
    .gte("receipt_date", sinceYmd)
    .limit(8000);
  if (error || !data) return [];

  const companyIds = [
    ...new Set(
      data
        .map((r) => (r as { company_id?: string | null }).company_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const names = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from("proto_companies")
      .select("id, name")
      .in("id", companyIds.slice(0, 500));
    for (const c of companies ?? []) {
      const row = c as { id: string; name: string | null };
      if (row.id && row.name) names.set(row.id, row.name);
    }
  }

  const out: ZetaReceiptMatchInput[] = [];
  for (const raw of data) {
    const row = raw as {
      id: string;
      amount: number | null;
      currency_code: string | null;
      receipt_date: string | null;
      receipt_number: string | null;
      company_id: string | null;
      status: string | null;
    };
    const code = String(row.currency_code ?? "").toUpperCase();
    if (code !== "UYU" && code !== "USD") continue;
    const amount = typeof row.amount === "number" ? row.amount : 0;
    const receiptDate = String(row.receipt_date ?? "").slice(0, 10);
    if (amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)) continue;
    const st = String(row.status ?? "").toLowerCase();
    if (st && ["void", "voided", "canceled", "cancelled", "anulada"].includes(st)) continue;
    out.push({
      id: row.id,
      amount,
      currencyCode: code as TreasuryCurrencyCode,
      receiptDate,
      clientName: row.company_id ? names.get(row.company_id) ?? null : null,
      receiptNumber: row.receipt_number,
    });
  }
  return out;
}

async function loadClients(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<ClientMatchInput[]> {
  const { data, error } = await supabase
    .from("proto_companies")
    .select("id, name")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("is_active", true)
    .limit(3000);
  if (error || !data) return [];

  const companyIds = data.map((r) => (r as { id: string }).id);
  const aliasMap = new Map<string, string[]>();
  if (companyIds.length > 0) {
    const { data: aliasRows } = await supabase
      .from("client_transfer_aliases")
      .select("company_id, label")
      .eq("workspace_id", tenantCompanyId)
      .eq("is_active", true)
      .in("company_id", companyIds.slice(0, 500))
      .order("created_at", { ascending: true })
      .limit(20000);
    for (const row of aliasRows ?? []) {
      const r = row as { company_id: string; label: string };
      if (!aliasMap.has(r.company_id)) aliasMap.set(r.company_id, []);
      aliasMap.get(r.company_id)!.push(r.label);
    }
  }

  return data.map((row) => {
    const r = row as { id: string; name: string | null };
    return {
      id: r.id,
      name: r.name ?? "Cliente",
      debtUyu: 0,
      debtUsd: 0,
      transferAliases: aliasMap.get(r.id) ?? [],
    };
  });
}

export async function bankReconciliationImportSantander(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  body: BankReconciliationImportBody
): Promise<ProtoCrudResult<BankImportResult>> {
  const workspaceId = resolveTreasuryWorkspaceId(tenantCompanyId);

  const account =
    body.account_id != null
      ? await treasuryAccountRepositoryGetById(supabase, workspaceId, body.account_id)
      : { row: null, error: null };
  if (account.error) return mapDbError(account.error);
  if (body.account_id && !account.row) {
    return protoCrudResult.fail("NOT_FOUND", "Cuenta treasury no encontrada.");
  }

  const manualList = await manualCashMovementRepositoryList(supabase, workspaceId, {}, 500);
  if (manualList.error) return mapDbError(manualList.error);

  const [receipts, clients] = await Promise.all([
    loadZetaReceipts(supabase, tenantCompanyId),
    loadClients(supabase, tenantCompanyId),
  ]);

  const externalIds = body.rows.map((row) => row.external_id);
  const existing = await bankReconciliationMovementRepositoryListExternalIds(
    supabase,
    workspaceId,
    externalIds
  );
  if (existing.error) return mapDbError(existing.error);

  const parsedRows = body.rows.map((row) => ({
    movementDate: row.movement_date,
    description: row.description,
    amount: row.amount,
    currencyCode: row.currency_code as TreasuryCurrencyCode,
    movementType: row.movement_type as "credit" | "debit",
    externalId: row.external_id,
    documentNumber: row.document_number ?? null,
    balanceAfter: row.balance_after ?? null,
    importedFrom: "csv" as const,
    rawPayload: (row.raw_payload as Record<string, unknown>) ?? {},
  }));

  const preview = enrichSantanderImportRows({
    rows: parsedRows,
    manualMovements: manualList.rows,
    receipts,
    clients,
    existingExternalIds: existing.ids,
  });
  const summary = buildSantanderImportSummary(preview);

  if (!body.apply) {
    return protoCrudResult.ok(
      {
        preview,
        summary,
        imported: [],
        importedCount: 0,
        skippedDuplicates: summary.duplicate,
        autoMatchedCount: 0,
      },
      "Preview de importación Santander generado."
    );
  }

  if (!body.account_id || !account.row) {
    return protoCrudResult.fail(
      "VALIDATION",
      "Seleccioná una cuenta destino para guardar movimientos importados."
    );
  }

  const imported: BankReconciliationMovement[] = [];
  let skippedDuplicates = 0;

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
  }

  return protoCrudResult.ok(
    {
      preview,
      summary,
      imported,
      importedCount: imported.length,
      skippedDuplicates,
      autoMatchedCount: 0,
    },
    "Movimientos bancarios guardados. No se modificó la caja automáticamente."
  );
}
