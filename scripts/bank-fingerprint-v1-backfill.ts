#!/usr/bin/env node
/**
 * Backfill fingerprint_v1 / fingerprint_version on all bank_movements.
 * Safe / idempotent. Does not mark duplicates (use historical-dedupe-dry-run --apply).
 */
import { createClient } from "@supabase/supabase-js";

import { computeBankMovementFingerprintV1 } from "@/lib/bank-movements/bank-movement-fingerprint-v1";

function extractAccountNumber(accountLabel: string | null): string {
  return accountLabel?.match(/(\d{6,})/)?.[1] ?? "";
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Faltan env vars Supabase");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("bank_movements")
    .select(
      "id, workspace_id, movement_date, amount, currency, direction, bank_reference, description, account_label, bank_name, excluded_from_operations, duplicate_of, fingerprint_v1"
    )
    .limit(20000);
  if (error) throw error;

  let updated = 0;
  let skipped = 0;
  const byFp = new Map<string, string[]>();

  for (const row of data ?? []) {
    const fp = computeBankMovementFingerprintV1({
      workspaceId: row.workspace_id as string,
      accountNumber: extractAccountNumber(row.account_label as string | null),
      bankName: row.bank_name as string,
      bankReference: row.bank_reference as string | null,
      movementDate: row.movement_date as string,
      amount: Number(row.amount),
      currency: row.currency as string,
      direction: row.direction as string,
      description: row.description as string,
    }).fingerprint;

    const ids = byFp.get(fp) ?? [];
    ids.push(row.id as string);
    byFp.set(fp, ids);

    if (row.fingerprint_v1 === fp) {
      skipped += 1;
      continue;
    }
    const { error: updErr } = await sb
      .from("bank_movements")
      .update({ fingerprint_v1: fp, fingerprint_version: 1 })
      .eq("id", row.id as string);
    if (updErr) throw updErr;
    updated += 1;
  }

  let operationalCollisions = 0;
  for (const ids of byFp.values()) {
    if (ids.length < 2) continue;
    const members = (data ?? []).filter((r) => ids.includes(r.id as string));
    const active = members.filter((m) => !m.excluded_from_operations && !m.duplicate_of);
    if (active.length > 1) operationalCollisions += 1;
  }

  console.log(JSON.stringify({ updated, skipped, groups: byFp.size, operationalCollisions }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
