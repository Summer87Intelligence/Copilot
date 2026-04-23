/**
 * Lectura Query — **Comprobantes por cliente** (SOAP hermano: `asoapcomprobantesclientev1`).
 *
 * Catálogo: `transactional_invoices_per_customer` (`docs/zeta/catalog/zeta-capabilities.json`, `method_rest: null`).
 * Ayuda local: `docs/zeta/markdown/0156-ayuda-apis-indice-de-apis-gestion-y-contabilidad-comprobantes-por-cliente-ee99ca82.md`.
 *
 * Overrides (sin redeploy):
 * - `ZETA_REST_CUSTOMER_VOUCHERS_QUERY` — path REST del método Query (default `RESTComprobantesClienteV1Query`).
 * - `ZETA_REST_CUSTOMER_VOUCHERS_ROOT_IN` — raíz del body JSON (default `ComprobantesClienteV1QueryIn` según WSDL; override si tu gateway difiere).
 */
export const ZETA_CUSTOMER_VOUCHERS_QUERY_DEFAULT = "RESTComprobantesClienteV1Query";

export const ZETA_CUSTOMER_VOUCHERS_ROOT_IN_DEFAULT = "ComprobantesClienteV1QueryIn";

export function resolveZetaCustomerVouchersRestMethod(): string {
  const v = process.env.ZETA_REST_CUSTOMER_VOUCHERS_QUERY?.trim();
  return v && v.length > 0 ? v : ZETA_CUSTOMER_VOUCHERS_QUERY_DEFAULT;
}

export function resolveZetaCustomerVouchersRootInKey(): string {
  const v = process.env.ZETA_REST_CUSTOMER_VOUCHERS_ROOT_IN?.trim();
  return v && v.length > 0 ? v : ZETA_CUSTOMER_VOUCHERS_ROOT_IN_DEFAULT;
}
