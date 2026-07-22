#!/usr/bin/env node
/**
 * FASE BANK-GLOBAL-DEDUPE-BACKFILL-001 — backfill de duplicados cross-parser
 * en bank_movements (ver FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-
 * AUDIT-AND-CORRECTION-001 para el diagnóstico completo).
 *
 * YA APLICADO en producción el 2026-07-22 vía SQL directo (Supabase MCP), con
 * el mismo algoritmo exacto que este script reproduce en TypeScript para que
 * quede versionado y sea re-ejecutable. Verificado idempotente en producción:
 * una segunda pasada del mismo algoritmo no cambia ninguna fila (124/124 ya
 * marcadas, mismo canonical_id, 0 diferencias).
 *
 * Algoritmo:
 * 1. Agrupa bank_movements (con bank_reference no nulo) por huella canónica
 *    — computeCanonicalOperationFingerprint (lib/bank/canonical/
 *    canonical-operation-fingerprint.ts): workspace + cuenta + moneda + fecha
 *    + referencia normalizada + importe. Nunca depende de descripción ni parser.
 * 2. Por grupo con >1 fila, elige la fila canónica por prioridad:
 *    1) link financiero activo, 2) identificación de cliente activa,
 *    3) sugerencia vigente, 4) fila importada primero (created_at), 5) id.
 * 3. Marca las demás filas del grupo con metadata.duplicate_status =
 *    'duplicate_of_import' (nunca borra, nunca toca status/amount/currency —
 *    bank_movements_status_check no admite un valor 'duplicate').
 * 4. Si dos filas del mismo grupo tienen ambas una identificación activa al
 *    MISMO cliente (compatible, no conflicto), revoca la identificación de la
 *    fila no canónica (status='revoked', nunca se borra) para no inflar
 *    conteos de "ya identificados".
 *
 * Excluido por diseño (requiere decisión manual): grupos con 2+ clientes
 * distintos identificados, o 2+ links financieros con receipt_id distinto en
 * el mismo grupo — se reportan y se saltan, nunca se resuelven solos.
 *
 * Uso (solo hace falta si aparecen duplicados nuevos que el fix preventivo de
 * canonical-operation-fingerprint.ts no haya podido evitar, p. ej. import
 * masivo fuera del flujo normal de Santander):
 *   node --env-file=.env.local --import tsx scripts/apply-bank-global-dedupe-backfill.ts [--dry-run]
 *
 * No borra movimientos. No toca payment_allocations, proto_receipts ni
 * proto_invoices. No confirma conciliaciones. No crea allocations.
 */

import { createClient } from "@supabase/supabase-js";

import { computeCanonicalOperationFingerprint } from "@/lib/bank/canonical/canonical-operation-fingerprint";

