/**
 * Lectura Query **Comprobantes** de recibos de cobranza (`QueryComprobantes` sobre `asoapreciboscobranzav2`).
 *
 * Catálogo: `transactional_collection_receipts` — `method_rest` pendiente en `zeta-capabilities.json`.
 * Ayuda: `docs/zeta/markdown/0165-ayuda-apis-indice-de-apis-gestion-y-contabilidad-recibo-de-cobro-58a116e7.md`
 * (`QueryComprobantes`: Anio, Mes, Page obligatorios en la tabla de parámetros).
 *
 * Overrides:
 * - `ZETA_REST_COLLECTION_RECEIPTS_METHOD` — path REST (default acorde a convención `REST*V2*Query*`).
 * - `ZETA_REST_COLLECTION_RECEIPTS_ROOT_IN` — raíz del body JSON (default `QueryComprobantesIn`; si tu Postman usa `QueryIn`, cambiá solo el env).
 */
export const ZETA_COLLECTION_RECEIPTS_QUERY_DEFAULT = "RESTRecibosCobranzaV2QueryComprobantes";

export const ZETA_COLLECTION_RECEIPTS_ROOT_IN_DEFAULT = "QueryComprobantesIn";

export function resolveZetaCollectionReceiptsRestMethod(): string {
  const v = process.env.ZETA_REST_COLLECTION_RECEIPTS_METHOD?.trim();
  return v && v.length > 0 ? v : ZETA_COLLECTION_RECEIPTS_QUERY_DEFAULT;
}

export function resolveZetaCollectionReceiptsRootInKey(): string {
  const v = process.env.ZETA_REST_COLLECTION_RECEIPTS_ROOT_IN?.trim();
  return v && v.length > 0 ? v : ZETA_COLLECTION_RECEIPTS_ROOT_IN_DEFAULT;
}
