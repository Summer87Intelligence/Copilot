/**
 * Fallback final del pipeline de saldos: cuando fallaron las rutas
 *
 *   1) RegistroId en metadata,
 *   2) match por `invoice_number` CCV1,
 *   3) heurístico determinístico Serie/Número/Total/Fecha,
 *
 * intentamos un último match conservador por
 * (`company_id` + `currency_code` + `issue_date` + `total_amount` ± tolerancia).
 *
 * Motivación:
 *   Si Zeta no expone `RegistroId` en `RESTComprobantesClienteV1Query` (CFE
 *   internos PRESTIS / payloads parciales), el voucher v1 persiste con
 *   `zeta_registro_id = null`. Sin RegistroId, ni la ruta 1 ni la 3 (cuando
 *   el saldo response no trae Serie/Numero) matchean — y el pipeline crea
 *   una **sombra** `ZETA:{RegistroId}` que duplica la venta.
 *
 *   Este fallback evita esa duplicación cuando hay una única CCV1 activa
 *   compatible. Si hay ambigüedad (≥ 2 candidatos), retornamos `ambiguous`
 *   y dejamos que el pipeline cree la sombra (preserva contabilidad de
 *   saldos exacta y aísla casos extraños para auditoría).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";
import { invoiceZetaMetadataRegistroConsistentWithExpected } from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";

/** Tolerancia de `total_amount` (Zeta a veces redondea el saldo). */
export const FALLBACK_TOTAL_TOLERANCE = 0.20;

export type FallbackMatchOutcome =
  | { kind: "none" }
  | {
      kind: "applied";
      invoice_id: string;
      invoice_number: string;
      strategy: "company_total_issuedate";
    }
  | {
      kind: "ambiguous";
      candidates: Array<{ invoice_id: string; invoice_number: string; total_amount: number }>;
    };

export type FallbackSaldoInput = {
  companyId: string;
  currencyCode: string | null;
  issueYmd: string;
  totalAmount: number;
  /** RegistroId Zeta para validar consistencia metadata del candidato. */
  zetaRegistroId: string;
};

function toNumberLoose(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Busca facturas `ZETA:CCV1:*` activas del cliente con misma moneda + fecha
 * y total dentro de tolerancia. Si hay exactamente una compatible y no hay
 * contradicción de RegistroId en su metadata → `applied`.
 * Si hay 2+ candidatos → `ambiguous` (el caller crea la sombra, queda
 * auditoría manual).
 */
export async function findFallbackProtoInvoiceForSaldoRow(
  supabase: SupabaseClient,
  workspaceCompanyId: string,
  input: FallbackSaldoInput
): Promise<FallbackMatchOutcome> {
  const wid = workspaceCompanyId.trim();
  const company = (input.companyId ?? "").trim();
  const currency = (input.currencyCode ?? "").trim().toUpperCase();
  const issue = (input.issueYmd ?? "").slice(0, 10);
  if (!wid || !company || !currency || !/^\d{4}-\d{2}-\d{2}$/.test(issue)) {
    return { kind: "none" };
  }
  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) {
    return { kind: "none" };
  }

  const q = applyProtoActiveListFilter(
    supabase
      .from("proto_invoices")
      .select("id, invoice_number, total_amount, currency_code, issue_date, zeta_metadata")
      .eq("workspace_company_id", wid)
      .eq("company_id", company)
      .eq("currency_code", currency)
      .eq("issue_date", issue)
      .like("invoice_number", "ZETA:CCV1:%"),
    "active"
  );
  const { data, error } = await q;
  if (error) return { kind: "none" };

  const candidates: Array<{
    invoice_id: string;
    invoice_number: string;
    total_amount: number;
    zeta_metadata: unknown;
  }> = [];
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const id = typeof raw.id === "string" ? raw.id : null;
    const invNum = typeof raw.invoice_number === "string" ? raw.invoice_number : null;
    if (!id || !invNum) continue;
    const total = toNumberLoose(raw.total_amount);
    if (Math.abs(total - input.totalAmount) > FALLBACK_TOTAL_TOLERANCE) continue;
    // Reject if metadata contains a RegistroId different from the saldo's.
    if (!invoiceZetaMetadataRegistroConsistentWithExpected(raw.zeta_metadata, input.zetaRegistroId)) {
      continue;
    }
    candidates.push({
      invoice_id: id,
      invoice_number: invNum,
      total_amount: total,
      zeta_metadata: raw.zeta_metadata,
    });
  }

  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length > 1) {
    return {
      kind: "ambiguous",
      candidates: candidates.map((c) => ({
        invoice_id: c.invoice_id,
        invoice_number: c.invoice_number,
        total_amount: c.total_amount,
      })),
    };
  }
  const c = candidates[0]!;
  return {
    kind: "applied",
    invoice_id: c.invoice_id,
    invoice_number: c.invoice_number,
    strategy: "company_total_issuedate",
  };
}
