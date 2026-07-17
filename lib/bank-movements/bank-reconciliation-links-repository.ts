/**
 * FASE E — Repositorio server-side de conciliación bancaria N:M.
 *
 * Scope SIEMPRE por workspace (nunca acepta workspace_id del cliente). Valida
 * con el modelo de dominio puro ANTES de escribir (sobre-aplicación, moneda,
 * dirección). Schema-tolerant: si la migración no está aplicada (42P01) degrada
 * a `migrationPending` sin lanzar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deriveReconciliationStatus,
  validateReconciliationApplication,
  remainingToApply,
  type CanonicalReconciliationStatus,
  type ReconciliationConfidence,
  type ReconciliationLink,
  type ReconciliationMethod,
  type ReconciliationTargetType,
} from "@/lib/bank-movements/bank-reconciliation-links";

const TABLE = "bank_movement_reconciliation_links";
const TABLE_MISSING_CODE = "42P01";

function isTableMissing(error: { code?: string } | null): boolean {
  return error?.code === TABLE_MISSING_CODE;
}

function mapRow(row: Record<string, unknown>): ReconciliationLink {
  return {
    id: String(row.id),
    bankMovementId: String(row.bank_movement_id),
    targetType: String(row.target_type) as ReconciliationTargetType,
    targetId: row.target_id != null ? String(row.target_id) : null,
    appliedAmount: typeof row.applied_amount === "number" ? row.applied_amount : parseFloat(String(row.applied_amount)) || 0,
    currency: String(row.currency) === "USD" ? "USD" : "UYU",
    direction: String(row.direction) === "outflow" ? "outflow" : "inflow",
    method: String(row.method) as ReconciliationMethod,
    confidence: row.confidence != null ? (String(row.confidence) as ReconciliationConfidence) : null,
    archivedAt: row.archived_at != null ? String(row.archived_at) : null,
  };
}

export type MovementReconciliationView = {
  movementId: string;
  amount: number;
  currency: string | null;
  direction: "inflow" | "outflow";
  links: ReconciliationLink[];
  applied: number;
  remaining: number;
  status: CanonicalReconciliationStatus;
};

type MovementRow = {
  id: string;
  workspace_id: string;
  amount: number | string | null;
  currency: string | null;
  direction: string | null;
};

async function loadMovement(
  supabase: SupabaseClient,
  workspaceId: string,
  movementId: string
): Promise<MovementRow | null> {
  const { data, error } = await supabase
    .from("bank_movements")
    .select("id, workspace_id, amount, currency, direction")
    .eq("id", movementId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) return null;
  return data as MovementRow;
}

export async function listReconciliationLinksByMovement(
  supabase: SupabaseClient,
  workspaceId: string,
  movementId: string,
  options?: { includeArchived?: boolean }
): Promise<{ links: ReconciliationLink[]; migrationPending: boolean }> {
  let query = supabase
    .from(TABLE)
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("bank_movement_id", movementId)
    .order("created_at", { ascending: true });
  if (!options?.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) {
    if (isTableMissing(error)) return { links: [], migrationPending: true };
    throw new Error(error.message);
  }
  return { links: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)), migrationPending: false };
}

export async function getMovementReconciliationView(
  supabase: SupabaseClient,
  workspaceId: string,
  movementId: string
): Promise<
  | { ok: true; view: MovementReconciliationView; migrationPending: boolean }
  | { ok: false; code: "MOVEMENT_NOT_FOUND" }
> {
  const movement = await loadMovement(supabase, workspaceId, movementId);
  if (!movement) return { ok: false, code: "MOVEMENT_NOT_FOUND" };

  const { links, migrationPending } = await listReconciliationLinksByMovement(supabase, workspaceId, movementId);
  const amount = typeof movement.amount === "number" ? movement.amount : parseFloat(String(movement.amount)) || 0;
  const direction = movement.direction === "outflow" ? "outflow" : "inflow";
  return {
    ok: true,
    migrationPending,
    view: {
      movementId,
      amount,
      currency: movement.currency,
      direction,
      links,
      applied: Math.round((amount - remainingToApply(amount, links)) * 100) / 100,
      remaining: remainingToApply(amount, links),
      status: deriveReconciliationStatus(amount, links),
    },
  };
}

export type CreateReconciliationLinkInput = {
  movementId: string;
  targetType: ReconciliationTargetType;
  targetId: string | null;
  appliedAmount: number;
  /** Moneda/dirección del destino, para validar cruces. Por defecto = las del movimiento. */
  targetCurrency?: "UYU" | "USD";
  targetDirection?: "inflow" | "outflow";
  method?: ReconciliationMethod;
  confidence?: ReconciliationConfidence | null;
  note?: string | null;
};

