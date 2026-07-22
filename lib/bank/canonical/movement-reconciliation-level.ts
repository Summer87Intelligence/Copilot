import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveIdentificationLevel } from "@/lib/bank/canonical/bank-payer-identification";
import type { MovementReconciliationLevel } from "@/lib/bank/canonical/movement-reconciliation-level-labels";

export type { MovementReconciliationLevel } from "@/lib/bank/canonical/movement-reconciliation-level-labels";
export { MOVEMENT_LEVEL_LABEL } from "@/lib/bank/canonical/movement-reconciliation-level-labels";

/**
 * FASE BANK-FULL-RECONCILIATION-UI-CORRECTION-001 — nivel real de
 * conciliación por movimiento, en lote (sin N+1), para pintar Banco →
 * Movimientos, Cliente 360 y el drawer. Reutiliza `deriveIdentificationLevel`
 * (ya existente); no crea un motor de estados paralelo.
 */

export type MovementLevelInput = { id: string; currency: string; amount: number };

export type MovementLevelDetail = {
  level: MovementReconciliationLevel;
  clientCompanyId: string | null;
  receiptId: string | null;
  reconciliationLinkId: string | null;
};

/**
 * Deriva el nivel real de conciliación para un lote de movimientos, en 4
 * consultas batch (identificaciones, links, allocations, recibos del
 * cliente) sin importar cuántos movimientos se pidan — nunca 1 query por fila.
 */
