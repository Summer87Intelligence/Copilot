/**
 * FASE 9B — Repositorio de comerciales (salespersons) y asignaciones por documento.
 * Server-side. Siempre filtra por workspace_id (defensa app-level + RLS).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const SALES_TABLE_MISSING_CODE = "42P01";

export type SalespersonRow = {
  id: string;
  displayName: string;
  appUserId: string | null;
  active: boolean;
  validFrom: string;
  validTo: string | null;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export async function loadSalespersons(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ salespersons: SalespersonRow[]; migrationPending: boolean }> {
  const { data, error } = await supabase
    .from("sales_salespersons")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("display_name", { ascending: true });

  if (error) {
    if ((error as { code?: string }).code === SALES_TABLE_MISSING_CODE) {
      return { salespersons: [], migrationPending: true };
    }
    throw new Error(error.message);
  }

  const salespersons = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: str(row.id),
      displayName: str(row.display_name),
      appUserId: row.app_user_id ? str(row.app_user_id) : null,
      active: row.active !== false,
      validFrom: str(row.valid_from).slice(0, 10),
      validTo: row.valid_to ? str(row.valid_to).slice(0, 10) : null,
    };
  });
  return { salespersons, migrationPending: false };
}

/** Mapa documentId → salespersonId (solo asignaciones con comercial no nulo). */
export async function loadDocumentAssignments(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await supabase
    .from("sales_document_salespersons")
    .select("document_id, salesperson_id")
    .eq("workspace_id", workspaceId);

  if (error) {
    if ((error as { code?: string }).code === SALES_TABLE_MISSING_CODE) return map;
    throw new Error(error.message);
  }
  for (const r of data ?? []) {
    const row = r as Record<string, unknown>;
    const docId = str(row.document_id).trim();
    const spId = row.salesperson_id ? str(row.salesperson_id).trim() : "";
    if (docId && spId) map.set(docId, spId);
  }
  return map;
}
