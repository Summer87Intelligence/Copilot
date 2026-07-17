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
 * El RPC atómico no está disponible/utilizable en este entorno → degradar al
 * camino secuencial (service_role) probado. Cubre:
 *  - función ausente o firma vieja (42883 / PGRST202 / "could not find the function"),
 *  - `NO_WORKSPACE`: la app usa un cliente service_role sin Supabase-Auth, por lo que
 *    una RPC v1 que derivaba el workspace de la sesión no puede resolverlo. La v2 recibe
 *    p_workspace_id del servidor; mientras la v2 no esté aplicada, esto asegura fallback.
 */
function shouldFallbackToSequential(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42883" ||
    code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("does not exist") ||
    msg.includes("no_workspace")
  );
}

const RPC_ERROR_CODE_MAP: Record<string, { code: string; message: string }> = {
  NO_WORKSPACE: { code: "NO_WORKSPACE", message: "Sesión sin workspace válido." },
  OUT_OF_RANGE: {
    code: "OUT_OF_RANGE",
    message: `La asignación comercial por cliente arranca el ${SALESPERSON_START_DATE}.`,
  },
  CUSTOMER_NOT_FOUND: { code: "NOT_FOUND", message: "Cliente no encontrado en este workspace." },
  SALESPERSON_NOT_FOUND: { code: "NOT_FOUND", message: "Comercial no encontrado o inactivo en este workspace." },
};

function mapRpcError(error: { message?: string }): { ok: false; code: string; message: string } {
  const raw = (error.message ?? "").toUpperCase();
  for (const key of Object.keys(RPC_ERROR_CODE_MAP)) {
    if (raw.includes(key)) return { ok: false, ...RPC_ERROR_CODE_MAP[key]! };
  }
  return { ok: false, code: "DB_ERROR", message: "No se pudo actualizar el comercial." };
}

/**
 * Asigna/cambia/desasigna el comercial vigente de un cliente de forma ATÓMICA.
 *
 * Prefiere el RPC transaccional `copilot_assign_client_salesperson` (cierra la
 * vigente e inserta la nueva en UNA transacción; rollback total ante fallo). Si el
 * RPC aún no está aplicado (migración pendiente), degrada al camino secuencial
 * existente `upsertClientSalespersonAssignment` (NO atómico) para no romper la
 * funcionalidad. Una vez aplicada la migración, el flujo es atómico sin más cambios.
 */
export async function assignClientSalesperson(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string | null,
  input: ClientAssignmentUpsertInput
): Promise<{ ok: true; atomic: boolean } | { ok: false; code: string; message: string }> {
  const validFrom = input.validFrom.slice(0, 10);
  if (validFrom < SALESPERSON_START_DATE) {
    return {
      ok: false,
      code: "OUT_OF_RANGE",
      message: `La asignación comercial por cliente arranca el ${SALESPERSON_START_DATE}.`,
    };
  }

  // El workspace lo aporta el SERVIDOR (nunca el navegador): mismo patrón que el
  // resto de escrituras del app, que usan un cliente service_role sin Supabase-Auth.
  const { error } = await supabase.rpc("copilot_assign_client_salesperson", {
    p_workspace_id: workspaceId,
    p_customer_id: input.customerId,
    p_salesperson_id: input.salespersonId,
    p_valid_from: validFrom,
    p_assigned_by: userId,
  });

  if (!error) return { ok: true, atomic: true };

  if (shouldFallbackToSequential(error)) {
    // RPC atómica no disponible (v2 sin aplicar / v1 sin workspace) → secuencial (no atómico).
    const seq = await upsertClientSalespersonAssignment(supabase, workspaceId, userId, input);
    return seq.ok ? { ok: true, atomic: false } : seq;
  }

  return mapRpcError(error);
}

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
