import type { SupabaseClient } from "@supabase/supabase-js";

import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";
import {
  COLLECTION_STATUSES,
  COLLECTION_ACTION_TYPES,
  COLLECTION_PRIORITIES,
  type CollectionAction,
  type CollectionActionInput,
  type CollectionActionPatch,
} from "@/lib/copilot-collection-types";

const TABLE = "collection_actions" as const;
const MSG_DB = "Error de base de datos. Intentá de nuevo.";

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function allowedValue<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T
): T {
  const v = value.trim().toLowerCase() as T;
  return (allowed as readonly string[]).includes(v) ? v : fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eqWorkspace(qb: any, workspaceCompanyId: string): any {
  return qb.eq("workspace_company_id", workspaceCompanyId);
}

function mapRow(row: Record<string, unknown>): CollectionAction {
  return {
    id: str(row.id),
    workspaceCompanyId: str(row.workspace_company_id),
    companyId: str(row.company_id),
    status: str(row.status) as CollectionAction["status"],
    actionType: str(row.action_type) as CollectionAction["actionType"],
    priority: str(row.priority) as CollectionAction["priority"],
    assignedTo: row.assigned_to != null ? str(row.assigned_to) || null : null,
    createdBy: row.created_by != null ? str(row.created_by) || null : null,
    dueDate: row.due_date != null ? str(row.due_date) : null,
    contactDate: row.contact_date != null ? str(row.contact_date) : null,
    nextActionDate: row.next_action_date != null ? str(row.next_action_date) : null,
    promiseDate: row.promise_date != null ? str(row.promise_date) : null,
    promiseAmount:
      typeof row.promise_amount === "number" ? row.promise_amount : null,
    promiseCurrency:
      row.promise_currency != null
        ? (str(row.promise_currency) as CollectionAction["promiseCurrency"])
        : null,
    notes: row.notes != null ? str(row.notes) || null : null,
    metadata:
      row.metadata != null && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    isActive: Boolean(row.is_active),
    archivedAt: row.archived_at != null ? str(row.archived_at) : null,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function validateInput(
  input: CollectionActionInput
): ProtoCrudResult<never> | null {
  if (!str(input.companyId)) {
    return protoCrudResult.fail("VALIDATION", "Falta el cliente (company_id).");
  }
  if (!input.actionType || !(COLLECTION_ACTION_TYPES as readonly string[]).includes(input.actionType)) {
    return protoCrudResult.fail("VALIDATION", "Tipo de acción inválido.");
  }
  if (
    input.promiseAmount !== undefined &&
    input.promiseAmount !== null &&
    (typeof input.promiseAmount !== "number" || input.promiseAmount <= 0)
  ) {
    return protoCrudResult.fail("VALIDATION", "El monto de promesa debe ser mayor a cero.");
  }
  if (
    input.promiseCurrency !== undefined &&
    input.promiseCurrency !== null &&
    !["UYU", "USD"].includes(input.promiseCurrency)
  ) {
    return protoCrudResult.fail("VALIDATION", "Moneda de promesa inválida (UYU o USD).");
  }
  return null;
}

// ---------------------------------------------------------------------------
// CRUD público
// ---------------------------------------------------------------------------

export async function collectionCreateAction(
  supabase: SupabaseClient,
  input: CollectionActionInput,
  workspaceCompanyId: string
): Promise<ProtoCrudResult<CollectionAction>> {
  const wid = str(workspaceCompanyId);
  if (!wid) return protoCrudResult.fail("VALIDATION", "Falta workspace.");

  const validationError = validateInput(input);
  if (validationError) return validationError;

  const row = {
    workspace_company_id: wid,
    company_id: str(input.companyId),
    status: allowedValue(
      str(input.status) || "pending_review",
      COLLECTION_STATUSES,
      "pending_review"
    ),
    action_type: input.actionType,
    priority: allowedValue(
      str(input.priority) || "medium",
      COLLECTION_PRIORITIES,
      "medium"
    ),
    assigned_to: input.assignedTo ?? null,
    created_by: input.createdBy ?? null,
    due_date: input.dueDate ?? null,
    contact_date: input.contactDate ?? null,
    next_action_date: input.nextActionDate ?? null,
    promise_date: input.promiseDate ?? null,
    promise_amount: input.promiseAmount ?? null,
    promise_currency: input.promiseCurrency ?? null,
    notes: input.notes ?? null,
    metadata: input.metadata ?? null,
    is_active: true,
    archived_at: null as string | null,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select("*")
    .single();

  if (error) {
    console.error(JSON.stringify({ source: "collection_service", kind: "create_error", error: error.message, workspace_id: wid }));
    return protoCrudResult.fail("DATABASE", MSG_DB);
  }

  return protoCrudResult.ok(
    mapRow(data as Record<string, unknown>),
    "Acción de cobranza registrada."
  );
}

export async function collectionUpdateAction(
  supabase: SupabaseClient,
  id: string,
  patch: CollectionActionPatch,
  workspaceCompanyId: string
): Promise<ProtoCrudResult<CollectionAction>> {
  const wid = str(workspaceCompanyId);
  if (!wid || !str(id)) {
    return protoCrudResult.fail("VALIDATION", "Faltan parámetros requeridos.");
  }

  const { data: existing, error: exErr } = await eqWorkspace(
    supabase.from(TABLE).select("*").eq("id", id),
    wid
  ).maybeSingle();

  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB);
  if (!existing) return protoCrudResult.fail("NOT_FOUND", "Acción no encontrada.");

  const ex = existing as Record<string, unknown>;

  if (
    patch.promiseAmount !== undefined &&
    patch.promiseAmount !== null &&
    (typeof patch.promiseAmount !== "number" || patch.promiseAmount <= 0)
  ) {
    return protoCrudResult.fail("VALIDATION", "El monto de promesa debe ser mayor a cero.");
  }

  const row: Record<string, unknown> = {
    ...(patch.status !== undefined && {
      status: allowedValue(str(patch.status), COLLECTION_STATUSES, str(ex.status) as CollectionAction["status"]),
    }),
    ...(patch.actionType !== undefined && { action_type: patch.actionType }),
    ...(patch.priority !== undefined && {
      priority: allowedValue(str(patch.priority), COLLECTION_PRIORITIES, str(ex.priority) as CollectionAction["priority"]),
    }),
    ...(patch.assignedTo !== undefined && { assigned_to: patch.assignedTo }),
    ...(patch.createdBy !== undefined && { created_by: patch.createdBy }),
    ...(patch.dueDate !== undefined && { due_date: patch.dueDate }),
    ...(patch.contactDate !== undefined && { contact_date: patch.contactDate }),
    ...(patch.nextActionDate !== undefined && { next_action_date: patch.nextActionDate }),
    ...(patch.promiseDate !== undefined && { promise_date: patch.promiseDate }),
    ...(patch.promiseAmount !== undefined && { promise_amount: patch.promiseAmount }),
    ...(patch.promiseCurrency !== undefined && { promise_currency: patch.promiseCurrency }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    ...(patch.metadata !== undefined && { metadata: patch.metadata }),
  };

  const { data, error } = await eqWorkspace(
    supabase.from(TABLE).update(row).eq("id", id).select("*"),
    wid
  ).single();

  if (error) {
    console.error(JSON.stringify({ source: "collection_service", kind: "update_error", error: error.message, id, workspace_id: wid }));
    return protoCrudResult.fail("DATABASE", MSG_DB);
  }

  return protoCrudResult.ok(
    mapRow(data as Record<string, unknown>),
    "Acción actualizada."
  );
}

export async function collectionArchiveAction(
  supabase: SupabaseClient,
  id: string,
  workspaceCompanyId: string
): Promise<ProtoCrudResult<{ id: string }>> {
  const wid = str(workspaceCompanyId);
  if (!wid || !str(id)) {
    return protoCrudResult.fail("VALIDATION", "Faltan parámetros requeridos.");
  }

  const { data: existing, error: exErr } = await eqWorkspace(
    supabase.from(TABLE).select("id").eq("id", id),
    wid
  ).maybeSingle();

  if (exErr) return protoCrudResult.fail("DATABASE", MSG_DB);
  if (!existing) return protoCrudResult.fail("NOT_FOUND", "Acción no encontrada.");

  const ts = new Date().toISOString();
  const { error } = await eqWorkspace(
    supabase.from(TABLE).update({ is_active: false, archived_at: ts, updated_at: ts }).eq("id", id),
    wid
  );

  if (error) return protoCrudResult.fail("DATABASE", MSG_DB);
  return protoCrudResult.ok({ id }, "Acción archivada.");
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function collectionGetByCompany(
  supabase: SupabaseClient,
  companyId: string,
  workspaceCompanyId: string,
  options: { includeArchived?: boolean } = {}
): Promise<CollectionAction[]> {
  const wid = str(workspaceCompanyId);
  let q = eqWorkspace(
    supabase
      .from(TABLE)
      .select("*")
      .eq("company_id", companyId),
    wid
  ).order("created_at", { ascending: false });

  if (!options.includeArchived) {
    q = q.eq("is_active", true);
  }

  const { data, error } = await q;
  if (error) {
    console.error(JSON.stringify({ source: "collection_service", kind: "query_error", error: error.message, company_id: companyId }));
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}

export async function collectionGetByCompanies(
  supabase: SupabaseClient,
  companyIds: readonly string[],
  workspaceCompanyId: string,
  options: { includeArchived?: boolean } = {}
): Promise<Map<string, CollectionAction[]>> {
  const wid = str(workspaceCompanyId);
  const ids = Array.from(
    new Set(companyIds.map((id) => str(id)).filter(Boolean))
  );
  const out = new Map<string, CollectionAction[]>();
  for (const id of ids) out.set(id, []);
  if (!wid || ids.length === 0) return out;

  let q = eqWorkspace(
    supabase
      .from(TABLE)
      .select("*")
      .in("company_id", ids),
    wid
  ).order("created_at", { ascending: false });

  if (!options.includeArchived) {
    q = q.eq("is_active", true);
  }

  const { data, error } = await q;
  if (error) {
    console.error(JSON.stringify({
      source: "collection_service",
      kind: "batch_query_error",
      error: error.message,
      workspace_id: wid,
      company_count: ids.length,
    }));
    return out;
  }

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const action = mapRow(row);
    const list = out.get(action.companyId) ?? [];
    list.push(action);
    out.set(action.companyId, list);
  }
  return out;
}

export async function collectionGetByWorkspace(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  options: {
    status?: CollectionAction["status"];
    priority?: CollectionAction["priority"];
    limit?: number;
    includeArchived?: boolean;
  } = {}
): Promise<CollectionAction[]> {
  const wid = str(workspaceCompanyId);
  let q = eqWorkspace(
    supabase.from(TABLE).select("*"),
    wid
  ).order("created_at", { ascending: false });

  if (!options.includeArchived) q = q.eq("is_active", true);
  if (options.status) q = q.eq("status", options.status);
  if (options.priority) q = q.eq("priority", options.priority);
  if (options.limit) q = q.limit(options.limit);

  const { data, error } = await q;
  if (error) {
    console.error(JSON.stringify({ source: "collection_service", kind: "query_error", error: error.message, workspace_id: wid }));
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}
