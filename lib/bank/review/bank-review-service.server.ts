/**
 * FASE BANK-HISTORICAL-REVIEW-UI-001 — servicio server-side de revisión bancaria.
 *
 * Lectura ESTRICTAMENTE por ámbito (`suggestion_scope`), workspace-scoped, con
 * enriquecimiento (movimiento/recibo/cliente + fingerprint). Solo lectura. No
 * escribe, no concilia, no llama RPC. Separa la consulta por tab (un scope por llamada).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { mapMovementRow } from "@/lib/bank/intelligence/server/mappers";
import {
  countHistoricalSuggestions,
  countOperationalSuggestions,
  countPendingSuggestions,
  countSuggestionsByScope,
  listSuggestionsByScope,
  type BankMovementRow,
} from "@/lib/bank/intelligence/server/repositories";
import type { SuggestionScope } from "@/lib/bank/intelligence/server/types";
import {
  buildBankReviewRow,
  type BankReviewRow,
} from "@/lib/bank/review/bank-review-view";

export const BANK_REVIEW_MAX_ROWS = 500;

export type BankReviewSummary = {
  operational: number;
  historical_review: number;
  matched_audit: number;
  pending: number;
};

export type BankReviewRowsResult = {
  scope: SuggestionScope;
  rows: BankReviewRow[];
  total: number;
  capped: boolean;
};

function requireWs(workspaceId: string): string {
  const id = String(workspaceId ?? "").trim();
  if (!id) throw new Error("BANK_REVIEW_WORKSPACE_REQUIRED");
  return id;
}

/** Contadores por ámbito para el header (nunca calculados en frontend). */
export async function fetchBankReviewSummary(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<BankReviewSummary> {
  const ws = requireWs(workspaceId);
  const [operational, historical, matched, pending] = await Promise.all([
    countOperationalSuggestions(supabase, ws),
    countHistoricalSuggestions(supabase, ws),
    countSuggestionsByScope(supabase, ws, "matched_audit"),
    countPendingSuggestions(supabase, ws),
  ]);
  return {
    operational,
    historical_review: historical,
    matched_audit: matched,
    pending,
  };
}

/** Filas enriquecidas de UN ámbito. Separado por tab; nunca mezcla scopes. */
export async function fetchBankReviewRows(
  supabase: SupabaseClient,
  workspaceId: string,
  scope: SuggestionScope
): Promise<BankReviewRowsResult> {
  const ws = requireWs(workspaceId);

  const total = await countSuggestionsByScope(supabase, ws, scope);
  const suggestions = await listSuggestionsByScope(supabase, ws, scope, {
    engineVersion: undefined,
  });
  const capped = suggestions.length > BANK_REVIEW_MAX_ROWS;
  const sliced = suggestions.slice(0, BANK_REVIEW_MAX_ROWS);

  const movementIds = [...new Set(sliced.map((s) => s.bankMovementId).filter(Boolean))];
  const receiptIds = [...new Set(sliced.map((s) => s.proposedReceiptId).filter(Boolean) as string[])];
  const clientIds = [...new Set(sliced.map((s) => s.proposedClientId).filter(Boolean) as string[])];

  const [movementsRes, receiptsRes, clientsRes] = await Promise.all([
    movementIds.length
      ? supabase
          .from("bank_movements")
          .select(
            "id, workspace_id, bank_name, account_label, movement_date, description, raw_description, amount, currency, direction, bank_reference, status, metadata"
          )
          .eq("workspace_id", ws)
          .in("id", movementIds.slice(0, BANK_REVIEW_MAX_ROWS))
      : Promise.resolve({ data: [], error: null }),
    receiptIds.length
      ? supabase
          .from("proto_receipts")
          .select("id, receipt_date, amount, currency_code")
          .eq("workspace_company_id", ws)
          .in("id", receiptIds.slice(0, BANK_REVIEW_MAX_ROWS))
      : Promise.resolve({ data: [], error: null }),
    clientIds.length
      ? supabase
          .from("proto_companies")
          .select("id, name")
          .eq("workspace_company_id", ws)
          .in("id", clientIds.slice(0, BANK_REVIEW_MAX_ROWS))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (movementsRes.error) throw new Error(`BANK_REVIEW_MOVEMENTS_FAILED: ${movementsRes.error.message}`);
  if (receiptsRes.error) throw new Error(`BANK_REVIEW_RECEIPTS_FAILED: ${receiptsRes.error.message}`);
  if (clientsRes.error) throw new Error(`BANK_REVIEW_CLIENTS_FAILED: ${clientsRes.error.message}`);

  const movementById = new Map<string, BankMovementRow>();
  for (const row of (movementsRes.data ?? []) as BankMovementRow[]) movementById.set(row.id, row);
  const receiptById = new Map<string, { receipt_date: string; amount: number; currency_code: string }>();
  for (const row of (receiptsRes.data ?? []) as Array<{ id: string; receipt_date: string; amount: number; currency_code: string }>) {
    receiptById.set(row.id, row);
  }
  const clientById = new Map<string, { name: string | null }>();
  for (const row of (clientsRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    clientById.set(row.id, { name: row.name });
  }

  const rows: BankReviewRow[] = [];
  for (const s of sliced) {
    const mvRow = movementById.get(s.bankMovementId);
    if (!mvRow || mvRow.workspace_id !== ws) continue; // defensa: nunca cruzar workspace
    const { movement, payerFp, movementFpHash } = mapMovementRow(mvRow);
    const rc = s.proposedReceiptId ? receiptById.get(s.proposedReceiptId) : undefined;
    const cl = s.proposedClientId ? clientById.get(s.proposedClientId) : undefined;

    rows.push(
      buildBankReviewRow({
        suggestion: {
          id: s.id,
          bankMovementId: s.bankMovementId,
          suggestionScope: s.suggestionScope,
          status: s.status,
          recommendedAction: s.recommendedAction,
          confidence: s.confidence,
          proposedReceiptId: s.proposedReceiptId,
          proposedClientId: s.proposedClientId,
          reasons: s.reasons as unknown as string[],
          warnings: s.warnings as unknown as string[],
          engineVersion: s.engineVersion,
        },
        movement: {
          movementDate: movement.date,
          amount: Number(mvRow.amount),
          currency: mvRow.currency,
          description: mvRow.description,
          direction: mvRow.direction,
          status: mvRow.status,
          bankReference: mvRow.bank_reference,
          movementFingerprint: movementFpHash,
          payerFingerprint: payerFp.hash,
        },
        receipt: rc
          ? { receiptDate: rc.receipt_date, amount: Number(rc.amount), currencyCode: rc.currency_code }
          : null,
        client: cl ?? null,
      })
    );
  }

  return { scope, rows, total, capped };
}