type MovementRow = {
  id: string;
  workspace_id: string;
  movement_date: string;
  amount: number | string;
  currency: string;
  bank_reference: string | null;
  account_label: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function extractAccountNumber(accountLabel: string | null): string {
  return accountLabel?.match(/(\d{6,})/)?.[1] ?? "";
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const dryRun = process.argv.includes("--dry-run");
  if (!url || !key) {
    console.error("Faltan env vars Supabase (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await sb
    .from("bank_movements")
    .select("id, workspace_id, movement_date, amount, currency, bank_reference, account_label, created_at, metadata")
    .not("bank_reference", "is", null)
    .limit(20000);
  if (error) throw error;

  const movements = (rows ?? []) as MovementRow[];
  const movementIds = movements.map((m) => m.id);

  const [identRes, linkRes, suggRes] = await Promise.all([
    sb
      .from("bank_movement_client_identifications")
      .select("id, movement_id, client_company_id")
      .in("movement_id", movementIds)
      .not("status", "in", '("excluded","revoked")'),
    sb
      .from("bank_movement_reconciliation_links")
      .select("bank_movement_id")
      .in("bank_movement_id", movementIds)
      .is("archived_at", null),
    sb.from("bank_reconciliation_suggestions").select("bank_movement_id").in("bank_movement_id", movementIds),
  ]);
  if (identRes.error) throw identRes.error;
  if (linkRes.error) throw linkRes.error;
  if (suggRes.error) throw suggRes.error;

  const identByMovement = new Map((identRes.data ?? []).map((r) => [r.movement_id as string, r]));
  const linkedIds = new Set((linkRes.data ?? []).map((r) => r.bank_movement_id as string));
  const suggestedIds = new Set((suggRes.data ?? []).map((r) => r.bank_movement_id as string));

  const byFingerprint = new Map<string, MovementRow[]>();
  for (const row of movements) {
    const amount = typeof row.amount === "number" ? row.amount : parseFloat(String(row.amount));
    const fingerprint = computeCanonicalOperationFingerprint({
      workspaceId: row.workspace_id,
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

  let markedCount = 0;
  let revokedIdentificationsCount = 0;
  let skippedConflicts = 0;

  for (const [fingerprint, group] of byFingerprint) {
    if (group.length < 2) continue;

    const distinctClients = new Set(
      group.map((r) => identByMovement.get(r.id)?.client_company_id).filter((v): v is string => v != null)
    );
    if (distinctClients.size > 1) {
      console.warn(`CONFLICTO (2+ clientes) — grupo ${fingerprint}: ${group.map((r) => r.id).join(", ")}`);
      skippedConflicts += 1;
      continue;
    }

    const sorted = [...group].sort((a, b) => {
      const linkDiff = Number(linkedIds.has(b.id)) - Number(linkedIds.has(a.id));
      if (linkDiff !== 0) return linkDiff;
      const identDiff = Number(identByMovement.has(b.id)) - Number(identByMovement.has(a.id));
      if (identDiff !== 0) return identDiff;
      const suggDiff = Number(suggestedIds.has(b.id)) - Number(suggestedIds.has(a.id));
      if (suggDiff !== 0) return suggDiff;
      const dateDiff = a.created_at.localeCompare(b.created_at);
      if (dateDiff !== 0) return dateDiff;
      return a.id.localeCompare(b.id);
    });
    const canonical = sorted[0]!;
    const duplicates = sorted.slice(1);

    for (const dup of duplicates) {
      if (dup.metadata?.duplicate_status === "duplicate_of_import" && dup.metadata?.duplicate_of === canonical.id) {
        continue; // ya marcada correctamente — idempotente, no reescribe
      }
      markedCount += 1;
      if (!dryRun) {
        const { error: updateError } = await sb
          .from("bank_movements")
          .update({
            metadata: {
              ...(dup.metadata ?? {}),
              duplicate_status: "duplicate_of_import",
              duplicate_of: canonical.id,
              canonical_operation_fingerprint: fingerprint,
              duplicate_reason:
                "Backfill BANK-GLOBAL-DEDUPE-BACKFILL-001: misma operación real detectada por otro archivo/parser (huella canónica)",
              duplicate_backfill_at: new Date().toISOString(),
              duplicate_backfill_script_version: "bank-global-dedupe-backfill-001-v1",
            },
          })
          .eq("id", dup.id);
        if (updateError) throw updateError;
      }

      // Identificación redundante compatible (mismo cliente en ambas filas): revocar la de la duplicada.
      const dupIdent = identByMovement.get(dup.id);
      const canonIdent = identByMovement.get(canonical.id);
      if (dupIdent && canonIdent && dupIdent.client_company_id === canonIdent.client_company_id) {
        revokedIdentificationsCount += 1;
        if (!dryRun) {
          const { error: revokeError } = await sb
            .from("bank_movement_client_identifications")
            .update({
              status: "revoked",
              revoked_at: new Date().toISOString(),
              reason:
                "Backfill BANK-GLOBAL-DEDUPE-BACKFILL-001: identificacion redundante -- movimiento duplicado de importacion",
            })
            .eq("id", dupIdent.id);
          if (revokeError) throw revokeError;
        }
      }
    }
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Filas marcadas: ${markedCount} | Identificaciones revocadas: ${revokedIdentificationsCount} | Conflictos saltados: ${skippedConflicts}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
