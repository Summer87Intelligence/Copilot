/**
 * Persistencia idempotente de pagos Zeta → proto_payments.
 * Lookup app-level + unique index parcial (ZETA-09-02) como defensa en carrera.
 */

import { applyProtoActiveListFilter } from "@/lib/copilot-proto-active";
import { protoCreatePayment, protoUpdatePayment } from "@/lib/copilot-proto-crud-service";
import type { ProtoPaymentInput } from "@/lib/copilot-proto-crud-types";
import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";

export type PersistZetaVendorPaymentAction =
  | "inserted"
  | "updated"
  | "updated_after_unique_race";

export type PersistZetaVendorPaymentResult =
  | { ok: true; action: PersistZetaVendorPaymentAction }
  | { ok: false; reason: "create_failed" | "update_failed" | "race_recovery_failed" };

export async function findActiveZetaVendorPaymentIdByNumber(
  client: OperationalSupabase,
  workspaceCompanyId: string,
  paymentNumber: string
): Promise<string | null> {
  const q = applyProtoActiveListFilter(
    client
      .from("proto_payments")
      .select("id")
      .eq("workspace_company_id", workspaceCompanyId.trim())
      .eq("payment_number", paymentNumber),
    "active"
  );
  const { data, error } = await q.maybeSingle();
  if (error) return null;
  return data && typeof (data as { id?: unknown }).id === "string"
    ? (data as { id: string }).id
    : null;
}

/**
 * Inserta o actualiza un pago Zeta. Si dos workers compiten, el perdedor del
 * insert (23505) re-lee y actualiza en lugar de fallar el pipeline.
 */
export async function persistZetaVendorPaymentRow(
  supabase: OperationalSupabase,
  workspaceCompanyId: string,
  input: ProtoPaymentInput
): Promise<PersistZetaVendorPaymentResult> {
  const wid = workspaceCompanyId.trim();
  const paymentNumber = input.payment_number.trim();

  const existingId = await findActiveZetaVendorPaymentIdByNumber(
    supabase,
    wid,
    paymentNumber
  );
  if (existingId) {
    const up = await protoUpdatePayment(supabase, existingId, input, wid, {
      allowUnlinkedCompany: true,
    });
    return up.ok ? { ok: true, action: "updated" } : { ok: false, reason: "update_failed" };
  }

  const cr = await protoCreatePayment(supabase, input, wid, {
    allowUnlinkedCompany: true,
  });
  if (cr.ok) {
    return { ok: true, action: "inserted" };
  }

  const racedId = await findActiveZetaVendorPaymentIdByNumber(
    supabase,
    wid,
    paymentNumber
  );
  if (!racedId) {
    return { ok: false, reason: "create_failed" };
  }

  const up = await protoUpdatePayment(supabase, racedId, input, wid, {
    allowUnlinkedCompany: true,
  });
  return up.ok
    ? { ok: true, action: "updated_after_unique_race" }
    : { ok: false, reason: "race_recovery_failed" };
}
