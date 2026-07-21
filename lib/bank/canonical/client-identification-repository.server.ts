import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * FASE BANK-HISTORICAL-PAYER-IDENTIFICATION-001 — repositorio de
 * `bank_movement_client_identifications` (migración local, NO aplicada).
 *
 * Identifica movimiento→cliente de forma independiente de la conciliación
 * financiera. NUNCA toca `bank_movement_reconciliation_links`,
 * `payment_allocations` ni `reconciliation_events` — eso es responsabilidad
 * exclusiva de `confirm_bank_reconciliation_v1`.
 */

export type ClientIdentificationStatus = "identified" | "shared_account" | "third_party" | "excluded" | "revoked";
export type IdentificationMode = "manual_single" | "manual_batch";

export type ClientIdentificationRow = {
  id: string;
  movementId: string;
  clientCompanyId: string;
  payerIdentityId: string | null;
  status: ClientIdentificationStatus;
  identificationMode: IdentificationMode;
  reason: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RawRow = {
  id: string;
  movement_id: string;
  client_company_id: string;
  payer_identity_id: string | null;
  status: string;
  identification_mode: string;
  reason: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: RawRow): ClientIdentificationRow {
  return {
    id: row.id,
    movementId: row.movement_id,
    clientCompanyId: row.client_company_id,
    payerIdentityId: row.payer_identity_id,
    status: row.status as ClientIdentificationStatus,
    identificationMode: row.identification_mode as IdentificationMode,
    reason: row.reason,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    revokedBy: row.revoked_by,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireWorkspace(workspaceId: string): string {
  const id = String(workspaceId ?? "").trim();
  if (!id) throw new Error("WORKSPACE_REQUIRED");
  return id;
}

const SELECT_COLUMNS =
  "id, movement_id, client_company_id, payer_identity_id, status, identification_mode, reason, confirmed_by, confirmed_at, revoked_by, revoked_at, created_at, updated_at";

/** Identificación ACTIVA de un movimiento puntual (status no excluded/revoked), si existe. */
export async function getActiveIdentificationForMovement(
  supabase: SupabaseClient,
  workspaceId: string,
  movementId: string
): Promise<ClientIdentificationRow | null> {
  const ws = requireWorkspace(workspaceId);
  const { data, error } = await supabase
    .from("bank_movement_client_identifications")
    .select(SELECT_COLUMNS)
    .eq("workspace_id", ws)
    .eq("movement_id", movementId)
    .not("status", "in", '("excluded","revoked")')
    .maybeSingle();
  if (error) throw new Error(`CLIENT_IDENTIFICATION_READ_FAILED: ${error.message}`);
  return data ? mapRow(data as RawRow) : null;
}

/** Identificaciones activas para un lote de movimientos (uso: vista de lote/auditoría). */
export async function listActiveIdentificationsForMovements(
  supabase: SupabaseClient,
  workspaceId: string,
  movementIds: string[]
): Promise<ClientIdentificationRow[]> {
  const ws = requireWorkspace(workspaceId);
  if (movementIds.length === 0) return [];
  const { data, error } = await supabase
    .from("bank_movement_client_identifications")
    .select(SELECT_COLUMNS)
    .eq("workspace_id", ws)
    .in("movement_id", movementIds)
    .not("status", "in", '("excluded","revoked")');
  if (error) throw new Error(`CLIENT_IDENTIFICATION_READ_FAILED: ${error.message}`);
  return (data ?? []).map((r) => mapRow(r as RawRow));
}

/** Historial completo (incluye excluded/revoked) de identificaciones de un cliente — para Cliente 360. */
export async function listIdentificationsForClient(
  supabase: SupabaseClient,
  workspaceId: string,
  clientCompanyId: string
): Promise<ClientIdentificationRow[]> {
  const ws = requireWorkspace(workspaceId);
  const { data, error } = await supabase
    .from("bank_movement_client_identifications")
    .select(SELECT_COLUMNS)
    .eq("workspace_id", ws)
    .eq("client_company_id", clientCompanyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`CLIENT_IDENTIFICATION_READ_FAILED: ${error.message}`);
  return (data ?? []).map((r) => mapRow(r as RawRow));
}

/** Eventos de identificación terminados más recientes de todo el workspace — para Historial. */
export async function listRecentIdentificationEvents(
  supabase: SupabaseClient,
  workspaceId: string,
  limit: number
): Promise<ClientIdentificationRow[]> {
  const ws = requireWorkspace(workspaceId);
  const { data, error } = await supabase
    .from("bank_movement_client_identifications")
    .select(SELECT_COLUMNS)
    .eq("workspace_id", ws)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`CLIENT_IDENTIFICATION_READ_FAILED: ${error.message}`);
  return (data ?? []).map((r) => mapRow(r as RawRow));
}

export type InsertIdentificationInput = {
  workspaceId: string;
  movementId: string;
  clientCompanyId: string;
  payerIdentityId: string | null;
  status: ClientIdentificationStatus;
  identificationMode: IdentificationMode;
  reason: string | null;
  confirmedBy: string;
};

/**
 * Crea una identificación movimiento→cliente. NO valida aquí unicidad activa
 * (el índice parcial `bmci_active_uidx` la garantiza en la base) — el llamador
 * debe capturar el error de conflicto y decidir (revocar la anterior primero,
 * o rechazar la operación).
 */
export async function insertIdentification(
  supabase: SupabaseClient,
  input: InsertIdentificationInput
): Promise<ClientIdentificationRow> {
  const ws = requireWorkspace(input.workspaceId);
  const { data, error } = await supabase
    .from("bank_movement_client_identifications")
    .insert({
      workspace_id: ws,
      movement_id: input.movementId,
      client_company_id: input.clientCompanyId,
      payer_identity_id: input.payerIdentityId,
      status: input.status,
      identification_mode: input.identificationMode,
      reason: input.reason,
      confirmed_by: input.confirmedBy,
      confirmed_at: new Date().toISOString(),
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`CLIENT_IDENTIFICATION_INSERT_FAILED: ${error?.message ?? "no data"}`);
  return mapRow(data as RawRow);
}

/**
 * Revoca una identificación existente (nunca la borra — queda como histórico
 * append-only, igual que el resto del sistema de aprendizaje de pagador).
 */
export async function revokeIdentification(
  supabase: SupabaseClient,
  workspaceId: string,
  identificationId: string,
  actorUserId: string
): Promise<void> {
  const ws = requireWorkspace(workspaceId);
  const { error } = await supabase
    .from("bank_movement_client_identifications")
    .update({ status: "revoked", revoked_by: actorUserId, revoked_at: new Date().toISOString() })
    .eq("workspace_id", ws)
    .eq("id", identificationId);
  if (error) throw new Error(`CLIENT_IDENTIFICATION_REVOKE_FAILED: ${error.message}`);
}
