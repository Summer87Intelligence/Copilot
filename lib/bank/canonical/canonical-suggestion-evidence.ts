/**
 * FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 — lectura de evidencia para la
 * bandeja de Conciliación diaria. SOLO LECTURA: nunca escribe
 * `bank_movement_reconciliation_links` / `payment_allocations` / `bank_movements`
 * ni llama `confirm_bank_reconciliation_v1` / `reverse_bank_reconciliation_v1`.
 * Ensambla, para cada sugerencia `suggestion_scope='operational'` ya persistida
 * por el motor D, la evidencia legible que pide el negocio (movimiento, cliente,
 * recibo, historial de pagador, razones/alertas en español, confianza humana).
 *
 * Límite conocido: `bank_reconciliation_suggestions` no persiste qué facturas
 * propuso el motor en el momento de generar la sugerencia (`proposedInvoiceAllocations`
 * vive solo en memoria, en `ShadowProposal`, antes del insert). Esta capa
 * recalcula "facturas abiertas candidatas" del cliente/moneda como mejor
 * evidencia disponible hoy — no es necesariamente la misma lista que vio el
 * motor al generar la sugerencia. Ver docs/architecture/bank-reconciliation-canonical-engine.md.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getBankMovementAuditDisplayDescription } from "@/lib/bank-movements/bank-movement-display";
import {
  getShadowMovementById,
  listOperationalSuggestions,
  listShadowClientPayerLinks,
  listShadowClients,
  listShadowInvoices,
  type BankMovementRow,
  type ClientPayerLinkRow,
  type PayerIdentityRow,
  type ProtoClientRow,
  type ProtoInvoiceRow,
} from "@/lib/bank/intelligence/server/repositories";
import type { ShadowSuggestionRow, ShadowSuggestionStatus } from "@/lib/bank/intelligence/server/types";
import {
  humanConfidenceFromRecommendedAction,
  humanConfidenceLabel,
  type HumanConfidenceLevel,
} from "@/lib/bank/canonical/reconciliation-confidence";
import { reasonLabel, warningLabel } from "@/lib/bank/canonical/reconciliation-reason-labels";

/** Se consulta directo (no vive en `repositories/index.ts`): identidades de pagador por id. */
async function listPayerIdentitiesByIds(
  supabase: SupabaseClient,
  workspaceId: string,
  ids: string[]
): Promise<PayerIdentityRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("bank_payer_identities")
    .select("id, workspace_id, account_hash, masked_account, normalized_name, fingerprint_strength, status")
    .eq("workspace_id", workspaceId)
    .in("id", ids.slice(0, 100));
  if (error) return [];
  return (data ?? []) as PayerIdentityRow[];
}

/** Se consulta directo (no vive en `repositories/index.ts`): un recibo puntual por id. */
async function getReceiptById(
  supabase: SupabaseClient,
  workspaceId: string,
  receiptId: string
): Promise<{ id: string; amount: number; currencyCode: string; receiptDate: string; status: string | null; companyId: string | null } | null> {
  const { data, error } = await supabase
    .from("proto_receipts")
    .select("id, workspace_company_id, company_id, amount, currency_code, receipt_date, status")
    .eq("workspace_company_id", workspaceId)
    .eq("id", receiptId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    amount: typeof data.amount === "number" ? data.amount : parseFloat(String(data.amount)) || 0,
    currencyCode: String(data.currency_code ?? ""),
    receiptDate: String(data.receipt_date ?? ""),
    status: data.status != null ? String(data.status) : null,
    companyId: data.company_id != null ? String(data.company_id) : null,
  };
}

export type CanonicalSuggestionCandidateInvoice = {
  invoiceId: string;
  balanceAmount: number;
  currencyCode: string;
  issueDate: string | null;
  dueDate: string | null;
};

/** Aplicación REAL persistida en `payment_allocations` — a diferencia de
 * `candidateInvoices` (facturas abiertas sugeridas, nunca confirmadas), esto
 * representa que un humano efectivamente aplicó el recibo a esta factura. */
export type CanonicalSuggestionAppliedAllocation = {
  invoiceId: string;
  invoiceNumber: string | null;
  appliedAmount: number;
  currencyCode: string;
};

/** Nivel de conciliación visible — ver contrato BANK-RECONCILIATION-TRIAD-ALIGNMENT-001. */
export type ReconciliationLevel = "reconciled_with_receipt" | "full_reconciliation";

/** Trae las aplicaciones reales (no candidatas) de un link ya confirmado. 100% lectura. */
async function getAppliedAllocationsForLink(
  supabase: SupabaseClient,
  workspaceId: string,
  linkId: string
): Promise<CanonicalSuggestionAppliedAllocation[]> {
  const { data, error } = await supabase
    .from("payment_allocations")
    .select("invoice_id, applied_amount, currency, proto_invoices(invoice_number)")
    .eq("workspace_id", workspaceId)
    .eq("reconciliation_link_id", linkId)
    .eq("status", "active");
  if (error || !data) return [];
  return data.map((row) => {
    const invoiceRel = (row as { proto_invoices?: { invoice_number: string | null } | { invoice_number: string | null }[] | null }).proto_invoices;
    const invoiceNumber = Array.isArray(invoiceRel) ? invoiceRel[0]?.invoice_number ?? null : invoiceRel?.invoice_number ?? null;
    return {
      invoiceId: String(row.invoice_id),
      invoiceNumber,
      appliedAmount: typeof row.applied_amount === "number" ? row.applied_amount : parseFloat(String(row.applied_amount)) || 0,
      currencyCode: String(row.currency ?? ""),
    };
  });
}

