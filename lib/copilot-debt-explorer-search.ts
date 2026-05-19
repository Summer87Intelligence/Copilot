/**
 * Búsqueda del Explorador de deuda — mismo dataset que la tabla (`baseClients`).
 */

import type { ClientStaleness } from "@/lib/copilot-financial-reconciliation";
import { normalizeSearchText } from "@/lib/copilot-search-normalize";

/** Texto visible en la fila (fallback cuando no hay nombre en proto_companies). */
export function clientDebtExplorerDisplayName(client: ClientStaleness): string {
  return client.companyName ?? client.companyId;
}

/** Campos indexados: proto name, display, id, nombre Zeta en facturas. */
export function buildClientDebtExplorerHaystack(client: ClientStaleness): string {
  const displayName = clientDebtExplorerDisplayName(client);
  const parts = [
    client.companyName,
    displayName,
    client.companyId,
    client.zetaClientName,
  ];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const trimmed = typeof part === "string" ? part.trim() : "";
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique.join(" ");
}

export function clientMatchesDebtExplorerSearch(
  client: ClientStaleness,
  rawSearch: string
): boolean {
  const term = normalizeSearchText(rawSearch);
  if (!term) return true;
  const haystack = normalizeSearchText(buildClientDebtExplorerHaystack(client));
  return haystack.includes(term);
}
