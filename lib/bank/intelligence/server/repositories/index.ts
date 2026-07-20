/**
 * Repositorios shadow — lectura/escritura acotada. Workspace obligatorio.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertShadowWriteAllowed } from "@/lib/bank/intelligence/server/guards";
import type {
  ShadowProposal,
  ShadowSuggestionEventType,
  ShadowSuggestionRow,
  ShadowSuggestionStatus,
  SuggestionScope,
} from "@/lib/bank/intelligence/server/types";
import type {
  ReconciliationReason,
  ReconciliationWarning,
} from "@/lib/bank/intelligence/reconciliation-matching";

function requireWorkspace(workspaceId: string): string {
  const id = String(workspaceId ?? "").trim();
  if (!id) throw new Error("SHADOW_WORKSPACE_REQUIRED");
  return id;
}

// ── Row shapes (DB) ──────────────────────────────────────────────────────────

export type BankMovementRow = {
  id: string;
  workspace_id: string;
  bank_name: string | null;
  account_label: string | null;
  movement_date: string;
  description: string | null;
  raw_description: string | null;
  amount: number | string;
  currency: string;
  direction: string;
  bank_reference: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
};

export type ProtoReceiptRow = {
  id: string;
  workspace_company_id: string;
  company_id: string | null;
  amount: number | string;
  currency_code: string;
  receipt_date: string;
  status: string | null;
  is_active: boolean;
};

export type ProtoClientRow = {
  id: string;
  workspace_company_id: string;
  name: string | null;
  is_active: boolean;
};

export type ProtoInvoiceRow = {
  id: string;
  workspace_company_id: string;
  company_id: string | null;
  currency_code: string;
  balance_amount: number | string | null;
  issue_date: string | null;
  due_date: string | null;
  is_active: boolean;
};

export type PayerIdentityRow = {
  id: string;
  workspace_id: string;
  account_hash: string;
  masked_account: string | null;
  normalized_name: string | null;
  fingerprint_strength: string;
  status: string;
};

export type ClientPayerLinkRow = {
  id: string;
  workspace_id: string;
  payer_identity_id: string;
  client_company_id: string;
  confidence: number;
  status: string;
  reconciled_count: number;
  account_hash?: string | null;
};

export type ReconciliationLinkTargetRow = {
  target_id: string | null;
  target_type: string;
  archived_at: string | null;
};

// ── Movements (read-only) ────────────────────────────────────────────────────

export async function listShadowMovements(
  supabase: SupabaseClient,
  workspaceId: string,
  opts: { movementIds?: string[]; limit: number; pendingOnly?: boolean }
): Promise<BankMovementRow[]> {
  const ws = requireWorkspace(workspaceId);
  const limit = Math.max(1, Math.min(opts.limit, 25));

  let q = supabase
    .from("bank_movements")
    .select(
      "id, workspace_id, bank_name, account_label, movement_date, description, raw_description, amount, currency, direction, bank_reference, status, metadata"
    )
    .eq("workspace_id", ws)
    .order("movement_date", { ascending: false })
    .limit(limit);

  if (opts.movementIds && opts.movementIds.length > 0) {
    q = q.in("id", opts.movementIds.slice(0, limit));
  } else if (opts.pendingOnly !== false) {
    q = q.in("status", ["pending", "suggested", "needs_review"]);
  }

  const { data, error } = await q;
  if (error) throw new Error(`SHADOW_MOVEMENTS_READ_FAILED: ${error.message}`);
  return (data ?? []) as BankMovementRow[];
}

export async function getShadowMovementById(
  supabase: SupabaseClient,
  workspaceId: string,
  movementId: string
): Promise<BankMovementRow | null> {
  const ws = requireWorkspace(workspaceId);
  const { data, error } = await supabase
    .from("bank_movements")
    .select(
      "id, workspace_id, bank_name, account_label, movement_date, description, raw_description, amount, currency, direction, bank_reference, status, metadata"
    )
    .eq("workspace_id", ws)
    .eq("id", movementId)
    .maybeSingle();
  if (error) throw new Error(`SHADOW_MOVEMENT_READ_FAILED: ${error.message}`);
  return (data as BankMovementRow | null) ?? null;
}

// ── Receipts / clients / invoices (read-only) ────────────────────────────────

export async function listShadowReceipts(
  supabase: SupabaseClient,
  workspaceId: string,
  opts: { fromDate: string; toDate: string; currency: string; limit?: number }
): Promise<ProtoReceiptRow[]> {
  const ws = requireWorkspace(workspaceId);
  const { data, error } = await supabase
    .from("proto_receipts")
    .select(
      "id, workspace_company_id, company_id, amount, currency_code, receipt_date, status, is_active"
    )
    .eq("workspace_company_id", ws)
    .eq("is_active", true)
    .eq("currency_code", opts.currency)
    .gte("receipt_date", opts.fromDate)
    .lte("receipt_date", opts.toDate)
    .limit(opts.limit ?? 500);
  if (error) throw new Error(`SHADOW_RECEIPTS_READ_FAILED: ${error.message}`);
  return (data ?? []) as ProtoReceiptRow[];
}

export async function listShadowClients(
  supabase: SupabaseClient,
  workspaceId: string,
  opts?: { limit?: number }
): Promise<ProtoClientRow[]> {
  const ws = requireWorkspace(workspaceId);
  const { data, error } = await supabase
    .from("proto_companies")
    .select("id, workspace_company_id, name, is_active")
    .eq("workspace_company_id", ws)
    .eq("is_active", true)
    .limit(opts?.limit ?? 3000);
  if (error) throw new Error(`SHADOW_CLIENTS_READ_FAILED: ${error.message}`);
  return (data ?? []) as ProtoClientRow[];
}

export async function listShadowInvoices(
  supabase: SupabaseClient,
  workspaceId: string,
  opts: { currency: string; clientIds?: string[]; limit?: number }
): Promise<ProtoInvoiceRow[]> {
  const ws = requireWorkspace(workspaceId);
  let q = supabase
    .from("proto_invoices")
    .select(
      "id, workspace_company_id, company_id, currency_code, balance_amount, issue_date, due_date, is_active"
    )
    .eq("workspace_company_id", ws)
    .eq("is_active", true)
    .eq("currency_code", opts.currency)
    .gt("balance_amount", 0)
    .limit(opts.limit ?? 500);
  if (opts.clientIds && opts.clientIds.length > 0) {
    q = q.in("company_id", opts.clientIds.slice(0, 200));
  }
  const { data, error } = await q;
  if (error) throw new Error(`SHADOW_INVOICES_READ_FAILED: ${error.message}`);
  return (data ?? []) as ProtoInvoiceRow[];
}

// ── Payers (read-only) ───────────────────────────────────────────────────────

export async function listShadowPayerIdentitiesByHashes(
  supabase: SupabaseClient,
  workspaceId: string,
  hashes: string[]
): Promise<PayerIdentityRow[]> {
  const ws = requireWorkspace(workspaceId);
  if (hashes.length === 0) return [];
  const { data, error } = await supabase
    .from("bank_payer_identities")
    .select(
      "id, workspace_id, account_hash, masked_account, normalized_name, fingerprint_strength, status"
    )
    .eq("workspace_id", ws)
    .in("account_hash", hashes.slice(0, 100));
  if (error) throw new Error(`SHADOW_PAYERS_READ_FAILED: ${error.message}`);
  return (data ?? []) as PayerIdentityRow[];
}

export async function listShadowClientPayerLinks(
  supabase: SupabaseClient,
  workspaceId: string,
  payerIdentityIds: string[]
): Promise<ClientPayerLinkRow[]> {
  const ws = requireWorkspace(workspaceId);
  if (payerIdentityIds.length === 0) return [];
  const { data, error } = await supabase
    .from("client_payer_links")
    .select(
      "id, workspace_id, payer_identity_id, client_company_id, confidence, status, reconciled_count"
    )
    .eq("workspace_id", ws)
    .in("payer_identity_id", payerIdentityIds.slice(0, 100))
    .not("status", "in", '("rejected","inactive")');
  if (error) throw new Error(`SHADOW_PAYER_LINKS_READ_FAILED: ${error.message}`);
  return (data ?? []) as ClientPayerLinkRow[];
}

/** Recibos ya vinculados por links canónicos activos (solo lectura). */
export async function listReconciledReceiptIds(
  supabase: SupabaseClient,
  workspaceId: string,
  receiptIds: string[]
): Promise<Set<string>> {
  const ws = requireWorkspace(workspaceId);
  const out = new Set<string>();
  if (receiptIds.length === 0) return out;
  const { data, error } = await supabase
    .from("bank_movement_reconciliation_links")
    .select("target_id, target_type, archived_at")
    .eq("workspace_id", ws)
    .eq("target_type", "receipt")
    .in("target_id", receiptIds.slice(0, 500))
    .is("archived_at", null);
  if (error) {
    // Degrada si la tabla no está disponible: no marcar como conciliados.
    return out;
  }
  for (const row of (data ?? []) as ReconciliationLinkTargetRow[]) {
    if (row.target_id) out.add(row.target_id);
  }
  return out;
}