export type CanonicalSuggestionEvidence = {
  suggestionId: string;
  status: ShadowSuggestionStatus;
  confidenceScore: number;
  confidenceLevel: HumanConfidenceLevel;
  confidenceLabel: string;
  reasons: string[];
  warnings: string[];
  movement: {
    id: string;
    date: string;
    amount: number;
    currency: string;
    descriptionMasked: string;
    accountLabel: string | null;
  };
  payer: {
    identityId: string | null;
    maskedAccount: string | null;
    normalizedName: string | null;
    knownClientLinks: Array<{ clientId: string; confirmations: number; status: string }>;
    hasConflict: boolean;
  } | null;
  client: { id: string; name: string } | null;
  receipt: {
    id: string;
    amount: number;
    currency: string;
    date: string;
    status: string | null;
  } | null;
  candidateInvoices: CanonicalSuggestionCandidateInvoice[];
  /** Solo poblado cuando status==='confirmed': aplicaciones reales de `payment_allocations`. */
  appliedAllocations: CanonicalSuggestionAppliedAllocation[];
  /** Solo poblado cuando status==='confirmed' y hay receipt. */
  reconciliationLevel: ReconciliationLevel | null;
};

/**
 * Descripción útil para Historial/evidencia: misma fuente canónica que
 * Movimientos/Conciliación; solo enmascara corridas numéricas largas (cuentas).
 * El campo API sigue llamándose `descriptionMasked` por compatibilidad.
 */
function maskDescription(description: string | null, rawDescription?: string | null): string {
  return getBankMovementAuditDisplayDescription({
    raw_description: rawDescription ?? null,
    description,
  });
}

async function buildOneEvidence(
  supabase: SupabaseClient,
  workspaceId: string,
  suggestion: ShadowSuggestionRow,
  movement: BankMovementRow,
  clientsById: Map<string, ProtoClientRow>,
  payerIdentitiesById: Map<string, PayerIdentityRow>,
  clientPayerLinksByPayerId: Map<string, ClientPayerLinkRow[]>
): Promise<CanonicalSuggestionEvidence> {
  const level = humanConfidenceFromRecommendedAction(suggestion.recommendedAction, suggestion.confidence);

  const payerIdentity = suggestion.payerIdentityId ? payerIdentitiesById.get(suggestion.payerIdentityId) ?? null : null;
  const links = suggestion.payerIdentityId ? clientPayerLinksByPayerId.get(suggestion.payerIdentityId) ?? [] : [];
  const distinctClients = new Set(links.map((l) => l.client_company_id));

  const client = suggestion.proposedClientId ? clientsById.get(suggestion.proposedClientId) ?? null : null;

  const receipt = suggestion.proposedReceiptId
    ? await getReceiptById(supabase, workspaceId, suggestion.proposedReceiptId)
    : null;

  let candidateInvoices: CanonicalSuggestionCandidateInvoice[] = [];
  if (client && receipt) {
    const invoices = await listShadowInvoices(supabase, workspaceId, {
      currency: receipt.currencyCode,
      clientIds: [client.id],
      limit: 10,
    });
    candidateInvoices = invoices.map((inv: ProtoInvoiceRow) => ({
      invoiceId: inv.id,
      balanceAmount: typeof inv.balance_amount === "number" ? inv.balance_amount : parseFloat(String(inv.balance_amount ?? 0)) || 0,
      currencyCode: inv.currency_code,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
    }));
  }

  let appliedAllocations: CanonicalSuggestionAppliedAllocation[] = [];
  let reconciliationLevel: ReconciliationLevel | null = null;
  if (suggestion.status === "confirmed" && suggestion.confirmedLinkId) {
    appliedAllocations = await getAppliedAllocationsForLink(supabase, workspaceId, suggestion.confirmedLinkId);
    reconciliationLevel = appliedAllocations.length > 0 ? "full_reconciliation" : "reconciled_with_receipt";
  }

  return {
    suggestionId: suggestion.id,
    status: suggestion.status,
    confidenceScore: suggestion.confidence,
    confidenceLevel: level,
    confidenceLabel: humanConfidenceLabel(level),
    reasons: suggestion.reasons.map(reasonLabel),
    warnings: suggestion.warnings.map(warningLabel),
    movement: {
      id: movement.id,
      date: movement.movement_date,
      amount: typeof movement.amount === "number" ? movement.amount : parseFloat(String(movement.amount)) || 0,
      currency: movement.currency,
      descriptionMasked: maskDescription(movement.description, movement.raw_description),
      accountLabel: movement.account_label,
    },
    payer: payerIdentity
      ? {
          identityId: payerIdentity.id,
          maskedAccount: payerIdentity.masked_account,
          normalizedName: payerIdentity.normalized_name,
          knownClientLinks: links.map((l) => ({
            clientId: l.client_company_id,
            confirmations: l.reconciled_count,
            status: l.status,
          })),
          hasConflict: distinctClients.size > 1 || links.some((l) => l.status === "conflicted"),
        }
      : null,
    client: client ? { id: client.id, name: client.name ?? "Cliente" } : null,
    receipt: receipt
      ? { id: receipt.id, amount: receipt.amount, currency: receipt.currencyCode, date: receipt.receiptDate, status: receipt.status }
      : null,
    candidateInvoices,
    appliedAllocations,
    reconciliationLevel,
  };
}

