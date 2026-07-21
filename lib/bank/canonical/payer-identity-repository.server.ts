import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001 (adenda Cliente 360) —
 * lectura read-only de `client_payer_links` + `bank_payer_identities` para un
 * cliente puntual. No escribe nada. Ambas tablas ya existen en producción
 * (creadas en una fase anterior del motor canónico) y hoy están vacías: no
 * hay escritor todavía (ver payer-identity-learning.server.ts, preparado pero
 * no conectado a `confirm_bank_reconciliation_v1` esta fase).
 */

function requireWorkspace(workspaceId: string): string {
  const id = String(workspaceId ?? "").trim();
  if (!id) throw new Error("SHADOW_WORKSPACE_REQUIRED");
  return id;
}

export type ClientPayerHistoryRow = {
  linkId: string;
  payerIdentityId: string;
  clientCompanyId: string;
  linkStatus: string;
  confidence: number;
  confirmations: number;
  rejections: number;
  reconciledCount: number;
  totalByCurrency: Record<string, number>;
  linkFirstSeenAt: string | null;
  linkLastSeenAt: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  bankName: string | null;
  originalName: string | null;
  normalizedName: string | null;
  maskedAccount: string | null;
  fingerprintStrength: string;
  usualCurrency: string | null;
  identityStatus: string;
  identityFirstSeenAt: string | null;
  identityLastSeenAt: string | null;
  movementCount: number;
};

type ClientPayerLinkWithIdentityRow = {
  id: string;
  payer_identity_id: string;
  client_company_id: string;
  status: string;
  confidence: number;
  confirmations: number;
  rejections: number;
  reconciled_count: number;
  total_by_currency: Record<string, number> | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  bank_payer_identities: {
    bank_name: string | null;
    original_name: string | null;
    normalized_name: string | null;
    masked_account: string | null;
    fingerprint_strength: string;
    usual_currency: string | null;
    status: string;
    first_seen_at: string | null;
    last_seen_at: string | null;
    movement_count: number;
  } | null;
};

/**
 * Historial de identidades bancarias asociadas a un cliente ("Pagos y cuentas
 * utilizadas" en Cliente 360). Excluye vínculos `rejected` (nunca fueron una
 * relación real) pero SÍ incluye `inactive` (revocados) — la adenda pide
 * mostrarlos con estado "Revocada", no ocultarlos.
 */
export async function listClientPayerHistory(
  supabase: SupabaseClient,
  workspaceId: string,
  clientCompanyId: string
): Promise<ClientPayerHistoryRow[]> {
  const ws = requireWorkspace(workspaceId);
  const clientId = String(clientCompanyId ?? "").trim();
  if (!clientId) return [];

  const { data, error } = await supabase
    .from("client_payer_links")
    .select(
      "id, payer_identity_id, client_company_id, status, confidence, confirmations, rejections, reconciled_count, total_by_currency, first_seen_at, last_seen_at, confirmed_by, confirmed_at, bank_payer_identities(bank_name, original_name, normalized_name, masked_account, fingerprint_strength, usual_currency, status, first_seen_at, last_seen_at, movement_count)"
    )
    .eq("workspace_id", ws)
    .eq("client_company_id", clientId)
    .neq("status", "rejected")
    .order("last_seen_at", { ascending: false });

  if (error) throw new Error(`CLIENT_PAYER_HISTORY_READ_FAILED: ${error.message}`);

  const rows = (data ?? []) as unknown as ClientPayerLinkWithIdentityRow[];
  return rows.map((row) => ({
    linkId: row.id,
    payerIdentityId: row.payer_identity_id,
    clientCompanyId: row.client_company_id,
    linkStatus: row.status,
    confidence: row.confidence,
    confirmations: row.confirmations,
    rejections: row.rejections,
    reconciledCount: row.reconciled_count,
    totalByCurrency: row.total_by_currency ?? {},
    linkFirstSeenAt: row.first_seen_at,
    linkLastSeenAt: row.last_seen_at,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    bankName: row.bank_payer_identities?.bank_name ?? null,
    originalName: row.bank_payer_identities?.original_name ?? null,
    normalizedName: row.bank_payer_identities?.normalized_name ?? null,
    maskedAccount: row.bank_payer_identities?.masked_account ?? null,
    fingerprintStrength: row.bank_payer_identities?.fingerprint_strength ?? "none",
    usualCurrency: row.bank_payer_identities?.usual_currency ?? null,
    identityStatus: row.bank_payer_identities?.status ?? "detected",
    identityFirstSeenAt: row.bank_payer_identities?.first_seen_at ?? null,
    identityLastSeenAt: row.bank_payer_identities?.last_seen_at ?? null,
    movementCount: row.bank_payer_identities?.movement_count ?? 0,
  }));
}

/**
 * Para detectar "identidad compartida" (Sección 9): cuántos OTROS clientes,
 * además del actual, tienen un `client_payer_link` activo con la misma
 * identidad bancaria. Solo lectura — no decide nada, la UI usa esto para
 * mostrar la advertencia de revisión manual.
 */
export async function countOtherClientsForPayerIdentity(
  supabase: SupabaseClient,
  workspaceId: string,
  payerIdentityId: string,
  excludingClientCompanyId: string
): Promise<number> {
  const ws = requireWorkspace(workspaceId);
  const { data, error } = await supabase
    .from("client_payer_links")
    .select("client_company_id")
    .eq("workspace_id", ws)
    .eq("payer_identity_id", payerIdentityId)
    .neq("client_company_id", excludingClientCompanyId)
    .not("status", "in", '("rejected","inactive")');
  if (error) throw new Error(`PAYER_IDENTITY_CONFLICT_CHECK_FAILED: ${error.message}`);
  const distinctClients = new Set((data ?? []).map((r) => (r as { client_company_id: string }).client_company_id));
  return distinctClients.size;
}
