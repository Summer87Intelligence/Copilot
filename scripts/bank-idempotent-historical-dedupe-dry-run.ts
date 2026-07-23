#!/usr/bin/env node
/**
 * FASE BANK-IDEMPOTENT-IMPORT-CLIENT-BANKING-HISTORY-001
 * Dry-run de duplicados historicos por fingerprint_v1.
 *
 *   node --env-file=.env.local --import tsx scripts/bank-idempotent-historical-dedupe-dry-run.ts
 *   node --env-file=.env.local --import tsx scripts/bank-idempotent-historical-dedupe-dry-run.ts --apply
 *
 * Sin --apply: solo escribe .agents/qa-bank-idempotent-dedupe-dry-run.json
 * Con --apply: marca A/B (exact/cross-parser) como excluded_from_operations + duplicate_of.
 * Nunca DELETE fisico. Nunca resuelve conflictos de cliente distintos.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { computeBankMovementFingerprintV1 } from "@/lib/bank-movements/bank-movement-fingerprint-v1";

type MovementRow = {
  id: string;
  workspace_id: string;
  movement_date: string;
  amount: number | string;
  currency: string;
  direction: string;
  bank_reference: string | null;
  description: string;
  account_label: string | null;
  bank_name: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  fingerprint_v1: string | null;
  excluded_from_operations: boolean | null;
  duplicate_of: string | null;
};

function extractAccountNumber(accountLabel: string | null): string {
  return accountLabel?.match(/(\d{6,})/)?.[1] ?? "";
}

function classifyGroup(members: MovementRow[]): "A" | "B" | "C" | "D" {
  const refs = new Set(
    members.map((m) => (m.bank_reference ?? "").trim().toUpperCase().replace(/\s+/g, "")).filter(Boolean)
  );
  const parsers = new Set(
    members.map((m) => String((m.metadata ?? {}).parser ?? (m.metadata ?? {}).source_parser ?? ""))
  );
  if (refs.size === 1 && refs.values().next().value) {
    return parsers.size > 1 ? "B" : "A";
  }
  if (refs.size === 0) return "C";
  return "D";
}

async function loadActiveClient(
  sb: { from: (table: string) => any },
  movementId: string
): Promise<string | null> {
  const { data } = await sb
    .from("bank_movement_client_identifications")
    .select("client_company_id, status")
    .eq("movement_id", movementId)
    .neq("status", "excluded")
    .neq("status", "revoked")
    .limit(1);
  const row = data?.[0] as { client_company_id?: string } | undefined;
  return row?.client_company_id ?? null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const apply = process.argv.includes("--apply");
  if (!url || !key) {
    console.error("Faltan env vars Supabase");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("bank_movements")
    .select(
      "id, workspace_id, movement_date, amount, currency, direction, bank_reference, description, account_label, bank_name, created_at, metadata, fingerprint_v1, excluded_from_operations, duplicate_of"
    )
    .limit(20000);

  let rows = (data ?? []) as MovementRow[];
  if (error) {
    const legacy = await sb
      .from("bank_movements")
      .select(
        "id, workspace_id, movement_date, amount, currency, direction, bank_reference, description, account_label, bank_name, created_at, metadata"
      )
      .limit(20000);
    if (legacy.error) throw legacy.error;
    rows = (legacy.data ?? []).map((r) => ({
      ...(r as Omit<MovementRow, "fingerprint_v1" | "excluded_from_operations" | "duplicate_of">),
      fingerprint_v1: null,
      excluded_from_operations: null,
      duplicate_of: null,
    }));
  }

  const byFp = new Map<string, MovementRow[]>();
  for (const row of rows) {
    const fp =
      row.fingerprint_v1 ||
      computeBankMovementFingerprintV1({
        workspaceId: row.workspace_id,
        accountNumber: extractAccountNumber(row.account_label),
        bankName: row.bank_name,
        bankReference: row.bank_reference,
        movementDate: row.movement_date,
        amount: Number(row.amount),
        currency: row.currency,
        direction: row.direction,
        description: row.description,
      }).fingerprint;
    const list = byFp.get(fp) ?? [];
    list.push(row);
    byFp.set(fp, list);
  }

  const groups = [...byFp.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([fingerprint, members]) => {
      const sorted = [...members].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const canonical = sorted[0]!;
      const copies = sorted.slice(1);
      const clazz = classifyGroup(sorted);
      return {
        fingerprint,
        class: clazz,
        canonical_movement_id: canonical.id,
        copy_ids: copies.map((c) => c.id),
        movement_date: canonical.movement_date,
        amount: Number(canonical.amount),
        currency: canonical.currency,
        direction: canonical.direction,
        bank_reference: canonical.bank_reference,
        description: canonical.description.slice(0, 120),
        member_count: sorted.length,
        already_excluded: sorted.filter((m) => m.excluded_from_operations || m.duplicate_of).length,
      };
    });

  const exact = groups.filter((g) => g.class === "A" || g.class === "B");
  const ambiguous = groups.filter((g) => g.class === "C" || g.class === "D");

  const report = {
    generated_at: new Date().toISOString(),
    apply,
    totals: {
      movements: rows.length,
      collision_groups: groups.length,
      exact_or_cross_parser: exact.length,
      ambiguous: ambiguous.length,
    },
    exact,
    ambiguous,
    report_hash: createHash("sha256").update(JSON.stringify(exact)).digest("hex").slice(0, 16),
  };

  mkdirSync(".agents", { recursive: true });
  writeFileSync(".agents/qa-bank-idempotent-dedupe-dry-run.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.totals, null, 2));

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to mark A/B (reversible).");
    return;
  }

  let updated = 0;
  let skippedConflict = 0;
  for (const group of exact) {
    if (group.already_excluded >= group.copy_ids.length) continue;
    for (const copyId of group.copy_ids) {
      const copyClient = await loadActiveClient(sb, copyId);
      const canonClient = await loadActiveClient(sb, group.canonical_movement_id);
      if (copyClient && canonClient && copyClient !== canonClient) {
        skippedConflict += 1;
        continue;
      }
      const row = rows.find((r) => r.id === copyId);
      const meta = { ...(row?.metadata ?? {}) };
      meta.duplicate_status = "duplicate_of_import";
      meta.duplicate_of = group.canonical_movement_id;
      meta.canonical_reason = "earliest_created";
      meta.duplicate_reason = group.class === "B" ? "cross_parser" : "exact";
      meta.detected_at = new Date().toISOString();
      meta.fingerprint_v1 = group.fingerprint;
      const { error: updErr } = await sb
        .from("bank_movements")
        .update({
          metadata: meta,
          duplicate_of: group.canonical_movement_id,
          excluded_from_operations: true,
          fingerprint_v1: group.fingerprint,
          fingerprint_version: 1,
        })
        .eq("id", copyId);
      if (!updErr) updated += 1;
    }
    await sb
      .from("bank_movements")
      .update({ fingerprint_v1: group.fingerprint, fingerprint_version: 1 })
      .eq("id", group.canonical_movement_id);
  }

  console.log(JSON.stringify({ updated, skippedConflict }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
