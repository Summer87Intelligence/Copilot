/**
 * TEN-02: lecturas de `proto_documents` vía `GET /api/copilot/proto-documents` (tenant en sesión),
 * o con repositorio + `workspace_company_id` cuando el caller tiene Supabase server-side y UUID de tenant.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  DOCUMENT_RELATED_TABLE,
  getDocumentsByRelatedTable as getDocumentsByRelatedTableRepo,
  type ProtoDocument,
} from "@/lib/data/proto-documents-repository";

export { DOCUMENT_RELATED_TABLE };
export type { ProtoDocument };

type ProtoDocumentsApiPayload = { documents: ProtoDocument[] };

async function fetchProtoDocumentsApi(
  params: Record<string, string | undefined>
): Promise<ProtoDocument[]> {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    const v = val?.trim();
    if (v) qs.set(key, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await copilotApiFetch(`/api/copilot/proto-documents${suffix}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return [];
  }
  const body = json as { ok?: boolean; data?: ProtoDocumentsApiPayload };
  if (!res.ok || !body.ok || !body.data?.documents) return [];
  return body.data.documents;
}

export async function getDocumentsByRelation(
  relatedTable: string,
  relatedId: string
): Promise<ProtoDocument[]> {
  return fetchProtoDocumentsApi({
    related_table: relatedTable,
    related_id: relatedId,
  });
}

export async function getDocumentsByRelatedTable(
  relatedTable: string
): Promise<ProtoDocument[]> {
  return fetchProtoDocumentsApi({ related_table: relatedTable });
}

/**
 * Servidor con cliente Supabase del request: filtro explícito por `workspace_company_id`
 * (necesario si el cliente es service role sin RLS de `anon`).
 */
export async function getDocumentsByRelatedTableForClient(
  client: SupabaseClient,
  relatedTable: string,
  workspaceCompanyId: string
): Promise<ProtoDocument[]> {
  return getDocumentsByRelatedTableRepo(
    client,
    relatedTable,
    workspaceCompanyId
  );
}

export async function getDocumentsByType(documentType: string): Promise<ProtoDocument[]> {
  return fetchProtoDocumentsApi({ document_type: documentType });
}

export async function getProtoDocuments(): Promise<ProtoDocument[]> {
  return fetchProtoDocumentsApi({});
}

export async function getDocumentById(id: string): Promise<ProtoDocument | null> {
  const rows = await fetchProtoDocumentsApi({ id });
  return rows[0] ?? null;
}
