/**
 * FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — Repositorio de asignación MANUAL
 * de vendedor por documento de venta.
 *
 * Distinto de `sales-client-salesperson-repository.ts` (ejecutivo del cliente,
 * cartera). Este repositorio nunca infiere el vendedor del ejecutivo: si no
 * hay asignación manual, el documento queda "Sin vendedor identificado".
 *
 * Reusa la tabla existente `sales_document_salespersons` (FASE 9B) — una fila
 * por documento (upsert), sin historial propio. El historial de cambios se
 * registra best-effort en `sales_document_salesperson_audit` (append-only,
 * migración `20260722120000` CREADA, NO APLICADA): si la tabla de auditoría
 * todavía no existe, el registro se omite silenciosamente sin bloquear la
 * asignación real.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import { SALES_TABLE_MISSING_CODE } from "@/lib/sales/sales-salesperson-repository";

export type AssignDocumentSellerInput = {
  documentId: string;
  /** null = desasignar → "Sin vendedor identificado". */
  sellerId: string | null;
};

export type AssignDocumentSellerResult =
  | {
      ok: true;
      documentId: string;
      sellerId: string | null;
      sellerName: string | null;
      changed: boolean;
      /** ISO. null cuando sellerId es null (sin asignación vigente). */
      assignedAt: string | null;
    }
  | { ok: false; code: string; message: string };

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * Asigna, reasigna o desasigna (sellerId=null) el vendedor de un documento de
 * venta puntual. Nunca toca `sales_client_salespersons` (ejecutivo del
 * cliente), montos, ni el comprobante en Zeta.
 *
 * Validaciones: documento del workspace, documento NO es nota de crédito,
 * vendedor del workspace y activo (si se asigna uno). Idempotente: si el
 * vendedor solicitado ya es el actual, no escribe nada.
 */
export async function assignDocumentSeller(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string | null,
  input: AssignDocumentSellerInput
): Promise<AssignDocumentSellerResult> {
  const { data: doc, error: docError } = await supabase
    .from("proto_invoices")
    .select("id, zeta_metadata")
    .eq("id", input.documentId)
    .eq("workspace_company_id", workspaceId)
    .maybeSingle();

  if (docError) return { ok: false, code: "DB_ERROR", message: docError.message };
  if (!doc) {
    return { ok: false, code: "NOT_FOUND", message: "Comprobante no encontrado en este workspace." };
  }
  if (isCreditNoteFromMetadata((doc as { zeta_metadata?: unknown }).zeta_metadata)) {
    return {
      ok: false,
      code: "CREDIT_NOTE_NOT_ALLOWED",
      message: "Las notas de crédito no admiten asignación de vendedor.",
    };
  }

  let sellerName: string | null = null;
  if (input.sellerId) {
    const { data: seller, error: sellerError } = await supabase
      .from("sales_salespersons")
      .select("id, active, display_name")
      .eq("id", input.sellerId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (sellerError) return { ok: false, code: "DB_ERROR", message: sellerError.message };
    if (!seller) {
      return { ok: false, code: "NOT_FOUND", message: "Vendedor no encontrado en este workspace." };
    }
    if ((seller as { active?: boolean }).active === false) {
      return {
        ok: false,
        code: "INACTIVE_SELLER",
        message: "El vendedor está inactivo. Solo se puede asignar a vendedores activos.",
      };
    }
    sellerName = str((seller as { display_name?: unknown }).display_name).trim() || null;
  }

  const { data: current, error: currentError } = await supabase
    .from("sales_document_salespersons")
    .select("id, salesperson_id, assigned_at")
    .eq("workspace_id", workspaceId)
    .eq("document_id", input.documentId)
    .maybeSingle();

  if (currentError) {
    if ((currentError as { code?: string }).code === SALES_TABLE_MISSING_CODE) {
      return { ok: false, code: "MIGRATION_PENDING", message: "La tabla de asignación de vendedor no está disponible." };
    }
    return { ok: false, code: "DB_ERROR", message: currentError.message };
  }

  const previousSellerId = current ? str((current as { salesperson_id?: unknown }).salesperson_id).trim() || null : null;

  // Idempotencia: si ya es el vendedor pedido, no churnear ni auditar.
  if (previousSellerId === input.sellerId) {
    const currentAssignedAt = current ? str((current as { assigned_at?: unknown }).assigned_at).trim() || null : null;
    return {
      ok: true,
      documentId: input.documentId,
      sellerId: input.sellerId,
      sellerName,
      changed: false,
      assignedAt: currentAssignedAt,
    };
  }

  let assignedAt: string | null = null;
  if (input.sellerId === null) {
    if (current) {
      const { error: delError } = await supabase
        .from("sales_document_salespersons")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("document_id", input.documentId);
      if (delError) return { ok: false, code: "DB_ERROR", message: delError.message };
    }
  } else {
    assignedAt = new Date().toISOString();
    const { error: upsertError } = await supabase.from("sales_document_salespersons").upsert(
      {
        workspace_id: workspaceId,
        document_id: input.documentId,
        salesperson_id: input.sellerId,
        assigned_by: userId,
        assigned_at: assignedAt,
      },
      { onConflict: "workspace_id,document_id" }
    );
    if (upsertError) return { ok: false, code: "DB_ERROR", message: upsertError.message };
  }

  // Auditoría best-effort: no bloquea la asignación si la tabla aún no existe
  // (42P01) ni ante ningún otro error — la asignación real ya se confirmó
  // arriba. Supabase-js no lanza en errores de DB, así que se ignora vía el
  // campo `error` (no un try/catch, que no capturaría nada aquí).
  try {
    const { error: auditError } = await supabase.from("sales_document_salesperson_audit").insert({
      workspace_id: workspaceId,
      document_id: input.documentId,
      previous_seller_id: previousSellerId,
      new_seller_id: input.sellerId,
      changed_by: userId,
      changed_at: new Date().toISOString(),
    });
    void auditError; // best-effort: migración pendiente u otro error no bloquea.
  } catch {
    /* red u otro fallo inesperado: no bloquear la asignación real. */
  }

  return {
    ok: true,
    documentId: input.documentId,
    sellerId: input.sellerId,
    sellerName,
    changed: true,
    assignedAt,
  };
}
