/**
 * Resolver el `invoice_id` local de `proto_invoices` desde un `zeta_registro_id`
 * para enlazar cuotas (`proto_invoice_installments`) con su factura.
 *
 * Reusa los paths JSON ya conocidos por `zeta-proto-invoice-registro-match.ts`
 * (identidad explícita → voucher v1 → raw_payload histórico). Si la factura
 * todavía no fue sincronizada (caso normal en backfill — el cliente puede
 * tener cuotas para facturas que el cron de vouchers no ingestó aún), la
 * cuota queda HUÉRFANA (`invoice_id = null`) y se vuelve a resolver en cada
 * corrida del pipeline.
 *
 * Reglas:
 *   - PURO: solo lee Supabase, no escribe.
 *   - Idempotente: múltiples llamadas con el mismo `zeta_registro_id`
 *     devuelven el mismo `invoice_id` (o `null` si no hay match).
 *   - Defensivo contra paths que el binder de PostgREST no acepta — itera y
 *     loggea silenciosamente (mismo patrón que la función de saldos).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";
import { ZETA_REGISTRO_ID_METADATA_JSON_PATHS_FOR_FILTER } from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";

export type InstallmentLinkResolution = {
  invoice_id: string | null;
  matched_path: string | null;
};

/**
 * Resuelve `invoice_id` desde `zeta_registro_id` SIN filtrar por cliente.
 *
 * El cliente no es necesario para el match porque `RegistroId` es global por
 * tenant (Zeta lo emite único por comprobante). Filtrar por `company_id`
 * sería más restrictivo pero no aporta seguridad extra (la RLS ya garantiza
 * tenant).
 */
export async function findActiveProtoInvoiceIdByRegistroId(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  registroId: string | number,
  options?: { onFilterError?: (path: string, message: string) => void }
): Promise<InstallmentLinkResolution> {
  const rid = String(registroId).trim();
  if (!rid || rid === "0") return { invoice_id: null, matched_path: null };
  const wid = workspaceCompanyId.trim();
  if (!wid) return { invoice_id: null, matched_path: null };

  for (const path of ZETA_REGISTRO_ID_METADATA_JSON_PATHS_FOR_FILTER) {
    const q = applyProtoActiveListFilter(
      supabase
        .from("proto_invoices")
        .select("id")
        .eq("workspace_company_id", wid)
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
    if (row0 && typeof row0.id === "string") {
      return { invoice_id: row0.id, matched_path: path };
    }
  }
  return { invoice_id: null, matched_path: null };
}

/**
 * Resuelve `invoice_id` para un BATCH de `zeta_registro_id`. Más eficiente
 * que iterar uno por uno cuando se procesan muchas cuotas (un cliente con
 * 200 cuotas → 1 query agregada en vez de 200).
 *
 * Estrategia: por cada path soportado, hace UN `.in()` con todos los rid
 * pendientes, marca los que matchean y continúa con los restantes en el
 * siguiente path. Termina cuando se agotaron los registros o los paths.
 *
 * Devuelve un Map normalizado `registroId (string)` → `invoice_id | null`.
 */
export async function findActiveProtoInvoiceIdsByRegistroIds(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  registroIds: ReadonlyArray<string | number>,
  options?: { onFilterError?: (path: string, message: string) => void }
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const wid = workspaceCompanyId.trim();
  if (!wid) return out;

  const normalized = new Set<string>();
  for (const r of registroIds) {
    const s = String(r).trim();
    if (s && s !== "0") normalized.add(s);
  }
  for (const r of normalized) out.set(r, null);
  if (normalized.size === 0) return out;

  const pending = new Set<string>(normalized);

  for (const path of ZETA_REGISTRO_ID_METADATA_JSON_PATHS_FOR_FILTER) {
    if (pending.size === 0) break;
    const ridsArr = Array.from(pending);
    const q = applyProtoActiveListFilter(
      supabase
        .from("proto_invoices")
        .select(`id, ${path}`)
        .eq("workspace_company_id", wid)
        .like("invoice_number", "ZETA:CCV1:%")
        .filter(path, "in", `(${ridsArr.map((x) => `"${x}"`).join(",")})`)
        .limit(ridsArr.length),
      "active"
    );
    const { data, error } = await q;
    if (error) {
      options?.onFilterError?.(path, error.message);
      continue;
    }
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const invId = row?.id;
      // Para extraer el valor del path tenemos que walkear el JSON desde
      // el alias devuelto por PostgREST. PostgREST devuelve los aliases
      // anidados, así que probamos cada estructura común.
      const rawValue = extractValueFromJsonPathRow(row, path);
      const rid = rawValue != null ? String(rawValue).trim() : null;
      if (rid && pending.has(rid) && typeof invId === "string") {
        out.set(rid, invId);
        pending.delete(rid);
      }
    }
  }

  return out;
}

/**
 * Extrae el valor de un path JSON Postgres anidado (`zeta_metadata->...->>field`)
 * desde la fila devuelta por PostgREST. PostgREST devuelve el path como una
 * clave compuesta, anidado o "deep alias" según el formato.
 *
 * Ejemplos de entradas reales que vemos en runtime:
 *   - `{ id, zeta_metadata: { zeta_comprobante_identity_v1: { registro_id: "2527" } } }`
 *   - `{ id, "zeta_metadata->zeta_comprobante_identity_v1->>registro_id": "2527" }`
 */
function extractValueFromJsonPathRow(
  row: Record<string, unknown>,
  path: string
): unknown {
  // 1) Path literal
  if (Object.prototype.hasOwnProperty.call(row, path)) return row[path];

  // 2) Path normalizado a deep walk (camino sin operadores)
  //    e.g. zeta_metadata->zeta_comprobante_identity_v1->>registro_id
  //    -> ["zeta_metadata", "zeta_comprobante_identity_v1", "registro_id"]
  const parts = path
    .replace(/->>?/g, "|")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  let cur: unknown = row;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object" || Array.isArray(cur)) return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