export type CreateReconciliationLinkResult =
  | { ok: true; link: ReconciliationLink; view: MovementReconciliationView }
  | { ok: false; code: "MOVEMENT_NOT_FOUND" | "MIGRATION_PENDING" | "INVALID_AMOUNT" | "CROSS_CURRENCY" | "CROSS_DIRECTION" | "OVER_APPLIED" | "DUPLICATE" | "DB_ERROR"; message: string };

export async function createReconciliationLink(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string | null,
  input: CreateReconciliationLinkInput
): Promise<CreateReconciliationLinkResult> {
  const movement = await loadMovement(supabase, workspaceId, input.movementId);
  if (!movement) return { ok: false, code: "MOVEMENT_NOT_FOUND", message: "Movimiento no encontrado en este workspace." };

  const movementAmount = typeof movement.amount === "number" ? movement.amount : parseFloat(String(movement.amount)) || 0;
  const movementDirection = movement.direction === "outflow" ? "outflow" : "inflow";

  const { links, migrationPending } = await listReconciliationLinksByMovement(supabase, workspaceId, input.movementId);
  if (migrationPending) return { ok: false, code: "MIGRATION_PENDING", message: "La conciliación N:M aún no está habilitada." };

  // 'ignored' no aplica importe: se registra como marca (importe simbólico ignorado).
  const isIgnored = input.targetType === "ignored";
  if (!isIgnored) {
    const already = links
      .filter((l) => l.targetType !== "ignored")
      .reduce((s, l) => s + Math.max(0, l.appliedAmount), 0);
    const validation = validateReconciliationApplication({
      movementAmount,
      movementCurrency: movement.currency,
      movementDirection,
      alreadyApplied: already,
      newApplied: input.appliedAmount,
      targetCurrency: input.targetCurrency ?? String(movement.currency ?? ""),
      targetDirection: input.targetDirection,
    });
    if (!validation.ok) return { ok: false, code: validation.code, message: validation.message };
  }

  const insertPayload = {
    workspace_id: workspaceId,
    bank_movement_id: input.movementId,
    target_type: input.targetType,
    target_id: input.targetId,
    applied_amount: isIgnored ? Math.max(0.01, Math.abs(movementAmount)) : input.appliedAmount,
    currency: String(movement.currency ?? "").toUpperCase() === "USD" ? "USD" : "UYU",
    direction: movementDirection,
    method: input.method ?? "manual",
    confidence: input.confidence ?? null,
    note: input.note ?? null,
    created_by: userId,
  };

  const { data, error } = await supabase.from(TABLE).insert(insertPayload).select("*").single();
  if (error) {
    if (isTableMissing(error)) return { ok: false, code: "MIGRATION_PENDING", message: "La conciliación N:M aún no está habilitada." };
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, code: "DUPLICATE", message: "Esa relación ya existe para este movimiento." };
    }
    return { ok: false, code: "DB_ERROR", message: "No se pudo guardar la conciliación." };
  }

  const link = mapRow(data as Record<string, unknown>);
  const nextLinks = [...links, link];
  return {
    ok: true,
    link,
    view: {
      movementId: input.movementId,
      amount: movementAmount,
      currency: movement.currency,
      direction: movementDirection,
      links: nextLinks,
      applied: Math.round((movementAmount - remainingToApply(movementAmount, nextLinks)) * 100) / 100,
      remaining: remainingToApply(movementAmount, nextLinks),
      status: deriveReconciliationStatus(movementAmount, nextLinks),
    },
  };
}

export async function archiveReconciliationLink(
  supabase: SupabaseClient,
  workspaceId: string,
  linkId: string
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "MIGRATION_PENDING" | "DB_ERROR"; message: string }> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ archived_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    if (isTableMissing(error)) return { ok: false, code: "MIGRATION_PENDING", message: "La conciliación N:M aún no está habilitada." };
    return { ok: false, code: "DB_ERROR", message: "No se pudo deshacer la conciliación." };
  }
  if (!data) return { ok: false, code: "NOT_FOUND", message: "Conciliación no encontrada o ya deshecha." };
  return { ok: true };
}