/** Movimientos con al menos un link canónico ACTIVO (solo lectura). */
export async function listMovementIdsWithActiveCanonicalLink(
  supabase: SupabaseClient,
  workspaceId: string,
  movementIds: string[]
): Promise<Set<string>> {
  const ws = requireWorkspace(workspaceId);
  const out = new Set<string>();
  if (movementIds.length === 0) return out;
  const { data, error } = await supabase
    .from("bank_movement_reconciliation_links")
    .select("bank_movement_id, archived_at")
    .eq("workspace_id", ws)
    .in("bank_movement_id", movementIds.slice(0, 500))
    .is("archived_at", null);
  if (error) {
    // Degrada seguro: si no se puede leer, NO se asume link (se decide por status).
    return out;
  }
  for (const row of (data ?? []) as Array<{ bank_movement_id: string | null }>) {
    if (row.bank_movement_id) out.add(row.bank_movement_id);
  }
  return out;
}

// ── Suggestions (read + shadow write) ────────────────────────────────────────

function mapSuggestionRow(raw: Record<string, unknown>): ShadowSuggestionRow {
  return {
    id: String(raw.id),
    workspaceId: String(raw.workspace_id),
    bankMovementId: String(raw.bank_movement_id),
    payerIdentityId: raw.payer_identity_id != null ? String(raw.payer_identity_id) : null,
    proposedClientId: raw.proposed_client_id != null ? String(raw.proposed_client_id) : null,
    proposedReceiptId: raw.proposed_receipt_id != null ? String(raw.proposed_receipt_id) : null,
    confidence: Number(raw.confidence) || 0,
    reasons: Array.isArray(raw.reasons) ? (raw.reasons as ReconciliationReason[]) : [],
    warnings: Array.isArray(raw.warnings) ? (raw.warnings as ReconciliationWarning[]) : [],
    recommendedAction: String(raw.recommended_action) as ShadowSuggestionRow["recommendedAction"],
    engineVersion: Number(raw.engine_version) || 1,
    status: String(raw.status) as ShadowSuggestionStatus,
    // Compat: filas anteriores a la migración de scope se leen como 'operational'.
    suggestionScope: (raw.suggestion_scope != null
      ? String(raw.suggestion_scope)
      : "operational") as ShadowSuggestionRow["suggestionScope"],
    confirmedLinkId: raw.confirmed_link_id != null ? String(raw.confirmed_link_id) : null,
    reviewedAt: raw.reviewed_at != null ? String(raw.reviewed_at) : null,
    reviewedBy: raw.reviewed_by != null ? String(raw.reviewed_by) : null,
    rejectedReason: raw.rejected_reason != null ? String(raw.rejected_reason) : null,
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
  };
}

