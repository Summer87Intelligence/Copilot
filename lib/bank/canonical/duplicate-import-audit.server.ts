import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeCanonicalOperationFingerprint } from "@/lib/bank/canonical/canonical-operation-fingerprint";

/**
 * FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001
 * Auditoría 100% de lectura de duplicados YA EXISTENTES en `bank_movements`:
 * agrupa por huella canónica (independiente del parser) y, para cada grupo,
 * propone cuál fila es la canónica y cuáles son duplicados técnicos.
 *
 * Nunca escribe nada. Es la base del dry-run de la Sección 13 — el backfill
 * real (marcar duplicados, excluirlos de conteos en DB) requiere autorización
 * explícita en una fase posterior.
 *
 * Selección de fila canónica (en este orden): si un duplicado del grupo ya
 * tiene un link financiero real, o una sugerencia, o una identificación de
 * cliente activa, esa fila gana — nunca se "resuelve" automáticamente un
 * duplicado que ya tiene asociaciones reales transfiriéndolas a otra fila.
 * Sin asociaciones en ningún miembro del grupo, gana la fila importada primero.
 */
export type DuplicateGroupAudit = {
  fingerprint: string;
  movementIds: string[];
  canonicalMovementId: string;
  duplicateMovementIds: string[];
  canonicalReason: "has_link" | "has_suggestion" | "has_identification" | "earliest_created";
  movementDate: string;
  amount: number;
  currency: string;
  bankReference: string;
};

type MovementAuditRow = {
  id: string;
  movement_date: string;
  amount: number | string;
  currency: string;
  bank_reference: string | null;
  account_label: string | null;
  created_at: string;
};

function extractAccountNumber(accountLabel: string | null): string {
  return accountLabel?.match(/(\d{6,})/)?.[1] ?? "";
}

/**
 * Audita duplicados en una ventana de fechas para todo el workspace. 4
 * consultas batch fijas (movimientos, identificaciones, links, sugerencias),
 * nunca 1 por fila ni por grupo.
 */
export async function auditDuplicateBankMovements(
  supabase: SupabaseClient,
  workspaceId: string,
  dateFrom: string,
  dateTo: string
): Promise<DuplicateGroupAudit[]> {
  const { data, error } = await supabase
    .from("bank_movements")
    .select("id, movement_date, amount, currency, bank_reference, account_label, created_at")
    .eq("workspace_id", workspaceId)
    .not("bank_reference", "is", null)
    .gte("movement_date", dateFrom)
    .lte("movement_date", dateTo)
    .limit(20000);
  if (error) throw new Error(`DUPLICATE_AUDIT_MOVEMENTS_FAILED: ${error.message}`);

  const rows = (data ?? []) as MovementAuditRow[];
  if (rows.length === 0) return [];

  const movementIds = rows.map((r) => r.id);
  const [identRes, linkRes, suggRes] = await Promise.all([
    supabase
      .from("bank_movement_client_identifications")
      .select("movement_id")
      .eq("workspace_id", workspaceId)
      .in("movement_id", movementIds)
      .not("status", "in", '("excluded","revoked")'),
    supabase
      .from("bank_movement_reconciliation_links")
      .select("bank_movement_id")
      .eq("workspace_id", workspaceId)
      .in("bank_movement_id", movementIds)
      .is("archived_at", null),
    supabase
      .from("bank_reconciliation_suggestions")
      .select("bank_movement_id")
      .eq("workspace_id", workspaceId)
      .in("bank_movement_id", movementIds),
  ]);
  if (identRes.error) throw new Error(`DUPLICATE_AUDIT_IDENTIFICATIONS_FAILED: ${identRes.error.message}`);
  if (linkRes.error) throw new Error(`DUPLICATE_AUDIT_LINKS_FAILED: ${linkRes.error.message}`);
  if (suggRes.error) throw new Error(`DUPLICATE_AUDIT_SUGGESTIONS_FAILED: ${suggRes.error.message}`);

  const identifiedIds = new Set((identRes.data ?? []).map((r) => r.movement_id as string));
  const linkedIds = new Set((linkRes.data ?? []).map((r) => r.bank_movement_id as string));
  const suggestedIds = new Set((suggRes.data ?? []).map((r) => r.bank_movement_id as string));

  const byFingerprint = new Map<string, MovementAuditRow[]>();
  for (const row of rows) {
    const amount = typeof row.amount === "number" ? row.amount : parseFloat(String(row.amount));
    const fingerprint = computeCanonicalOperationFingerprint({
      workspaceId,
      accountNumber: extractAccountNumber(row.account_label),
      bankReference: row.bank_reference,
      movementDate: row.movement_date,
      amount,
      currency: row.currency,
    });
    if (!fingerprint) continue;
    const list = byFingerprint.get(fingerprint) ?? [];
    list.push(row);
    byFingerprint.set(fingerprint, list);
  }

  const groups: DuplicateGroupAudit[] = [];
  for (const [fingerprint, list] of byFingerprint) {
    if (list.length < 2) continue;

    const withLink = list.find((r) => linkedIds.has(r.id));
    const withSuggestion = !withLink ? list.find((r) => suggestedIds.has(r.id)) : undefined;
    const withIdentification = !withLink && !withSuggestion ? list.find((r) => identifiedIds.has(r.id)) : undefined;
    const earliest = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!;

    const canonical = withLink ?? withSuggestion ?? withIdentification ?? earliest;
    const reason: DuplicateGroupAudit["canonicalReason"] = withLink
      ? "has_link"
      : withSuggestion
        ? "has_suggestion"
        : withIdentification
          ? "has_identification"
          : "earliest_created";

    groups.push({
      fingerprint,
      movementIds: list.map((r) => r.id),
      canonicalMovementId: canonical.id,
      duplicateMovementIds: list.map((r) => r.id).filter((id) => id !== canonical.id),
      canonicalReason: reason,
      movementDate: canonical.movement_date,
      amount: typeof canonical.amount === "number" ? canonical.amount : parseFloat(String(canonical.amount)),
      currency: canonical.currency,
      bankReference: canonical.bank_reference ?? "",
    });
  }

  return groups;
}
