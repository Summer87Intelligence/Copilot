/**
 * Fetch + build estado de cuenta — mismo pipeline para preview JSON y PDF individual.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildClientAccountStatement } from "@/lib/copilot-client-account-statement";
import {
  listProtoInvoicesByCompanyIdForLedger,
  listProtoReceiptsByCompanyIdForLedger,
  getProtoCompanyById,
} from "@/lib/data/proto-operational-read-repository";
import {
  buildAccountStatementPeriodBlocks,
  resolveLedgerOpeningBalances,
  type AccountStatementPeriodBlock,
} from "@/lib/account-statement/account-statement-period-model";
import type { ClientAccountStatement } from "@/lib/copilot-client-account-statement";

export type AccountStatementApiModel = {
  companyName: string;
  company: Record<string, unknown> | null;
  statement: ClientAccountStatement;
  blocks: AccountStatementPeriodBlock[];
  openingBalanceUyu: number | null;
  openingBalanceUsd: number | null;
};

export async function buildAccountStatementApiModel(
  supabase: SupabaseClient,
  companyId: string,
  tenantCompanyId: string,
  options: {
    from?: string;
    to?: string;
    currencies?: Array<"UYU" | "USD">;
  }
): Promise<AccountStatementApiModel> {
  const currencies = options.currencies ?? ["UYU", "USD"];
  const from = options.from;
  const to = options.to;

  const [invoices, receipts, company] = await Promise.all([
    listProtoInvoicesByCompanyIdForLedger(supabase, companyId, tenantCompanyId),
    listProtoReceiptsByCompanyIdForLedger(supabase, companyId, tenantCompanyId),
    getProtoCompanyById(supabase, companyId, tenantCompanyId),
  ]);

  const companyRecord = company as Record<string, unknown> | null;
  const { openingBalanceUyu, openingBalanceUsd } = resolveLedgerOpeningBalances(companyRecord);

  const statement = buildClientAccountStatement({
    invoices,
    receipts,
    ledgerMode: true,
    openingBalanceUyu,
    openingBalanceUsd,
  });

  const companyName =
    String(
      companyRecord?.name ??
        companyRecord?.company_name ??
        companyRecord?.zeta_client_name ??
        ""
    ).trim() || "Cliente";

  const blocks = buildAccountStatementPeriodBlocks(statement, currencies, from, to);

  return {
    companyName,
    company: companyRecord,
    statement,
    blocks,
    openingBalanceUyu,
    openingBalanceUsd,
  };
}