export async function listActiveSuggestionsForMovements(
  supabase: SupabaseClient,
  workspaceId: string,
  movementIds: string[],
  engineVersion: number
): Promise<ShadowSuggestionRow[]> {
  const ws = requireWorkspace(workspaceId);
  if (movementIds.length === 0) return [];
  const { data, error } = await supabase
    .from("bank_reconciliation_suggestions")
    .select("*")
    .eq("workspace_id", ws)
    .eq("engine_version", engineVersion)
    .in("bank_movement_id", movementIds.slice(0, 100))
    .in("status", ["generated", "pending_review"]);
  if (error) throw new Error(`SHADOW_SUGGESTIONS_READ_FAILED: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapSuggestionRow);
}

/** Sugerencia puntual por id, acotada a workspace — usada por confirm/reject server-side. */
export async function getShadowSuggestionById(
  supabase: SupabaseClient,
  workspaceId: string,
  suggestionId: string
): Promise<ShadowSuggestionRow | null> {
  const ws = requireWorkspace(workspaceId);
  const { data, error } = await supabase
    .from("bank_reconciliation_suggestions")
    .select("*")
    .eq("workspace_id", ws)
    .eq("id", suggestionId)
    .maybeSingle();
  if (error) throw new Error(`SHADOW_SUGGESTION_READ_FAILED: ${error.message}`);
  return data ? mapSuggestionRow(data as Record<string, unknown>) : null;
}

export async function listSuggestionsForMovements(
  supabase: SupabaseClient,
  workspaceId: string,
  movementIds: string[],
  engineVersion: number
): Promise<ShadowSuggestionRow[]> {
  const ws = requireWorkspace(workspaceId);
  if (movementIds.length === 0) return [];
  const { data, error } = await supabase
    .from("bank_reconciliation_suggestions")
    .select("*")
    .eq("workspace_id", ws)
    .eq("engine_version", engineVersion)
    .in("bank_movement_id", movementIds.slice(0, 100));
  if (error) throw new Error(`SHADOW_SUGGESTIONS_READ_FAILED: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapSuggestionRow);
}

