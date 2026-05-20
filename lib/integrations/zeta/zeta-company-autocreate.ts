/**
 * Helpers canónicos para auto-crear proto_companies placeholder cuando
 * el pipeline de saldos (A-05) descubre un Codigo Zeta sin registro local.
 *
 * Contratos:
 *   - Idempotente: unique index (workspace_company_id, "Codigo") previene duplicados.
 *   - Multi-tenant safe: todas las operaciones filtran por workspace_company_id.
 *   - Fuente auditable: zeta_metadata.source distingue creaciones automáticas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZetaSaldoPendienteRow } from "@/lib/integrations/zeta/zeta-factura-cliente";

/**
 * Extrae pares (codigo, nombre) únicos con saldo > 0 que NO están en `knownCodigos`.
 * Función pura — sin efectos secundarios; usada para descubrir clientes nuevos
 * en la respuesta global de saldos (ClienteCodigo vacío).
 */
export function extractUnknownCodigosFromSaldosRows(
  rows: ZetaSaldoPendienteRow[],
  knownCodigos: Set<string>
): Array<{ codigo: string; nombre: string }> {
  const seen = new Map<string, string>(); // codigo → nombre
  for (const row of rows) {
    const codigo = String(row.ClienteCodigo ?? "").trim();
    if (!codigo || knownCodigos.has(codigo)) continue;
    const saldo = parseFloat(String(row.Saldo ?? "0").replace(",", "."));
    if (!(saldo > 0)) continue;
    if (!seen.has(codigo)) {
      const nombre =
        String(row.ClienteNombre ?? (row as Record<string, unknown>).ClienteRazonSocial ?? "").trim() ||
        `Cliente Zeta ${codigo}`;
      seen.set(codigo, nombre);
    }
  }
  return Array.from(seen.entries()).map(([codigo, nombre]) => ({ codigo, nombre }));
}

/**
 * Crea o recupera una proto_company placeholder para un Codigo Zeta desconocido.
 *
 * @param source - "zeta_saldos_autocreate" | "zeta_contacts_autocreate"
 * @returns id de la proto_company (nueva o existente), o null si hubo error no recuperable.
 *
 * Idempotencia: unique index (workspace_company_id, "Codigo") con WHERE btrim("Codigo") <> ''.
 * Race condition (23505): reintenta lookup para devolver el id ganador.
 */
export async function ensureProtoCompanyForZetaCodigo(
  supabase: SupabaseClient,
  workspaceId: string,
  codigo: string,
  nombre: string,
  source: "zeta_saldos_autocreate" | "zeta_contacts_autocreate"
): Promise<string | null> {
  // Lookup first — evita write innecesario en el hot path
  const { data: existing } = await supabase
    .from("proto_companies")
    .select("id")
    .eq("workspace_company_id", workspaceId)
    .eq("Codigo", codigo)
    .maybeSingle();
  const existingId =
    existing && typeof (existing as { id?: unknown }).id === "string"
      ? (existing as { id: string }).id
      : null;
  if (existingId) return existingId;

  const { data: inserted, error } = await supabase
    .from("proto_companies")
    .insert({
      workspace_company_id: workspaceId,
      name: nombre,
      Codigo: codigo,
      is_active: true,
      status: "active",
      risk_level: "medium",
      zeta_metadata: { source },
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Race condition: concurrent insert ganó — devolvemos su id
      const { data: retry } = await supabase
        .from("proto_companies")
        .select("id")
        .eq("workspace_company_id", workspaceId)
        .eq("Codigo", codigo)
        .maybeSingle();
      return retry && typeof (retry as { id?: unknown }).id === "string"
        ? (retry as { id: string }).id
        : null;
    }
    return null;
  }

  return inserted && typeof (inserted as { id?: unknown }).id === "string"
    ? (inserted as { id: string }).id
    : null;
}
