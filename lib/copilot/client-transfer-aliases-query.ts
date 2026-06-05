import type { SupabaseClient } from "@supabase/supabase-js";

/** Tamaño de batch para `.in(company_id, …)` en PostgREST. */
export const CLIENT_TRANSFER_ALIAS_COMPANY_BATCH_SIZE = 500;

/** Página al listar todos los aliases activos del workspace. */
export const CLIENT_TRANSFER_ALIAS_PAGE_SIZE = 1000;

/** Límite duro documentado; si se alcanza, el caller debe loguear/alertar. */
export const CLIENT_TRANSFER_ALIAS_MAX_ROWS = 20_000;

export type ClientTransferAliasRow = {
  company_id: string;
  label: string;
};

export function chunkCompanyIds(companyIds: readonly string[]): string[][] {
  if (companyIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < companyIds.length; i += CLIENT_TRANSFER_ALIAS_COMPANY_BATCH_SIZE) {
    chunks.push(companyIds.slice(i, i + CLIENT_TRANSFER_ALIAS_COMPANY_BATCH_SIZE));
  }
  return chunks;
}

export function mergeAliasRowsIntoMap(
  target: Map<string, string[]>,
  rows: readonly ClientTransferAliasRow[]
): void {
  for (const row of rows) {
    const companyId = String(row.company_id ?? "").trim();
    const label = String(row.label ?? "").trim();
    if (!companyId || !label) continue;
    if (!target.has(companyId)) target.set(companyId, []);
    target.get(companyId)!.push(label);
  }
}

export type FetchActiveTransferAliasesResult = {
  byCompany: Map<string, string[]>;
  truncated: boolean;
};

/**
 * Carga aliases activos del workspace.
 * - Sin `companyIds`: pagina todo el workspace (sin cap silencioso de 500 clientes).
 * - Con `companyIds`: batching en chunks de 500 IDs.
 */
export async function fetchActiveTransferAliasesByWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  companyIds?: readonly string[]
): Promise<FetchActiveTransferAliasesResult> {
  const byCompany = new Map<string, string[]>();
  let truncated = false;
  let totalRows = 0;

  const ingestPage = (rows: ClientTransferAliasRow[] | null) => {
    const page = rows ?? [];
    totalRows += page.length;
    mergeAliasRowsIntoMap(byCompany, page);
    if (totalRows >= CLIENT_TRANSFER_ALIAS_MAX_ROWS) truncated = true;
  };

  if (companyIds && companyIds.length > 0) {
    const uniqueIds = [...new Set(companyIds.map((id) => id.trim()).filter(Boolean))];
    for (const batch of chunkCompanyIds(uniqueIds)) {
      if (truncated) break;
      const { data, error } = await supabase
        .from("client_transfer_aliases")
        .select("company_id, label")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .in("company_id", batch)
        .order("created_at", { ascending: true })
        .limit(CLIENT_TRANSFER_ALIAS_MAX_ROWS - totalRows);

      if (error) break;
      ingestPage((data ?? []) as ClientTransferAliasRow[]);
    }
    return { byCompany, truncated };
  }

  let offset = 0;
  while (!truncated) {
    const { data, error } = await supabase
      .from("client_transfer_aliases")
      .select("company_id, label")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .range(offset, offset + CLIENT_TRANSFER_ALIAS_PAGE_SIZE - 1);

    if (error) break;

    const page = (data ?? []) as ClientTransferAliasRow[];
    if (page.length === 0) break;

    ingestPage(page);

    if (page.length < CLIENT_TRANSFER_ALIAS_PAGE_SIZE) break;
    offset += CLIENT_TRANSFER_ALIAS_PAGE_SIZE;
  }

  return { byCompany, truncated };
}