/**
 * Lista sugerencias por ÁMBITO explícito (aislamiento estructurado, sin JSON ni texto).
 * Base de `listOperationalSuggestions` / `listHistoricalReviewSuggestions`.
 */
export async function listSuggestionsByScope(
  supabase: SupabaseClient,
  workspaceId: string,
  scope: SuggestionScope,
  opts?: { statuses?: ShadowSuggestionStatus[]; movementIds?: string[]; engineVersion?: number }
): Promise<ShadowSuggestionRow[]> {
  const ws = requireWorkspace(workspaceId);
  let q = supabase
    .from("bank_reconciliation_suggestions")
    .select("*")
    .eq("workspace_id", ws)
    .eq("suggestion_scope", scope);
  if (opts?.engineVersion != null) q = q.eq("engine_version", opts.engineVersion);
  if (opts?.statuses && opts.statuses.length > 0) q = q.in("status", opts.statuses);
  if (opts?.movementIds && opts.movementIds.length > 0) {
    q = q.in("bank_movement_id", opts.movementIds.slice(0, 100));
  }
  const { data, error } = await q;
  if (error) throw new Error(`SHADOW_SUGGESTIONS_SCOPE_READ_FAILED: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapSuggestionRow);
}

/** Cuenta sugerencias por ÁMBITO (opcionalmente por estados). Filtro estructurado, sin JSON. */
export async function countSuggestionsByScope(
  supabase: SupabaseClient,
  workspaceId: string,
  scope: SuggestionScope,
  opts?: { statuses?: ShadowSuggestionStatus[] }
): Promise<number> {
  const ws = requireWorkspace(workspaceId);
  let q = supabase
    .from("bank_reconciliation_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ws)
    .eq("suggestion_scope", scope);
  if (opts?.statuses && opts.statuses.length > 0) q = q.in("status", opts.statuses);
  const { count, error } = await q;
  if (error) throw new Error(`SHADOW_SUGGESTIONS_COUNT_FAILED: ${error.message}`);
  return count ?? 0;
}

export async function countOperationalSuggestions(
  supabase: SupabaseClient,
  workspaceId: string,
  opts?: { statuses?: ShadowSuggestionStatus[] }
): Promise<number> {
  return countSuggestionsByScope(supabase, workspaceId, "operational", opts);
}

/**
 * Cuenta sugerencias `operational` confirmadas desde `sinceIso` (contador "Conciliados
 * hoy" de la bandeja diaria). Usa `reviewed_at`, que `confirm_bank_reconciliation_v1`
 * completa al confirmar. Nunca mezcla `historical_review` / `matched_audit`.
 */
export async function countOperationalConfirmedSince(
  supabase: SupabaseClient,
  workspaceId: string,
  sinceIso: string
): Promise<number> {
  const ws = requireWorkspace(workspaceId);
  const { count, error } = await supabase
    .from("bank_reconciliation_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ws)
    .eq("suggestion_scope", "operational")
    .eq("status", "confirmed")
    .gte("reviewed_at", sinceIso);
  if (error) throw new Error(`SHADOW_SUGGESTIONS_CONFIRMED_TODAY_COUNT_FAILED: ${error.message}`);
  return count ?? 0;
}

export async function countHistoricalSuggestions(
  supabase: SupabaseClient,
  workspaceId: string,
  opts?: { statuses?: ShadowSuggestionStatus[] }
): Promise<number> {
  return countSuggestionsByScope(supabase, workspaceId, "historical_review", opts);
}

/**
 * Sugerencias PENDIENTES: estado activo Y aún sin revisar (`reviewed_at IS NULL`),
 * en TODOS los ámbitos. Una histórica marcada revisada conserva `status='generated'`
 * pero deja de contar como pendiente (Modelo A). Opcionalmente filtra por ámbito.
 */
export async function countPendingSuggestions(
  supabase: SupabaseClient,
  workspaceId: string,
  opts?: { scope?: SuggestionScope }
): Promise<number> {
  const ws = requireWorkspace(workspaceId);
  let q = supabase
    .from("bank_reconciliation_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ws)
    .in("status", ["generated", "pending_review"])
    .is("reviewed_at", null);
  if (opts?.scope) q = q.eq("suggestion_scope", opts.scope);
  const { count, error } = await q;
  if (error) throw new Error(`SHADOW_SUGGESTIONS_PENDING_COUNT_FAILED: ${error.message}`);
  return count ?? 0;
}

/** Consulta operativa explícita: SOLO `suggestion_scope='operational'`. */
export async function listOperationalSuggestions(
  supabase: SupabaseClient,
  workspaceId: string,
  opts?: { statuses?: ShadowSuggestionStatus[]; movementIds?: string[]; engineVersion?: number }
): Promise<ShadowSuggestionRow[]> {
  return listSuggestionsByScope(supabase, workspaceId, "operational", opts);
}

/** Consulta histórica explícita: SOLO `suggestion_scope='historical_review'`. */
export async function listHistoricalReviewSuggestions(
  supabase: SupabaseClient,
  workspaceId: string,
  opts?: { statuses?: ShadowSuggestionStatus[]; movementIds?: string[]; engineVersion?: number }
): Promise<ShadowSuggestionRow[]> {
  return listSuggestionsByScope(supabase, workspaceId, "historical_review", opts);
}

export async function insertShadowSuggestion(
  supabase: SupabaseClient,
  proposal: ShadowProposal,
  status: "generated" | "pending_review" = "generated"
): Promise<ShadowSuggestionRow> {
  assertShadowWriteAllowed("bank_reconciliation_suggestions", "insert");
  const ws = requireWorkspace(proposal.workspaceId);
  const payload = {
    workspace_id: ws,
    bank_movement_id: proposal.bankMovementId,
    payer_identity_id: proposal.payerIdentityId,
    proposed_client_id: proposal.proposedClientId,
    proposed_receipt_id: proposal.proposedReceiptId,
    confidence: proposal.confidence,
    reasons: proposal.reasons,
    warnings: proposal.warnings,
    recommended_action: proposal.recommendedAction,
    engine_version: proposal.engineVersion,
    status,
    suggestion_scope: proposal.suggestionScope ?? "operational",
  };
  const { data, error } = await supabase
    .from("bank_reconciliation_suggestions")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`SHADOW_SUGGESTION_INSERT_FAILED: ${error?.message ?? "no data"}`);
  }
  return mapSuggestionRow(data as Record<string, unknown>);
}

export async function updateShadowSuggestion(
  supabase: SupabaseClient,
  workspaceId: string,
  suggestionId: string,
  proposal: ShadowProposal
): Promise<ShadowSuggestionRow> {
  assertShadowWriteAllowed("bank_reconciliation_suggestions", "update");
  const ws = requireWorkspace(workspaceId);
  const { data, error } = await supabase
    .from("bank_reconciliation_suggestions")
    .update({
      payer_identity_id: proposal.payerIdentityId,
      proposed_client_id: proposal.proposedClientId,
      proposed_receipt_id: proposal.proposedReceiptId,
      confidence: proposal.confidence,
      reasons: proposal.reasons,
      warnings: proposal.warnings,
      recommended_action: proposal.recommendedAction,
    })
    .eq("workspace_id", ws)
    .eq("id", suggestionId)
    .in("status", ["generated", "pending_review"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`SHADOW_SUGGESTION_UPDATE_FAILED: ${error.message}`);
  if (!data) {
    throw new Error("SHADOW_SUGGESTION_UPDATE_SKIPPED: not active or wrong workspace");
  }
  return mapSuggestionRow(data as Record<string, unknown>);
}

export async function supersedeShadowSuggestion(
  supabase: SupabaseClient,
  workspaceId: string,
  suggestionId: string
): Promise<void> {
  assertShadowWriteAllowed("bank_reconciliation_suggestions", "update");
  const ws = requireWorkspace(workspaceId);
  const { error } = await supabase
    .from("bank_reconciliation_suggestions")
    .update({ status: "superseded", confirmed_link_id: null })
    .eq("workspace_id", ws)
    .eq("id", suggestionId)
    .in("status", ["generated", "pending_review"]);
  if (error) throw new Error(`SHADOW_SUGGESTION_SUPERSEDE_FAILED: ${error.message}`);
}

export async function insertSuggestionEvent(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    eventType: ShadowSuggestionEventType;
    entityId: string;
    previousState?: string | null;
    newState?: string | null;
    reason?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  assertShadowWriteAllowed("reconciliation_events", "insert");
  const ws = requireWorkspace(input.workspaceId);
  const { error } = await supabase.from("reconciliation_events").insert({
    workspace_id: ws,
    event_type: input.eventType,
    entity_type: "suggestion",
    entity_id: input.entityId,
    previous_state: input.previousState ?? null,
    new_state: input.newState ?? null,
    reason: input.reason ?? null,
    actor_user_id: input.actorUserId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`SHADOW_EVENT_INSERT_FAILED: ${error.message}`);
}
