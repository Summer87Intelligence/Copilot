/**
 * Identidad estable Zeta `RegistroId` ↔ `proto_invoices.zeta_metadata`
 * para cruzar comprobantes por cliente (`syncZetaCustomerVouchers`) con saldos pendientes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";

/** Bloque explícito escrito al sincronizar vouchers; prioridad 1 en saldos pendientes. */
export const ZETA_METADATA_COMPROBANTE_IDENTITY_V1 = "zeta_comprobante_identity_v1" as const;

export type ZetaComprobanteIdentityV1 = {
  schema_version: 1;
  /** Mismo `RegistroId` que `RESTFacturaClienteV4QuerySaldosPendientes` y la fila de comprobante cliente. */
  registro_id: string | null;
};

export function buildZetaComprobanteIdentityV1(registroId: string | null | undefined): ZetaComprobanteIdentityV1 {
  const s = registroId != null ? String(registroId).trim() : "";
  return { schema_version: 1, registro_id: s || null };
}

/**
 * Orden de búsqueda PostgREST: identidad explícita → voucher v1 → histórico en raw_payload.
 */
export const ZETA_REGISTRO_ID_METADATA_JSON_PATHS_FOR_FILTER = [
  `zeta_metadata->${ZETA_METADATA_COMPROBANTE_IDENTITY_V1}->>registro_id`,
  "zeta_metadata->zeta_customer_voucher_v1->>zeta_registro_id",
  "zeta_metadata->zeta_customer_voucher_v1->raw_payload->>RegistroId",
] as const;

export async function findActiveProtoInvoiceIdByZetaRegistroMetadata(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  protoCompanyId: string,
  registroId: string,
  options?: { onFilterError?: (path: string, message: string) => void }
): Promise<{ id: string; matched_path: string } | null> {
  const rid = registroId.trim();
  if (!rid) return null;
  const wid = workspaceCompanyId.trim();

  for (const path of ZETA_REGISTRO_ID_METADATA_JSON_PATHS_FOR_FILTER) {
    const q = applyProtoActiveListFilter(
      supabase
        .from("proto_invoices")
        .select("id")
        .eq("workspace_company_id", wid)
        .eq("company_id", protoCompanyId)
        .like("invoice_number", "ZETA:CCV1:%")
        .filter(path, "eq", rid)
        .limit(1),
      "active"
    );
    const { data, error } = await q;
    if (error) {
      options?.onFilterError?.(path, error.message);
      continue;
    }
    const row0 = data?.[0] as { id?: string } | undefined;
    if (row0 && typeof row0.id === "string") return { id: row0.id, matched_path: path };
  }
  return null;
}

/**
 * Extrae todos los `RegistroId` no vacíos conocidos en metadata (dedupe).
 */
export function extractRegistroIdsFromInvoiceZetaMetadata(zetaMetadata: unknown): string[] {
  const raw: string[] = [];
  if (zetaMetadata === null || zetaMetadata === undefined || typeof zetaMetadata !== "object" || Array.isArray(zetaMetadata)) {
    return raw;
  }
  const root = zetaMetadata as Record<string, unknown>;
  const idBlock = root[ZETA_METADATA_COMPROBANTE_IDENTITY_V1];
  if (idBlock !== null && idBlock !== undefined && typeof idBlock === "object" && !Array.isArray(idBlock)) {
    const r = (idBlock as Record<string, unknown>).registro_id;
    if (r != null && String(r).trim()) raw.push(String(r).trim());
  }
  const v1 = root.zeta_customer_voucher_v1;
  if (v1 !== null && v1 !== undefined && typeof v1 === "object" && !Array.isArray(v1)) {
    const rec = v1 as Record<string, unknown>;
    const zr = rec.zeta_registro_id;
    if (zr != null && String(zr).trim()) raw.push(String(zr).trim());
    const payload = rec.raw_payload;
    if (payload !== null && payload !== undefined && typeof payload === "object" && !Array.isArray(payload)) {
      const p = payload as Record<string, unknown>;
      const rr = p.RegistroId ?? p.registroId;
      if (rr != null && String(rr).trim()) raw.push(String(rr).trim());
    }
  }
  return [...new Set(raw)];
}

/**
 * `true` si no hay RegistroId persistido o todos los encontrados coinciden con el esperado.
 * `false` si hay al menos un RegistroId distinto (match CCV1 probablemente equivocado).
 */
export function invoiceZetaMetadataRegistroConsistentWithExpected(
  zetaMetadata: unknown,
  expectedRegistroId: string
): boolean {
  const exp = expectedRegistroId.trim();
  if (!exp) return true;
  const ids = extractRegistroIdsFromInvoiceZetaMetadata(zetaMetadata);
  if (ids.length === 0) return true;
  return ids.every((x) => x === exp);
}

export async function fetchProtoInvoiceZetaMetadata(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  invoiceId: string
): Promise<unknown> {
  const wid = workspaceCompanyId.trim();
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("zeta_metadata")
    .eq("id", invoiceId)
    .eq("workspace_company_id", wid)
    .maybeSingle();
  if (error) return null;
  const row = data as { zeta_metadata?: unknown } | null;
  return row?.zeta_metadata;
}
