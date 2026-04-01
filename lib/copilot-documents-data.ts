import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";
import { supabase } from "@/lib/supabase-client";

/** Tablas lógicas recomendadas para `related_table` (convención Copilot). */
export const DOCUMENT_RELATED_TABLE = {
  taxObligation: "proto_tax_obligations",
  company: "proto_companies",
  action: "actions",
  invoice: "proto_invoices",
  receipt: "proto_receipts",
  /** Pagos operativos (tesorería), distintos de pagos fiscales. */
  payment: "proto_payments",
  taxPayment: "proto_tax_payments",
} as const;

export type ProtoDocument = {
  id: string;
  document_type: string;
  related_table: string;
  /** UUID de la fila relacionada. */
  related_id: string;
  file_name: string | null;
  file_url: string | null;
  mime_type: string | null;
  reference: string | null;
  issue_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const ROW_LIMIT = 200;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function nullableStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeDocument(row: Record<string, unknown>): ProtoDocument {
  const issue = row.issue_date;
  let issue_date: string | null = null;
  if (issue != null) {
    const s = String(issue);
    issue_date = s.length >= 10 ? s.slice(0, 10) : s;
  }
  const st = row.status;
  const status =
    st != null && String(st).trim() ? String(st).trim() : "active";

  return {
    id: str(row.id),
    document_type: str(row.document_type),
    related_table: str(row.related_table),
    related_id: str(row.related_id),
    file_name: nullableStr(row.file_name),
    file_url: nullableStr(row.file_url),
    mime_type: nullableStr(row.mime_type),
    reference: nullableStr(row.reference),
    issue_date,
    status,
    notes: nullableStr(row.notes),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
}

/** Si la tabla aún no existe o PostgREST no la expone, degradamos sin romper la UI. */
function isProtoDocumentsUnavailable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("proto_documents") ||
    (m.includes("relation") && m.includes("does not exist")) ||
    m.includes("schema cache")
  );
}

/**
 * Documentos vinculados a una fila concreta (`related_table` + `related_id` UUID).
 */
export async function getDocumentsByRelation(
  relatedTable: string,
  relatedId: string
): Promise<ProtoDocument[]> {
  if (!relatedTable.trim() || !relatedId.trim()) return [];

  const q = applyProtoActiveListFilter(
    supabase
      .from("proto_documents")
      .select("*")
      .eq("related_table", relatedTable)
      .eq("related_id", relatedId),
    "active"
  );
  const { data, error } = await q
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);

  if (error) {
    if (isProtoDocumentsUnavailable(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((r: Record<string, unknown>) => normalizeDocument(r));
}

/**
 * Todos los documentos vinculados a una tabla lógica (`related_table`), p. ej. obligaciones fiscales.
 * Útil para enriquecer alertas/agenda sin N consultas por fila.
 */
export async function getDocumentsByRelatedTable(
  relatedTable: string
): Promise<ProtoDocument[]> {
  if (!relatedTable.trim()) return [];

  const q = applyProtoActiveListFilter(
    supabase.from("proto_documents").select("*").eq("related_table", relatedTable),
    "active"
  );
  const { data, error } = await q
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);

  if (error) {
    if (isProtoDocumentsUnavailable(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((r: Record<string, unknown>) => normalizeDocument(r));
}

/**
 * Filtra por tipo documental.
 */
export async function getDocumentsByType(documentType: string): Promise<ProtoDocument[]> {
  if (!documentType.trim()) return [];

  const q = applyProtoActiveListFilter(
    supabase.from("proto_documents").select("*").eq("document_type", documentType),
    "active"
  );
  const { data, error } = await q.order("created_at", { ascending: false }).limit(ROW_LIMIT);

  if (error) {
    if (isProtoDocumentsUnavailable(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((r: Record<string, unknown>) => normalizeDocument(r));
}

/** Listado general de documentos activos (`is_active = true`). */
export async function getProtoDocuments(): Promise<ProtoDocument[]> {
  const q = applyProtoActiveListFilter(
    supabase.from("proto_documents").select("*"),
    "active"
  );
  const { data, error } = await q
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);

  if (error) {
    if (isProtoDocumentsUnavailable(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((r: Record<string, unknown>) => normalizeDocument(r));
}

/**
 * Una fila por id; `null` si no existe o la tabla no está disponible.
 */
export async function getDocumentById(id: string): Promise<ProtoDocument | null> {
  if (!id.trim()) return null;

  const { data, error } = await supabase
    .from("proto_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isProtoDocumentsUnavailable(error.message)) return null;
    throw new Error(error.message);
  }

  if (!data) return null;
  return normalizeDocument(data as Record<string, unknown>);
}
