/**
 * Merge seguro de `RegistroId` en `proto_invoices.zeta_metadata` (sin tocar balance/status).
 */

import {
  buildZetaComprobanteIdentityV1,
  ZETA_METADATA_COMPROBANTE_IDENTITY_V1,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";

export const ZETA_SALDOS_MATCH_WATCH = {
  /** Factura canónica Cartera / Excel — El País A-2877 */
  canonicalCcv1: "ZETA:CCV1:0:36:A:2877",
  /** Fila legacy creada por saldos antes de CCV1 estable */
  legacyShadow: "ZETA:2574",
  registroId: "2574",
  clienteCodigo: "36",
} as const;

export type MergeRegistroMetadataOptions = {
  /** Trazabilidad del backfill operativo */
  backfill_source?: string;
  backfilled_at?: string;
};

function cloneMetadataRoot(zetaMetadata: unknown): Record<string, unknown> {
  if (zetaMetadata === null || zetaMetadata === undefined) return {};
  if (typeof zetaMetadata !== "object" || Array.isArray(zetaMetadata)) return {};
  return { ...(zetaMetadata as Record<string, unknown>) };
}

/**
 * Devuelve metadata nueva con `registro_id` en identity v1 y `zeta_registro_id` en voucher v1.
 * No modifica otros bloques (reconciliation, raw_payload, etc.).
 */
export function mergeRegistroIdIntoInvoiceZetaMetadata(
  zetaMetadata: unknown,
  registroId: string,
  options?: MergeRegistroMetadataOptions
): Record<string, unknown> {
  const rid = String(registroId ?? "").trim();
  if (!rid) {
    throw new Error("mergeRegistroIdIntoInvoiceZetaMetadata: registroId vacío");
  }

  const root = cloneMetadataRoot(zetaMetadata);
  const at = options?.backfilled_at ?? new Date().toISOString();

  root[ZETA_METADATA_COMPROBANTE_IDENTITY_V1] = buildZetaComprobanteIdentityV1(rid);

  const v1Raw = root.zeta_customer_voucher_v1;
  const v1: Record<string, unknown> =
    v1Raw !== null && v1Raw !== undefined && typeof v1Raw === "object" && !Array.isArray(v1Raw)
      ? { ...(v1Raw as Record<string, unknown>) }
      : { schema_version: 1 };

  v1.zeta_registro_id = rid;
  if (options?.backfill_source) {
    v1.registro_id_backfill = {
      source: options.backfill_source,
      at,
      registro_id: rid,
    };
  }
  root.zeta_customer_voucher_v1 = v1;

  return root;
}

export function isZetaSaldosMatchWatchInvoice(invoiceNumber: string): boolean {
  const n = invoiceNumber.trim();
  return (
    n === ZETA_SALDOS_MATCH_WATCH.canonicalCcv1 || n === ZETA_SALDOS_MATCH_WATCH.legacyShadow
  );
}

/** `ZETA:{registroId}` sin segmento CCV1 — ruta legacy del pipeline de saldos. */
export function isZetaLegacyShadowInvoiceNumber(invoiceNumber: string): boolean {
  const n = invoiceNumber.trim();
  if (!n.startsWith("ZETA:")) return false;
  if (n.startsWith("ZETA:CCV1:")) return false;
  return /^ZETA:\d+$/.test(n);
}
