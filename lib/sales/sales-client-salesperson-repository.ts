/**
 * FASE 9D — Repositorio de asignación comercial por CLIENTE (historial temporal).
 * Schema-tolerant: si la tabla falta (42P01), degrada a vacío / migrationPending.
 *
 * Fuente canónica de atribución comercial desde 2026-07-01.
 * sales_document_salespersons es legado y no debe usarse para analytics.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { SALES_TABLE_MISSING_CODE } from "@/lib/sales/sales-salesperson-repository";
import { SALESPERSON_START_DATE } from "@/lib/sales/canonical/types";

export type ClientSalespersonAssignmentRow = {
  id: string;
  customerId: string;
  salespersonId: string;
  validFrom: string;
  validTo: string | null;
  assignedAt: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Todas las asignaciones del workspace (historial completo). */
export async function loadClientSalespersonAssignments(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ assignments: ClientSalespersonAssignmentRow[]; migrationPending: boolean }> {
  const { data, error } = await supabase
    .from("sales_client_salespersons")
    .select("id, customer_id, salesperson_id, valid_from, valid_to, assigned_at")
    .eq("workspace_id", workspaceId)
    .order("valid_from", { ascending: true });

  if (error) {
    if ((error as { code?: string }).code === SALES_TABLE_MISSING_CODE) {
      return { assignments: [], migrationPending: true };
    }
    throw new Error(error.message);
  }

  const assignments = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: str(row.id),
      customerId: str(row.customer_id),
      salespersonId: str(row.salesperson_id),
      validFrom: str(row.valid_from).slice(0, 10),
      validTo: row.valid_to ? str(row.valid_to).slice(0, 10) : null,
      assignedAt: str(row.assigned_at),
    };
  });
  return { assignments, migrationPending: false };
}

/**
 * Resuelve el comercial vigente para un cliente en una fecha.
 * Regla: valid_from <= date AND (valid_to IS NULL OR valid_to >= date).
 * Si hay varias, toma la de valid_from más reciente.
 */
export function resolveClientSalespersonOnDate(
  assignments: readonly ClientSalespersonAssignmentRow[],
  customerId: string | null,
  issueDate: string
): string | null {
  if (!customerId) return null;
  const d = issueDate.slice(0, 10);
  if (d < SALESPERSON_START_DATE) return null;

  let best: ClientSalespersonAssignmentRow | null = null;
  for (const a of assignments) {
    if (a.customerId !== customerId) continue;
    if (a.validFrom > d) continue;
    if (a.validTo && a.validTo < d) continue;
    if (!best || a.validFrom > best.validFrom) best = a;
  }
  return best?.salespersonId ?? null;
}

/** Comercial vigente "ahora" (valid_to IS NULL) por cliente. */
export function currentClientSalespersonMap(
  assignments: readonly ClientSalespersonAssignmentRow[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of assignments) {
    if (a.validTo != null) continue;
    map.set(a.customerId, a.salespersonId);
  }
  return map;
}

/** Cuenta clientes con asignación abierta por comercial. */
export function countAssignedCustomersBySalesperson(
  assignments: readonly ClientSalespersonAssignmentRow[]
): Map<string | null, number> {
  const map = new Map<string | null, number>();
  for (const a of assignments) {
    if (a.validTo != null) continue;
    map.set(a.salespersonId, (map.get(a.salespersonId) ?? 0) + 1);
  }
  return map;
}

export type ClientAssignmentUpsertInput = {
  customerId: string;
  salespersonId: string | null;
  validFrom: string;
};

/**
 * Cierra la asignación abierta (si existe) el día anterior a validFrom
 * e inserta una nueva si salespersonId no es null.
 */
export async function upsertClientSalespersonAssignment(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string | null,
  input: ClientAssignmentUpsertInput
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const validFrom = input.validFrom.slice(0, 10);
  if (validFrom < SALESPERSON_START_DATE) {
    return {
      ok: false,
      code: "OUT_OF_RANGE",
      message: `La asignación comercial por cliente arranca el ${SALESPERSON_START_DATE}.`,
    };
  }

  // Cerrar asignación abierta.
  const { data: openRows, error: openErr } = await supabase
    .from("sales_client_salespersons")
    .select("id, valid_from, salesperson_id")
    .eq("workspace_id", workspaceId)
    .eq("customer_id", input.customerId)
    .is("valid_to", null);

  if (openErr) {
    if ((openErr as { code?: string }).code === SALES_TABLE_MISSING_CODE) {
      return {
        ok: false,
        code: "MIGRATION_PENDING",
        message: "La tabla de asignación por cliente aún no está aplicada.",
      };
    }
    return { ok: false, code: "DB_ERROR", message: openErr.message };
  }

  // Idempotencia: si el comercial vigente ya es el pedido, no churnear historial.
  if (
    input.salespersonId &&
    (openRows ?? []).some((row) => str((row as { salesperson_id?: unknown }).salesperson_id) === input.salespersonId)
  ) {
    return { ok: true };
  }

  for (const row of openRows ?? []) {
    const r = row as { id: string; valid_from: string };
    const closeTo =
      validFrom <= str(r.valid_from).slice(0, 10)
        ? str(r.valid_from).slice(0, 10)
        : (() => {
            const dt = new Date(Date.parse(validFrom) - 86400000);
            const y = dt.getUTCFullYear();
            const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
            const d = String(dt.getUTCDate()).padStart(2, "0");
            return `${y}-${m}-${d}`;
          })();
    const { error: closeErr } = await supabase
      .from("sales_client_salespersons")
      .update({ valid_to: closeTo, updated_at: new Date().toISOString() })
      .eq("id", r.id)
      .eq("workspace_id", workspaceId);
    if (closeErr) return { ok: false, code: "DB_ERROR", message: closeErr.message };
  }

  if (!input.salespersonId) {
    return { ok: true };
  }

  const { error: insErr } = await supabase.from("sales_client_salespersons").insert({
    workspace_id: workspaceId,
    customer_id: input.customerId,
    salesperson_id: input.salespersonId,
    valid_from: validFrom,
    valid_to: null,
    assigned_by: userId,
    assigned_at: new Date().toISOString(),
  });

  if (insErr) return { ok: false, code: "DB_ERROR", message: insErr.message };
  return { ok: true };
}
