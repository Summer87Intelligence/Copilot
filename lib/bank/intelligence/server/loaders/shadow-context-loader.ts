/**
 * Loader de contexto shadow por movimiento (solo lectura, workspace-scoped).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ClientCandidate,
  InvoiceCandidate,
  NormalizedBankMovement,
  PayerClientLink,
  ReceiptCandidate,
} from "@/lib/bank/intelligence/reconciliation-matching";
import type { PayerFingerprint } from "@/lib/bank/intelligence/payer-fingerprint";
import {
  mapClientRow,
  mapInvoiceRow,
  mapMovementRow,
  mapPayerLink,
  mapReceiptRow,
} from "@/lib/bank/intelligence/server/mappers";
import {
  getShadowMovementById,
  listReconciledReceiptIds,
  listShadowClientPayerLinks,
  listShadowClients,
  listShadowInvoices,
  listShadowMovements,
  listShadowPayerIdentitiesByHashes,
  listShadowReceipts,
  type BankMovementRow,
  type PayerIdentityRow,
} from "@/lib/bank/intelligence/server/repositories";
import { normalizeCurrency } from "@/lib/bank/intelligence/server/money";

export const SHADOW_DATE_WINDOW_DAYS = 7;

function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type ShadowMovementContext = {
  row: BankMovementRow;
  movement: NormalizedBankMovement;
  payerFp: PayerFingerprint;
  movementFpHash: string;
  payerIdentity: PayerIdentityRow | null;
  clients: ClientCandidate[];
  receipts: ReceiptCandidate[];
  invoices: InvoiceCandidate[];
  historicalLinks: PayerClientLink[];
  dateWindowDays: number;
};

export async function loadMovementsForShadowScope(
  supabase: SupabaseClient,
  workspaceId: string,
  opts: { movementIds?: string[]; limit: number }
): Promise<BankMovementRow[]> {
  if (opts.movementIds && opts.movementIds.length === 1) {
    const one = await getShadowMovementById(supabase, workspaceId, opts.movementIds[0]!);
    return one ? [one] : [];
  }
  return listShadowMovements(supabase, workspaceId, {
    movementIds: opts.movementIds,
    limit: opts.limit,
    pendingOnly: !opts.movementIds?.length,
  });
}

export async function loadShadowContextForMovement(
  supabase: SupabaseClient,
  workspaceId: string,
  row: BankMovementRow
): Promise<ShadowMovementContext | { skip: true; reason: string }> {
  if (row.workspace_id !== workspaceId) {
    return { skip: true, reason: "WORKSPACE_MISMATCH" };
  }

  const currency = normalizeCurrency(row.currency);
  if (!currency) {
    return { skip: true, reason: "UNSUPPORTED_CURRENCY" };
  }

  const { movement, payerFp, movementFpHash } = mapMovementRow(row);
  const fromDate = addDaysYmd(movement.date, -SHADOW_DATE_WINDOW_DAYS);
  const toDate = addDaysYmd(movement.date, SHADOW_DATE_WINDOW_DAYS);

  const identities = await listShadowPayerIdentitiesByHashes(supabase, workspaceId, [
    payerFp.hash,
  ]);
  const payerIdentity = identities.find((i) => i.account_hash === payerFp.hash) ?? null;

  const links =
    payerIdentity != null
      ? await listShadowClientPayerLinks(supabase, workspaceId, [payerIdentity.id])
      : [];
  const historicalLinks = links.map((link) => mapPayerLink(link, payerIdentity!));

  const clientRows = await listShadowClients(supabase, workspaceId);
  const clients = clientRows
    .map(mapClientRow)
    .filter((c): c is ClientCandidate => c != null && c.workspaceId === workspaceId);

  const receiptRows =
    movement.direction === "inflow"
      ? await listShadowReceipts(supabase, workspaceId, {
          fromDate,
          toDate,
          currency,
        })
      : [];
  const receiptIds = receiptRows.map((r) => r.id);
  const reconciled = await listReconciledReceiptIds(supabase, workspaceId, receiptIds);
  const receipts = receiptRows
    .map((r) => mapReceiptRow(r, reconciled.has(r.id)))
    .filter((r): r is ReceiptCandidate => r != null && r.workspaceId === workspaceId);

  const clientIdsForInvoices = [
    ...new Set([
      ...historicalLinks.map((l) => l.clientId),
      ...clients
        .filter((c) => c.normalizedName && c.normalizedName === movement.normalizedPayerName)
        .map((c) => c.clientId),
    ]),
  ].slice(0, 50);

  const invoiceRows =
    movement.direction === "inflow" && clientIdsForInvoices.length > 0
      ? await listShadowInvoices(supabase, workspaceId, {
          currency,
          clientIds: clientIdsForInvoices,
        })
      : [];
  const invoices = invoiceRows
    .map(mapInvoiceRow)
    .filter((i): i is InvoiceCandidate => i != null && i.workspaceId === workspaceId);

  return {
    row,
    movement,
    payerFp,
    movementFpHash,
    payerIdentity,
    clients,
    receipts,
    invoices,
    historicalLinks,
    dateWindowDays: SHADOW_DATE_WINDOW_DAYS,
  };
}