export type ListCanonicalOperationalEvidenceResult = {
  items: CanonicalSuggestionEvidence[];
  total: number;
};

/**
 * Arma evidencia completa para un lote de sugerencias ya elegidas, reusando los
 * movimientos ya cargados por el llamador (evita re-consultarlos uno por uno).
 * Bloque compartido entre `listCanonicalOperationalEvidence` (bandeja histórica
 * paginada) y la bandeja unificada de Ingresos (FASE BANK-UNIFIED-INCOME-
 * RECONCILIATION-WORKSPACE-001), que ya trae los movimientos de su propia lista.
 * Nunca escribe nada — 100% lectura.
 */
export async function buildEvidenceForSuggestions(
  supabase: SupabaseClient,
  workspaceId: string,
  suggestions: ShadowSuggestionRow[],
  movementsById: Map<string, BankMovementRow>
): Promise<CanonicalSuggestionEvidence[]> {
  if (suggestions.length === 0) return [];

  const clientIds = [...new Set(suggestions.map((s) => s.proposedClientId).filter((v): v is string => v != null))];
  const clients = clientIds.length > 0 ? await listShadowClients(supabase, workspaceId, { limit: 3000 }) : [];
  const clientsById = new Map(clients.filter((c) => clientIds.includes(c.id)).map((c) => [c.id, c]));

  const payerIdentityIds = [...new Set(suggestions.map((s) => s.payerIdentityId).filter((v): v is string => v != null))];
  const clientPayerLinksByPayerId = new Map<string, ClientPayerLinkRow[]>();
  if (payerIdentityIds.length > 0) {
    const links = await listShadowClientPayerLinks(supabase, workspaceId, payerIdentityIds);
    for (const l of links) {
      const arr = clientPayerLinksByPayerId.get(l.payer_identity_id) ?? [];
      arr.push(l);
      clientPayerLinksByPayerId.set(l.payer_identity_id, arr);
    }
  }
  const payerIdentities = await listPayerIdentitiesByIds(supabase, workspaceId, payerIdentityIds);
  const payerIdentitiesById = new Map(payerIdentities.map((p) => [p.id, p]));

  const items: CanonicalSuggestionEvidence[] = [];
  for (const suggestion of suggestions) {
    const movement = movementsById.get(suggestion.bankMovementId);
    if (!movement) continue;
    items.push(
      await buildOneEvidence(
        supabase,
        workspaceId,
        suggestion,
        movement,
        clientsById,
        payerIdentitiesById,
        clientPayerLinksByPayerId
      )
    );
  }
  return items;
}

/**
 * Lee sugerencias `operational` activas (paginado simple por `limit`/`offset` en
 * memoria sobre el resultado ya acotado por workspace) y arma su evidencia
 * completa. Nunca escribe nada — 100% lectura.
 */
export async function listCanonicalOperationalEvidence(
  supabase: SupabaseClient,
  workspaceId: string,
  opts?: { limit?: number; offset?: number; statuses?: ShadowSuggestionStatus[]; movementIds?: string[] }
): Promise<ListCanonicalOperationalEvidenceResult> {
  const statuses = opts?.statuses ?? ["generated", "pending_review"];
  const all = await listOperationalSuggestions(supabase, workspaceId, { statuses, movementIds: opts?.movementIds });
  // Orden: mayor confianza primero (mejor evidencia primero, según pide el negocio).
  all.sort((a, b) => b.confidence - a.confidence);

  const offset = Math.max(0, opts?.offset ?? 0);
  const limit = Math.max(1, Math.min(opts?.limit ?? 20, 100));
  const page = all.slice(offset, offset + limit);
  if (page.length === 0) return { items: [], total: all.length };

  const movementIds = [...new Set(page.map((s) => s.bankMovementId))];
  const movementsById = new Map<string, BankMovementRow>();
  for (const id of movementIds) {
    const m = await getShadowMovementById(supabase, workspaceId, id);
    if (m) movementsById.set(id, m);
  }

  const items = await buildEvidenceForSuggestions(supabase, workspaceId, page, movementsById);
  return { items, total: all.length };
}
