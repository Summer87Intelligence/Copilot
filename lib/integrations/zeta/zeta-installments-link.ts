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
import {
  ZETA_REGISTRO_ID_METADATA_JSON_PATHS_FOR_FILTER,
  extractRegistroIdsFromInvoiceZetaMetadata,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";

export type InstallmentLinkResolution = {
  invoice_id: string | null;
  matched_path: string | null;
};

/**
 * Follows the `cleanup_audit` chain from a deactivated shadow invoice
 * (`ZETA:{registroId}`, `is_active=false`) to its canonical active CCV1.
 *
 * Used as a last-resort fallback when the standard metadata-path lookup
 * fails — typically because the migration `fix_zeta_invoice_shadow_duplicates`
 * deactivated the shadow but the cuotas-sync pipeline still uses the original
 * RegistroId to identify the comprobante.
 *
 * Security:
 *   - Always filters by `workspace_company_id` (multi-tenant guard).
 *   - maxHops=2: shadow → [inactive NOSER] → canonical CCV1.
 *   - Returns null if the chain is broken, the terminal record is inactive,
 *     or the terminal invoice_number does not start with `ZETA:CCV1:`.
 */
async function resolveDeactivatedShadowChainToCanonicalCcv1(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  registroId: string,
  maxHops = 2
): Promise<string | null> {
  const { data: shadow, error: shadowErr } = await supabase
    .from("proto_invoices")
    .select("id, zeta_metadata")
    .eq("workspace_company_id", workspaceCompanyId)
    .eq("invoice_number", `ZETA:${registroId}`)
    .eq("is_active", false)
    .limit(1)
    .maybeSingle();

  if (shadowErr || !shadow) return null;

  const shadowRow = shadow as { id: string; zeta_metadata: unknown };
  const meta = (shadowRow.zeta_metadata ?? {}) as Record<string, unknown>;
  const cleanup = (meta.cleanup_audit ?? {}) as Record<string, unknown>;

  if (cleanup.deactivated_reason !== "duplicate_shadow_matched_to_ccv1") return null;

  let targetId =
    typeof cleanup.matched_ccv1_invoice_id === "string"
      ? cleanup.matched_ccv1_invoice_id
      : null;
  if (!targetId) return null;

  for (let hop = 0; hop < maxHops; hop++) {
    const { data: target, error: targetErr } = await supabase
      .from("proto_invoices")
      .select("id, invoice_number, zeta_metadata, is_active")
      .eq("workspace_company_id", workspaceCompanyId)
      .eq("id", targetId)
      .limit(1)
      .maybeSingle();

    if (targetErr || !target) return null;

    const t = target as {
      id: string;
      invoice_number: string;
      zeta_metadata: unknown;
      is_active: boolean | null;
    };

    // Active CCV1 → canonical target found.
    if (t.is_active === true && t.invoice_number.startsWith("ZETA:CCV1:")) return t.id;

    // Inactive intermediate → follow chain.
    if (t.is_active !== true) {
      const tMeta = (t.zeta_metadata ?? {}) as Record<string, unknown>;
      const tCleanup = (tMeta.cleanup_audit ?? {}) as Record<string, unknown>;
      const nextId =
        typeof tCleanup.matched_ccv1_invoice_id === "string"
          ? tCleanup.matched_ccv1_invoice_id
          : null;
      if (!nextId) return null;
      targetId = nextId;
      continue;
    }

    return null; // active but not a CCV1 — invalid target.
  }

  return null; // maxHops exhausted without reaching a canonical CCV1.
}

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
  options?: {
    onFilterError?: (path: string, message: string) => void;
    /**
     * When provided, the Set is populated with invoice_ids resolved via the
     * shadow-chain fallback. The caller uses this to skip `due_date` updates
     * for those invoices (the cuota vencimiento may differ from the CCV1's
     * authoritative due_date).
     */
    shadowChainResolved?: Set<string>;
  }
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
    // PostgREST 12 flattens JSON path selects to the last segment as key
    // (e.g. "zeta_metadata->...->registro_id" returns { id, registro_id: "..." }).
    // Selecting the full zeta_metadata instead and extracting locally is reliable
    // across all PostgREST versions and response shapes.
    const q = applyProtoActiveListFilter(
      supabase
        .from("proto_invoices")
        .select("id, zeta_metadata")
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
      if (typeof invId !== "string") continue;
      const rids = extractRegistroIdsFromInvoiceZetaMetadata(row.zeta_metadata);
      for (const rid of rids) {
        if (pending.has(rid)) {
          out.set(rid, invId);
          pending.delete(rid);
        }
      }
    }
  }

  // Fallback: for rids still unresolved, walk the cleanup_audit chain from any
  // deactivated shadow invoice to its canonical CCV1.
  if (pending.size > 0) {
    for (const rid of Array.from(pending)) {
      const canonicalId = await resolveDeactivatedShadowChainToCanonicalCcv1(
        supabase,
        wid,
        rid
      );
      if (canonicalId) {
        out.set(rid, canonicalId);
        options?.shadowChainResolved?.add(canonicalId);
        pending.delete(rid);
      }
    }
  }

  return out;
}
