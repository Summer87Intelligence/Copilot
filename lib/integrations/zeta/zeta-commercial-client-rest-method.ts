/**
 * Método REST para **Datos comerciales de cliente** (SOAP hermano: `asoapclientev4`).
 *
 * El catálogo `docs/zeta/catalog/zeta-capabilities.json` deja `method_rest: null` para
 * `master_commercial_data_client`; la ayuda markdown detalla parámetros SOAP/Query pero
 * no el path REST exacto. Convención alineada a otros `REST*V4*` del producto.
 *
 * Si el nombre en tu tenant difiere, definí `ZETA_REST_COMMERCIAL_CLIENT_QUERY` sin tocar código.
 */
export const ZETA_COMMERCIAL_CLIENT_QUERY_DEFAULT = "RESTClienteV4Query";

export function resolveZetaCommercialClientRestMethod(): string {
  const v = process.env.ZETA_REST_COMMERCIAL_CLIENT_QUERY?.trim();
  return v && v.length > 0 ? v : ZETA_COMMERCIAL_CLIENT_QUERY_DEFAULT;
}
