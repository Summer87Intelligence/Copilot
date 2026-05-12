/**
 * Lectura Query **Comprobantes** de recibos de pago a proveedores.
 *
 * Fuente canónica: `RESTRecibosPagosV1QueryComprobantes`.
 */
export const ZETA_VENDOR_PAYMENTS_QUERY_DEFAULT = "RESTRecibosPagosV1QueryComprobantes";

export const ZETA_VENDOR_PAYMENTS_ROOT_IN_DEFAULT = "QueryComprobantesIn";

export function resolveZetaVendorPaymentsRestMethod(): string {
  const v = process.env.ZETA_REST_VENDOR_PAYMENTS_METHOD?.trim();
  return v && v.length > 0 ? v : ZETA_VENDOR_PAYMENTS_QUERY_DEFAULT;
}

export function resolveZetaVendorPaymentsRootInKey(): string {
  const v = process.env.ZETA_REST_VENDOR_PAYMENTS_ROOT_IN?.trim();
  return v && v.length > 0 ? v : ZETA_VENDOR_PAYMENTS_ROOT_IN_DEFAULT;
}
