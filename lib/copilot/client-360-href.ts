/**
 * Ruta canónica a la Ficha 360 del cliente — único destino de detalle de
 * cliente en Copilot (ver CLIENTS-DIRECT-OPEN-CLIENT-360-001).
 */
export function clientFichaHref(companyId: string): string {
  return `/copilot/clientes/${encodeURIComponent(companyId)}`;
}