export async function batchDeriveMovementReconciliationLevels(
  supabase: SupabaseClient,
  workspaceId: string,
  movements: MovementLevelInput[]
): Promise<Map<string, MovementLevelDetail>> {
  const result = new Map<string, MovementLevelDetail>();
  if (movements.length === 0) return result;

  const movementIds = movements.map((m) => m.id);

  const [identRes, linkRes] = await Promise.all([
    supabase
      .from("bank_movement_client_identifications")
      .select("movement_id, client_company_id, status")
      .eq("workspace_id", workspaceId)
      .in("movement_id", movementIds)
      .not("status", "in", '("excluded","revoked")'),
    supabase
      .from("bank_movement_reconciliation_links")
      .select("id, bank_movement_id, target_type, target_id, currency")
      .eq("workspace_id", workspaceId)
      .in("bank_movement_id", movementIds)
      .is("archived_at", null),
  ]);
  if (identRes.error) throw new Error(`MOVEMENT_LEVEL_IDENTIFICATIONS_FAILED: ${identRes.error.message}`);
  if (linkRes.error) throw new Error(`MOVEMENT_LEVEL_LINKS_FAILED: ${linkRes.error.message}`);

  type IdentRow = { movement_id: string; client_company_id: string; status: string };
  type LinkRow = { id: string; bank_movement_id: string; target_type: string; target_id: string | null; currency: string };

  const identByMovement = new Map<string, IdentRow>();
  for (const r of (identRes.data ?? []) as IdentRow[]) identByMovement.set(r.movement_id, r);

  const linkByMovement = new Map<string, LinkRow>();
  for (const r of (linkRes.data ?? []) as LinkRow[]) {
    if (r.target_type === "receipt") linkByMovement.set(r.bank_movement_id, r);
  }

  const linkIds = [...linkByMovement.values()].map((l) => l.id);
  const movementIdsWithAllocations = new Set<string>();
  if (linkIds.length > 0) {
    const { data: allocRows, error: allocErr } = await supabase
      .from("payment_allocations")
      .select("reconciliation_link_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .in("reconciliation_link_id", linkIds)
      .limit(20000);
    if (allocErr) throw new Error(`MOVEMENT_LEVEL_ALLOCATIONS_FAILED: ${allocErr.message}`);
    const movementIdByLinkId = new Map([...linkByMovement.entries()].map(([movId, l]) => [l.id, movId]));
    for (const a of allocRows ?? []) {
      const movId = movementIdByLinkId.get(a.reconciliation_link_id as string);
      if (movId) movementIdsWithAllocations.add(movId);
    }
  }

  // Recibos compatibles: solo se necesitan para clientes identificados SIN link
  // financiero todavía, para distinguir "Cliente identificado" de "Falta recibo".
  const clientIdsNeedingReceiptCheck = [...identByMovement.entries()]
    .filter(([movId]) => !linkByMovement.has(movId))
    .map(([, r]) => r.client_company_id);
  const receiptsByClient = new Map<string, { amount: number; currency: string }[]>();
  if (clientIdsNeedingReceiptCheck.length > 0) {
    const { data: receiptRows, error: recErr } = await supabase
      .from("proto_receipts")
      .select("company_id, amount, currency_code, currency")
      .eq("workspace_company_id", workspaceId)
      .in("company_id", [...new Set(clientIdsNeedingReceiptCheck)])
      .limit(20000);
    if (recErr) throw new Error(`MOVEMENT_LEVEL_RECEIPTS_FAILED: ${recErr.message}`);
    for (const r of receiptRows ?? []) {
      const cid = r.company_id as string;
      const list = receiptsByClient.get(cid) ?? [];
      list.push({ amount: Number(r.amount), currency: (r.currency_code || r.currency) as string });
      receiptsByClient.set(cid, list);
    }
  }

  // Links reales creados por el flujo directo `confirm_bank_reconciliation_v1`
  // (anterior a `bank_movement_client_identifications`) no tienen fila de
  // identificación propia. Un link financiero real es evidencia suficiente de
  // que el cliente fue identificado (de otro modo no existiría el link), así
  // que resolvemos su cliente vía el recibo cuando falta la identificación.
  const linksMissingIdent = [...linkByMovement.entries()].filter(
    ([movId]) => !identByMovement.has(movId)
  );
  const receiptCompanyById = new Map<string, string>();
  const receiptIdsMissingIdent = [
    ...new Set(linksMissingIdent.map(([, l]) => l.target_id).filter((id): id is string => id != null)),
  ];
  if (receiptIdsMissingIdent.length > 0) {
    const { data: receiptOwnerRows, error: receiptOwnerErr } = await supabase
      .from("proto_receipts")
      .select("id, company_id")
      .in("id", receiptIdsMissingIdent);
    if (receiptOwnerErr) throw new Error(`MOVEMENT_LEVEL_RECEIPT_OWNERS_FAILED: ${receiptOwnerErr.message}`);
    for (const r of receiptOwnerRows ?? []) {
      receiptCompanyById.set(r.id as string, r.company_id as string);
    }
  }

  for (const m of movements) {
    const ident = identByMovement.get(m.id) ?? null;
    const link = linkByMovement.get(m.id) ?? null;
    const clientCompanyId =
      ident?.client_company_id ?? (link?.target_id ? receiptCompanyById.get(link.target_id) ?? null : null);

    if (ident && (ident.status === "third_party" || ident.status === "shared_account") && !link) {
      result.set(m.id, {
        level: ident.status,
        clientCompanyId,
        receiptId: null,
        reconciliationLinkId: null,
      });
      continue;
    }

    if (link && link.currency !== m.currency) {
      // Anomalía de datos: link financiero con moneda distinta al movimiento.
      result.set(m.id, {
        level: "requires_review",
        clientCompanyId,
        receiptId: link.target_id,
        reconciliationLinkId: link.id,
      });
      continue;
    }

    const hasCompatibleReceipt = clientCompanyId
      ? (receiptsByClient.get(clientCompanyId) ?? []).some(
          (r) => r.currency === m.currency && Math.abs(r.amount - m.amount) <= 0.01
        )
      : false;

    const level = deriveIdentificationLevel({
      clientConfirmed: ident !== null || link !== null,
      hasCompatibleReceipt,
      hasFinancialLink: link !== null,
      hasInvoiceAllocations: movementIdsWithAllocations.has(m.id),
    });

    result.set(m.id, {
      level,
      clientCompanyId,
      receiptId: link?.target_id ?? null,
      reconciliationLinkId: link?.id ?? null,
    });
  }

  return result;
}

export type ReconciledPaymentForClient = {
  movementId: string;
  movementDate: string;
  movementAmount: number;
  currency: string;
  receiptId: string;
  receiptAmount: number;
  level: "reconciled_with_receipt" | "full_reconciliation";
  appliedInvoices: Array<{ invoiceId: string; invoiceNumber: string | null; appliedAmount: number }>;
  totalApplied: number;
};

/**
 * Sección 6 (Cliente 360 · Pagos conciliados) — pagos REALES de un cliente
 * (movimiento con link financiero activo hacia un recibo suyo), con nivel real
 * y facturas realmente aplicadas. Nunca reutiliza `client_payer_links`
 * (aprendizaje de nombre de pagador): esa tabla no tiene movement_id y no
 * representa conciliación financiera — mezclarla violaría "nunca mostrar una
 * identificación simple dentro de pagos aplicados".
 */
export async function listReconciledPaymentsForClient(
  supabase: SupabaseClient,
  workspaceId: string,
  clientCompanyId: string
): Promise<ReconciledPaymentForClient[]> {
  const { data: receiptRows, error: recErr } = await supabase
    .from("proto_receipts")
    .select("id, amount, currency_code, currency")
    .eq("workspace_company_id", workspaceId)
    .eq("company_id", clientCompanyId)
    .limit(5000);
  if (recErr) throw new Error(`RECONCILED_PAYMENTS_RECEIPTS_FAILED: ${recErr.message}`);
  const receiptIds = (receiptRows ?? []).map((r) => r.id as string);
  if (receiptIds.length === 0) return [];

  const receiptById = new Map(
    (receiptRows ?? []).map((r) => [
      r.id as string,
      { amount: Number(r.amount), currency: (r.currency_code || r.currency) as string },
    ])
  );

  const { data: linkRows, error: linkErr } = await supabase
    .from("bank_movement_reconciliation_links")
    .select("id, bank_movement_id, target_id")
    .eq("workspace_id", workspaceId)
    .eq("target_type", "receipt")
    .in("target_id", receiptIds)
    .is("archived_at", null);
  if (linkErr) throw new Error(`RECONCILED_PAYMENTS_LINKS_FAILED: ${linkErr.message}`);
  const links = (linkRows ?? []) as Array<{ id: string; bank_movement_id: string; target_id: string }>;
  if (links.length === 0) return [];

  const movementIds = links.map((l) => l.bank_movement_id);
  const { data: movRows, error: movErr } = await supabase
    .from("bank_movements")
    .select("id, movement_date, amount, currency")
    .in("id", movementIds);
  if (movErr) throw new Error(`RECONCILED_PAYMENTS_MOVEMENTS_FAILED: ${movErr.message}`);
  const movementById = new Map(
    (movRows ?? []).map((m) => [m.id as string, m as { movement_date: string; amount: string | number; currency: string }])
  );

  const linkIds = links.map((l) => l.id);
  const { data: allocRows, error: allocErr } = await supabase
    .from("payment_allocations")
    .select("reconciliation_link_id, invoice_id, applied_amount, proto_invoices(invoice_number)")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .in("reconciliation_link_id", linkIds);
  if (allocErr) throw new Error(`RECONCILED_PAYMENTS_ALLOCATIONS_FAILED: ${allocErr.message}`);
  const allocationsByLinkId = new Map<string, Array<{ invoiceId: string; invoiceNumber: string | null; appliedAmount: number }>>();
  for (const row of allocRows ?? []) {
    const invoiceRel = (row as { proto_invoices?: { invoice_number: string | null } | { invoice_number: string | null }[] | null }).proto_invoices;
    const invoiceNumber = Array.isArray(invoiceRel) ? invoiceRel[0]?.invoice_number ?? null : invoiceRel?.invoice_number ?? null;
    const list = allocationsByLinkId.get(row.reconciliation_link_id as string) ?? [];
    list.push({
      invoiceId: String(row.invoice_id),
      invoiceNumber,
      appliedAmount: typeof row.applied_amount === "number" ? row.applied_amount : parseFloat(String(row.applied_amount)) || 0,
    });
    allocationsByLinkId.set(row.reconciliation_link_id as string, list);
  }

  const payments: ReconciledPaymentForClient[] = [];
  for (const link of links) {
    const movement = movementById.get(link.bank_movement_id);
    const receipt = receiptById.get(link.target_id);
    if (!movement || !receipt) continue;
    const appliedInvoices = allocationsByLinkId.get(link.id) ?? [];
    payments.push({
      movementId: link.bank_movement_id,
      movementDate: movement.movement_date,
      movementAmount: typeof movement.amount === "number" ? movement.amount : parseFloat(String(movement.amount)) || 0,
      currency: movement.currency,
      receiptId: link.target_id,
      receiptAmount: receipt.amount,
      level: appliedInvoices.length > 0 ? "full_reconciliation" : "reconciled_with_receipt",
      appliedInvoices,
      totalApplied: appliedInvoices.reduce((sum, a) => sum + a.appliedAmount, 0),
    });
  }
  return payments.sort((a, b) => b.movementDate.localeCompare(a.movementDate));
}
