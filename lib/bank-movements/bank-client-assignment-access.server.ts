import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isBankMovementUiHidden } from "@/lib/bank-movements/bank-movement-visibility";

/** Valida todo el lote antes de escribir; IDs fuera de alcance son indistinguibles de inexistentes. */
export async function canAccessBankInflowAssignmentBatch(
  supabase: SupabaseClient,
  workspaceId: string,
  movementIds: string[],
  clientCompanyId: string
): Promise<boolean> {
  const ids = Array.from(new Set(movementIds));
  const [movements, client] = await Promise.all([
    supabase.from("bank_movements").select("id, metadata, excluded_from_operations")
      .eq("workspace_id", workspaceId).eq("direction", "inflow").in("id", ids),
    supabase.from("proto_companies").select("id")
      .eq("workspace_company_id", workspaceId).eq("id", clientCompanyId)
      .eq("is_active", true).maybeSingle(),
  ]);
  if (movements.error || client.error) throw new Error("No se pudo validar la asociación.");
  return Boolean(client.data) && ids.length > 0 && movements.data?.length === ids.length &&
    movements.data.every((m) => !isBankMovementUiHidden(m.metadata) &&
      m.excluded_from_operations !== true && m.metadata?.duplicate_status !== "duplicate_of_import");
}
