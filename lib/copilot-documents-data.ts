/**
 * TEN-02: lecturas de `proto_documents` viven en `lib/data/proto-documents-repository`.
 * Este módulo conserva la API previa (cliente Supabase anónimo de app).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase-client";
import {
  DOCUMENT_RELATED_TABLE,
  getDocumentById as getDocumentByIdRepo,
  getDocumentsByRelation as getDocumentsByRelationRepo,
  getDocumentsByRelatedTable as getDocumentsByRelatedTableRepo,
  getDocumentsByType as getDocumentsByTypeRepo,
  listActiveProtoDocuments,
  type ProtoDocument,
} from "@/lib/data/proto-documents-repository";

export { DOCUMENT_RELATED_TABLE };
export type { ProtoDocument };

export async function getDocumentsByRelation(
  relatedTable: string,
  relatedId: string
): Promise<ProtoDocument[]> {
  return getDocumentsByRelationRepo(supabase, relatedTable, relatedId);
}

export async function getDocumentsByRelatedTable(
  relatedTable: string
): Promise<ProtoDocument[]> {
  return getDocumentsByRelatedTableRepo(supabase, relatedTable);
}

/** Misma lectura con cliente Supabase del tenant (rutas API / briefing). */
export async function getDocumentsByRelatedTableForClient(
  client: SupabaseClient,
  relatedTable: string
): Promise<ProtoDocument[]> {
  return getDocumentsByRelatedTableRepo(client, relatedTable);
}

export async function getDocumentsByType(documentType: string): Promise<ProtoDocument[]> {
  return getDocumentsByTypeRepo(supabase, documentType);
}

/** Listado general de documentos activos (`is_active = true`). */
export async function getProtoDocuments(): Promise<ProtoDocument[]> {
  return listActiveProtoDocuments(supabase);
}

export async function getDocumentById(id: string): Promise<ProtoDocument | null> {
  return getDocumentByIdRepo(supabase, id);
}
