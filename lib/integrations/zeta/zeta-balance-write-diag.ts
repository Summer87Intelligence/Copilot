/**
 * Logs temporales de escritura de `balance_amount` en `proto_invoices`.
 * Activar globalmente: `ZETA_BALANCE_WRITE_DIAG=1`
 * Siempre loguea facturas/clientes en lista de vigilancia (validación post-fix vouchers).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isZetaLegacyShadowInvoiceNumber,
  isZetaSaldosMatchWatchInvoice,
  ZETA_SALDOS_MATCH_WATCH,
} from "@/lib/integrations/zeta/zeta-invoice-registro-metadata-merge";

export type ZetaBalanceWriteSource =
  | "vouchers"
  | "saldos"
  | "saldos_zero_pass"
  | "reconciliation";

export type ZetaBalanceWriteDiagPayload = {
  source: ZetaBalanceWriteSource;
  writer_process: string;
  invoice_id: string;
  invoice_number: string;
  balance_before: number | null;
  balance_after: number | null;
  balance_payload?: number | null;
  balance_payload_omitted?: boolean;
  status_before?: string | null;
  status_after?: string | null;
  zeta_registro_id?: string | null;
  /** true si el writer tocó invoice_number legacy ZETA:{id} en lugar de CCV1 */
  legacy_shadow_write?: boolean;
};

/** Placeholder del mapper de vouchers; no debe persistirse en `protoUpdateInvoice`. */
export const ZETA_VOUCHER_PLACEHOLDER_BALANCE_AMOUNT = 0;

const WATCH_INVOICE_NUMBERS = new Set([
  "ZETA:CCV1:0:2:A:2926",
  ZETA_SALDOS_MATCH_WATCH.canonicalCcv1,
  ZETA_SALDOS_MATCH_WATCH.legacyShadow,
]);

const WATCH_CLIENT_MARKERS = [
  "ACQUAGARDEN",
  "EL PAIS",
  "ELPAIS",
  "VILCABAMBA",
  "LANCER",
  "NIRMEX",
  "SIEMPRE CONVIENE",
  "PETROVIC",
  "TREXYS",
] as const;

function envDiagEnabled(): boolean {
  const v = (process.env.ZETA_BALANCE_WRITE_DIAG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function matchesWatchClientHint(hint: string | null | undefined): boolean {
  if (!hint?.trim()) return false;
  const u = hint.toUpperCase();
  return WATCH_CLIENT_MARKERS.some((m) => u.includes(m));
}

export function shouldLogZetaBalanceWrite(
  invoiceNumber: string,
  clientHint?: string | null
): boolean {
  if (envDiagEnabled()) return true;
  const inv = invoiceNumber.trim();
  if (WATCH_INVOICE_NUMBERS.has(inv)) return true;
  if (isZetaSaldosMatchWatchInvoice(inv)) return true;
  if (inv.includes(":A:2926") && matchesWatchClientHint("ACQUAGARDEN")) return true;
  return matchesWatchClientHint(clientHint);
}

export function logZetaBalanceWrite(payload: ZetaBalanceWriteDiagPayload): void {
  if (!shouldLogZetaBalanceWrite(payload.invoice_number)) return;
  const legacyShadow =
    payload.legacy_shadow_write ??
    (payload.source === "saldos" && isZetaLegacyShadowInvoiceNumber(payload.invoice_number));
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      kind: "zeta_balance_write_diag",
      ...payload,
      ...(legacyShadow ? { legacy_shadow_write: true, watch_pair: ZETA_SALDOS_MATCH_WATCH.canonicalCcv1 } : {}),
    })
  );
}

export async function readProtoInvoiceBalanceForDiag(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  invoiceId: string
): Promise<{
  balance_amount: number;
  status: string;
  invoice_number: string;
} | null> {
  const wid = workspaceCompanyId.trim();
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("balance_amount, status, invoice_number")
    .eq("id", invoiceId)
    .eq("workspace_company_id", wid)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    balance_amount?: unknown;
    status?: unknown;
    invoice_number?: unknown;
  };
  const balRaw = row.balance_amount;
  const bal =
    balRaw === null || balRaw === undefined
      ? 0
      : typeof balRaw === "number"
        ? balRaw
        : Number(String(balRaw).replace(",", "."));
  return {
    balance_amount: Number.isFinite(bal) ? bal : 0,
    status: String(row.status ?? ""),
    invoice_number: String(row.invoice_number ?? ""),
  };
}

function numFromUnknown(v: unknown, fallback: number): number {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function balanceFromProtoUpdateResult(
  data: Record<string, unknown> | undefined,
  fallback: number
): number {
  if (!data) return fallback;
  return numFromUnknown(data.balance_amount, fallback);
}

/** Log estructurado tras `protoUpdateInvoice` exitoso (saldos / zero-pass / reconciliation). */
export async function maybeLogZetaBalanceWriteAfterUpdate(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  invoiceId: string,
  invoiceNumber: string,
  opts: {
    source: ZetaBalanceWriteSource;
    writer_process: string;
    balance_payload: number;
    balance_payload_omitted?: boolean;
    beforeSnap?: { balance_amount: number; status: string; invoice_number: string } | null;
    up: { ok: boolean; data?: Record<string, unknown> };
    zeta_registro_id?: string | null;
  }
): Promise<void> {
  if (!opts.up.ok || !shouldLogZetaBalanceWrite(invoiceNumber)) return;
  if (!opts.beforeSnap) return;
  const before = opts.beforeSnap;
  const afterBal = balanceFromProtoUpdateResult(opts.up.data, before.balance_amount);
  logZetaBalanceWrite({
    source: opts.source,
    writer_process: opts.writer_process,
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    balance_before: before.balance_amount,
    balance_after: afterBal,
    balance_payload: opts.balance_payload_omitted ? null : opts.balance_payload,
    balance_payload_omitted: opts.balance_payload_omitted,
    status_before: before.status,
    status_after: String(opts.up.data?.status ?? before.status),
    zeta_registro_id: opts.zeta_registro_id ?? null,
    legacy_shadow_write:
      opts.writer_process.includes("legacy") ||
      isZetaLegacyShadowInvoiceNumber(invoiceNumber),
  });
}
